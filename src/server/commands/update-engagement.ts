import { and, eq, inArray, sql } from "drizzle-orm";

import { UpdateEngagementCommand, type EngagementUpdated } from "../../contracts/engagement";
import { addDays, compareLocalDate, parseLocalDate, type LocalDate } from "../../domain/local-date";
import {
  applyDayOverrides,
  deriveDefaultWorkdays,
  DomainRuleError,
} from "../../domain/workday-derivation";
import { recordAudit } from "../audit/audit-log";
import type { Clock } from "../clock/clock";
import { withTransaction, type Transaction } from "../db/client";
import {
  dayResourceAllocations,
  dayTeamMembers,
  employees,
  engagements,
  resources,
  worksiteDayConfigurations,
  worksiteDays,
} from "../db/schema";
import { engagementVersionToken } from "../queries/engagement-detail";
import { notFound, parseInput, type CommandDeps } from "./command-deps";

export interface UpdateEngagementDeps extends CommandDeps {
  readonly clock: Clock;
}

/**
 * Test-Hook fuer die Fehlerinjektion - wie bei `createEngagement` und aus
 * demselben Grund: der Rollback laesst sich sonst nur behaupten, nicht zeigen.
 * Im Produktionspfad wird `hooks` nie gesetzt.
 */
export interface UpdateEngagementHooks {
  readonly afterDaysInserted?: () => Promise<void>;
}

const OPERATION = "update_engagement";

/**
 * Ausgangskonfiguration, wie sie `createEngagement` in
 * `engagements.initial_configuration` abgelegt hat.
 */
interface InitialConfiguration {
  readonly employeeIds?: readonly string[];
  readonly resourceIds?: readonly string[];
  readonly plannedStart?: string | null;
  readonly plannedEnd?: string | null;
}

/**
 * Prueft, dass jede Id zum Mandanten gehoert (REQ-E07).
 *
 * Der Fremdschluessel allein genuegt nicht: er belegt nur, dass die Zeile
 * existiert, nicht dass sie UNS gehoert. Ohne diese Pruefung koennte eine
 * Ausgangskonfiguration Tage mit fremden Personen materialisieren.
 */
async function assertOwnedIds(
  tx: Transaction,
  orgId: string,
  ids: readonly string[],
  table: typeof employees | typeof resources,
  bezeichnung: string,
): Promise<void> {
  const eindeutige = [...new Set(ids)];

  if (eindeutige.length === 0) {
    return;
  }

  const gefunden = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.orgId, orgId), inArray(table.id, eindeutige)));

  if (gefunden.length !== eindeutige.length) {
    const bekannt = new Set(gefunden.map((row) => row.id));
    const fehlend = eindeutige.filter((id) => !bekannt.has(id));

    throw notFound(bezeichnung, fehlend.join(", "));
  }
}

/**
 * Aendert Metadaten eines bestehenden Einsatzes und verlaengert ihn nach vorn.
 *
 * Kanonische Quelle ist Confluence 49119274 D-007 und Invariante 12. Drei
 * Aussagen daraus tragen diese Funktion:
 *
 * 1. Eine Verlaengerung fuegt NUR neue Tage DEMSELBEN Einsatz hinzu. Bestehende
 *    Baustellentage und ihre Revisionen werden nicht angefasst - dieser Code
 *    liest sie nicht einmal.
 * 2. Fuer neue Tage wird die persistierte AUSGANGSKONFIGURATION materialisiert.
 *    Ausdruecklich nicht der letzte bestehende Tag: der koennte individuell
 *    angepasst sein, und daraus zu raten verbietet D-007 woertlich.
 * 3. Es gibt keine Live-Vererbung. Eine Metadatenaenderung beruehrt keinen
 *    einzigen Tag.
 *
 * Verkuerzen, den Start verschieben und die Baustelle wechseln sind nicht
 * implementiert und auch nicht abgefangen - sie stehen gar nicht erst im
 * Vertrag (siehe `UpdateEngagementCommand`).
 *
 * Alles laeuft in EINER Transaktion: entweder Metadaten UND neue Tage, oder
 * nichts (REQ-E05).
 */
export async function updateEngagement(
  deps: UpdateEngagementDeps,
  input: unknown,
  hooks?: UpdateEngagementHooks,
): Promise<EngagementUpdated> {
  const command = parseInput(UpdateEngagementCommand, input);
  const today = deps.clock.todayLocal(deps.tenant.timeZone);

  return withTransaction(deps.db, async (tx) => {
    /*
     * `for update` VOR jeder Pruefung. Nur so ist die Versionspruefung eine
     * echte Sperre: ein zweiter Client wartet hier, bis der erste fertig ist,
     * und liest danach den NEUEN Token - statt beide den alten zu sehen und
     * beide zu schreiben.
     */
    const rows = await tx
      .select({
        id: engagements.id,
        worksiteId: engagements.worksiteId,
        startDate: engagements.startDate,
        endDate: engagements.endDate,
        planningHorizonDate: engagements.planningHorizonDate,
        initialConfiguration: engagements.initialConfiguration,
        version: engagementVersionToken(),
      })
      .from(engagements)
      .where(and(eq(engagements.id, command.id), eq(engagements.orgId, deps.tenant.orgId)))
      .for("update");

    const einsatz = rows[0];

    if (einsatz === undefined) {
      // Auch ein Einsatz eines fremden Mandanten endet hier - nicht als
      // "verboten", sondern als "gibt es nicht" (keine Existenzauskunft).
      throw notFound("Einsatz", command.id);
    }

    if (einsatz.version !== command.expectedUpdatedAt) {
      throw new DomainRuleError(
        "ENGAGEMENT_VERSION_CONFLICT",
        "Der Einsatz wurde zwischenzeitlich von anderer Stelle geaendert. Bitte neu laden und die Aenderung erneut pruefen.",
      );
    }

    const istOffen = einsatz.endDate === null;
    const bisherigesEndeRoh = einsatz.endDate ?? einsatz.planningHorizonDate;

    if (bisherigesEndeRoh === null) {
      // Die Datenbank schliesst das per CHECK aus; faende sich doch so eine
      // Zeile, waere Weiterrechnen schlimmer als ein ehrlicher Abbruch.
      throw new DomainRuleError(
        "PLANNING_HORIZON_REQUIRED",
        `Der Einsatz ${command.id} hat weder Enddatum noch Planungshorizont.`,
      );
    }

    if (istOffen && command.endDate !== undefined) {
      throw new DomainRuleError(
        "ENGAGEMENT_PERIOD_MODE_MISMATCH",
        "Dieser Einsatz hat ein offenes Ende. Er wird ueber einen spaeteren Planungshorizont ergaenzt, nicht ueber ein Enddatum.",
      );
    }

    if (!istOffen && command.planningHorizonDate !== undefined) {
      throw new DomainRuleError(
        "ENGAGEMENT_PERIOD_MODE_MISMATCH",
        "Dieser Einsatz hat ein fachliches Enddatum. Ein Planungshorizont gilt nur fuer Einsaetze mit offenem Ende.",
      );
    }

    const bisherigesEnde = parseLocalDate(bisherigesEndeRoh);
    const gewuenschtesEnde = istOffen ? command.planningHorizonDate : command.endDate;

    let neueTage: LocalDate[] = [];
    let verlaengert = false;

    if (gewuenschtesEnde !== undefined) {
      const ziel = parseLocalDate(gewuenschtesEnde);
      const richtung = compareLocalDate(ziel, bisherigesEnde);

      if (richtung < 0) {
        throw new DomainRuleError(
          "ENGAGEMENT_SHRINK_NOT_ALLOWED",
          `Der Einsatz reicht bereits bis zum ${bisherigesEnde}. Ein frueheres Ende wuerde bestehende Baustellentage betreffen und ist nicht freigegeben.`,
          { currentEnd: bisherigesEnde, requestedEnd: ziel },
        );
      }

      if (richtung > 0) {
        verlaengert = true;

        /*
         * Das Delta beginnt am Tag NACH dem bisherigen Ende. Damit kann diese
         * Ableitung per Konstruktion keinen bestehenden Tag treffen - die
         * Invariante "nur zusaetzliche Tage" haengt nicht an einer Pruefung,
         * sondern am Zuschnitt des Zeitraums.
         *
         * Dieselben Domain-Primitive wie bei der Anlage: Mo-Fr automatisch,
         * Wochenenden nur auf ausdrueckliche Zuwahl (D-005/D-006).
         */
        const period = { start: addDays(bisherigesEnde, 1), end: ziel };

        neueTage = applyDayOverrides(deriveDefaultWorkdays(period), {
          period,
          added: command.addedDays.map(parseLocalDate),
          removed: command.removedDays.map(parseLocalDate),
        });
      }
    }

    const addedWorksiteDayIds: string[] = [];
    const addedLocalDates: string[] = [];

    if (neueTage.length > 0) {
      // A-07/H-06: auch ein NEUER Tag darf nicht in der Vergangenheit entstehen.
      for (const tag of neueTage) {
        if (compareLocalDate(tag, today) < 0) {
          throw new DomainRuleError(
            "DAY_IN_PAST_LOCKED",
            `Der ${tag} liegt vor dem heutigen Datum. Rueckwirkende Aenderungen sind nicht freigegeben.`,
          );
        }
      }

      // D-008 wie bei der Anlage: der UNIQUE-Index traegt die Regel, diese
      // Abfrage existiert nur, damit der Fehler die Konflikttage benennt.
      const belegte = await tx
        .select({ localDate: worksiteDays.localDate })
        .from(worksiteDays)
        .where(
          and(
            eq(worksiteDays.orgId, deps.tenant.orgId),
            eq(worksiteDays.worksiteId, einsatz.worksiteId),
            inArray(worksiteDays.localDate, neueTage),
          ),
        );

      if (belegte.length > 0) {
        const konflikte = belegte.map((row) => row.localDate).sort();

        throw new DomainRuleError(
          "WORKSITE_DAY_ALREADY_PLANNED",
          `An dieser Baustelle sind folgende Tage bereits verplant: ${konflikte.join(", ")}.`,
          { conflictingDates: konflikte },
        );
      }

      const konfiguration = (einsatz.initialConfiguration ?? {}) as InitialConfiguration;
      const employeeIds = [...(konfiguration.employeeIds ?? [])];
      const resourceIds = [...(konfiguration.resourceIds ?? [])];

      await assertOwnedIds(tx, deps.tenant.orgId, employeeIds, employees, "Mitarbeitende Person");
      await assertOwnedIds(tx, deps.tenant.orgId, resourceIds, resources, "Ressource");

      const dayRows = await tx
        .insert(worksiteDays)
        .values(
          neueTage.map((date) => ({
            orgId: deps.tenant.orgId,
            worksiteId: einsatz.worksiteId,
            engagementId: einsatz.id,
            localDate: date,
          })),
        )
        .returning({ id: worksiteDays.id, localDate: worksiteDays.localDate });

      await hooks?.afterDaysInserted?.();

      const configRows = await tx
        .insert(worksiteDayConfigurations)
        .values(
          dayRows.map((day) => ({
            orgId: deps.tenant.orgId,
            worksiteDayId: day.id,
            // Ein ergaenzter Tag ist ein frisch materialisierter Tag, kein
            // bearbeiteter - deshalb Revision 1 und origin "materialized".
            revisionNo: 1,
            origin: "materialized" as const,
            plannedStartTime: konfiguration.plannedStart ?? null,
            plannedEndTime: konfiguration.plannedEnd ?? null,
            correlationId: deps.correlationId ?? null,
          })),
        )
        .returning({ id: worksiteDayConfigurations.id });

      if (employeeIds.length > 0) {
        await tx.insert(dayTeamMembers).values(
          configRows.flatMap((config) =>
            employeeIds.map((employeeId) => ({
              orgId: deps.tenant.orgId,
              configurationId: config.id,
              employeeId,
            })),
          ),
        );
      }

      if (resourceIds.length > 0) {
        await tx.insert(dayResourceAllocations).values(
          configRows.flatMap((config) =>
            resourceIds.map((resourceId) => ({
              orgId: deps.tenant.orgId,
              configurationId: config.id,
              resourceId,
            })),
          ),
        );
      }

      addedWorksiteDayIds.push(...dayRows.map((day) => day.id));
      addedLocalDates.push(...dayRows.map((day) => day.localDate));
    }

    // Nur genannte Felder aendern; ein weggelassenes bleibt unberuehrt.
    const changes: Record<string, unknown> = {};

    if (command.title !== undefined) changes.title = command.title;
    if (command.description !== undefined) changes.description = command.description;
    if (command.colourKey !== undefined) changes.colourKey = command.colourKey;

    if (verlaengert && gewuenschtesEnde !== undefined) {
      if (istOffen) {
        // Der Horizont ist NICHT das fachliche Ende und setzt end_date nicht
        // still (D-006).
        changes.planningHorizonDate = gewuenschtesEnde;
      } else {
        changes.endDate = gewuenschtesEnde;
      }
    }

    if (Object.keys(changes).length === 0) {
      // Nichts zu tun: kein Schreibvorgang, kein Audit-Eintrag ueber ein
      // Ereignis, das nicht stattgefunden hat, und derselbe Token bleibt gueltig.
      return {
        engagementId: einsatz.id,
        updatedAt: einsatz.version,
        addedWorksiteDayIds,
        addedLocalDates,
      };
    }

    const [aktualisiert] = await tx
      .update(engagements)
      .set({
        ...changes,
        /*
         * STRENG steigend, nicht nur "jetzt": zwei Aenderungen innerhalb
         * derselben Mikrosekunde ergaeben sonst denselben Token, und der
         * veraltete Stand eines zweiten Clients kaeme durch. `clock_timestamp()`
         * statt `now()`, weil `now()` die TRANSAKTIONSZEIT liefert - zwei
         * gleichzeitig gestartete Transaktionen haetten dieselbe.
         */
        updatedAt: sql`greatest(clock_timestamp(), ${engagements.updatedAt} + interval '1 microsecond')`,
      })
      .where(and(eq(engagements.id, einsatz.id), eq(engagements.orgId, deps.tenant.orgId)))
      .returning({ version: engagementVersionToken() });

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: OPERATION,
      subjectId: einsatz.id,
      // Nur die NAMEN der geaenderten Felder und die Zahl der neuen Tage -
      // keine vollstaendigen Nutzdaten im Log (REQ-E06).
      payload: {
        changedFields: Object.keys(changes).sort(),
        addedDayCount: addedLocalDates.length,
        ...(addedLocalDates.length === 0
          ? {}
          : { addedFrom: addedLocalDates[0], addedTo: addedLocalDates.at(-1) }),
      },
      correlationId: deps.correlationId,
    });

    return {
      engagementId: einsatz.id,
      updatedAt: aktualisiert!.version,
      addedWorksiteDayIds,
      addedLocalDates,
    };
  });
}
