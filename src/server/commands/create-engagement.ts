import { and, eq, inArray } from "drizzle-orm";

import { validateEngagementPeriod } from "../../domain/engagement-rules";
import { parseLocalDate, type LocalDate } from "../../domain/local-date";
import { DomainRuleError } from "../../domain/workday-derivation";
import { CreateEngagementCommand, type EngagementCreated } from "../../contracts/engagement";
import { recordAudit } from "../audit/audit-log";
import {
  fingerprintOf,
  findIdempotencyRecord,
  lockIdempotencyKey,
  rememberIdempotencyRecord,
} from "../idempotency/idempotency-store";
import type { Clock } from "../clock/clock";
import { withTransaction, type Transaction } from "../db/client";
import {
  dayResourceAllocations,
  dayTeamMembers,
  engagements,
  worksiteDayConfigurations,
  worksiteDays,
} from "../db/schema";
import { parseInput, type CommandDeps } from "./command-deps";

export interface CreateEngagementDeps extends CommandDeps {
  readonly clock: Clock;
}

/**
 * Test-Hooks fuer die Fehlerinjektion. Sie existieren ausschliesslich, damit
 * Integrationstests den Rollback an einer definierten Stelle beweisen koennen;
 * im Produktionspfad wird `hooks` nie gesetzt.
 */
export interface CreateEngagementHooks {
  readonly afterDaysInserted?: () => Promise<void>;
}

export interface CreateEngagementOptions extends CreateEngagementHooks {
  /** Ohne Key wird nichts gespeichert und jeder Aufruf legt neu an. */
  readonly idempotencyKey?: string;
}

const OPERATION = "create_engagement";

/**
 * Erzeugt Einsatz, alle effektiven Baustellentage und je Tag die Revision 1 -
 * in EINER Transaktion. Es gibt keinen Zwischenzustand, in dem ein Einsatz
 * ohne seine Tage existiert (REQ-F-007, REQ-A-002).
 */
export async function createEngagement(
  deps: CreateEngagementDeps,
  input: unknown,
  options?: CreateEngagementOptions,
): Promise<EngagementCreated> {
  const command = parseInput(CreateEngagementCommand, input);
  const today = deps.clock.todayLocal(deps.tenant.timeZone);

  const period = validateEngagementPeriod(
    {
      startDate: parseLocalDate(command.startDate),
      endDate: command.endDate === undefined ? undefined : parseLocalDate(command.endDate),
      planningHorizonDate:
        command.planningHorizonDate === undefined
          ? undefined
          : parseLocalDate(command.planningHorizonDate),
      addedDays: command.addedDays.map(parseLocalDate),
      removedDays: command.removedDays.map(parseLocalDate),
    },
    today,
  );

  if (!period.ok) {
    // Der erste Code bestimmt den HTTP-Status; alle Codes stehen im Detail.
    throw new DomainRuleError(
      period.codes[0]!,
      `Der Zeitraum ist nicht gueltig: ${period.codes.join(", ")}.`,
    );
  }

  return withTransaction(deps.db, async (tx) => {
    if (options?.idempotencyKey === undefined) {
      return materialise(tx, deps, command, period.effectiveDays, options);
    }

    // Reihenfolge: erst sperren, dann nachsehen. Andersherum koennten zwei
    // gleichzeitige Anfragen beide "nichts gefunden" sehen und doppelt anlegen.
    await lockIdempotencyKey(tx, OPERATION, options.idempotencyKey);

    const ref = {
      orgId: deps.tenant.orgId,
      operation: OPERATION,
      key: options.idempotencyKey,
      fingerprint: fingerprintOf(command),
    };

    const gespeichert = await findIdempotencyRecord(tx, ref);

    if (gespeichert !== null) {
      return gespeichert.body as EngagementCreated;
    }

    const ergebnis = await materialise(tx, deps, command, period.effectiveDays, options);

    await rememberIdempotencyRecord(tx, { ...ref, status: 201, body: ergebnis });

    return ergebnis;
  });
}

async function materialise(
  tx: Transaction,
  deps: CreateEngagementDeps,
  command: ReturnType<typeof CreateEngagementCommand.parse>,
  days: LocalDate[],
  hooks: CreateEngagementHooks | undefined,
): Promise<EngagementCreated> {
  const [engagement] = await tx
    .insert(engagements)
    .values({
      orgId: deps.tenant.orgId,
      worksiteId: command.worksiteId,
      title: command.title,
      description: command.description ?? null,
      startDate: command.startDate,
      endDate: command.endDate ?? null,
      planningHorizonDate: command.planningHorizonDate ?? null,
      colourKey: command.colourKey,
      plannedStartTime: command.plannedStartTime ?? null,
      plannedEndTime: command.plannedEndTime ?? null,
      initialConfiguration: {
        employeeIds: command.employeeIds,
        resourceIds: command.resourceIds,
        plannedStart: command.plannedStartTime ?? null,
        plannedEnd: command.plannedEndTime ?? null,
      },
    })
    .returning({ id: engagements.id });

  const engagementId = engagement!.id;

  // D-008: hoechstens ein Einsatzkontext je Baustelle und lokalem Tag. Der
  // UNIQUE-Index in der Datenbank traegt die Regel; diese Abfrage existiert nur,
  // damit der Fehler die KONFLIKTTAGE benennen kann statt eines nackten 23505.
  // Der Index bleibt die letzte Instanz - zwischen Abfrage und Insert koennte
  // eine parallele Transaktion dazwischenkommen.
  const belegte = await tx
    .select({ localDate: worksiteDays.localDate })
    .from(worksiteDays)
    .where(
      and(
        eq(worksiteDays.orgId, deps.tenant.orgId),
        eq(worksiteDays.worksiteId, command.worksiteId),
        inArray(worksiteDays.localDate, days),
      ),
    );

  if (belegte.length > 0) {
    const konflikte = belegte.map((row) => row.localDate).sort();

    throw new DomainRuleError(
      "WORKSITE_DAY_ALREADY_PLANNED",
      `An dieser Baustelle sind folgende Tage bereits verplant: ${konflikte.join(", ")}.`,
    );
  }

  const dayRows = await tx
    .insert(worksiteDays)
    .values(
      days.map((date) => ({
        orgId: deps.tenant.orgId,
        worksiteId: command.worksiteId,
        engagementId,
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
        revisionNo: 1,
        origin: "materialized" as const,
        plannedStartTime: command.plannedStartTime ?? null,
        plannedEndTime: command.plannedEndTime ?? null,
        correlationId: deps.correlationId ?? null,
      })),
    )
    .returning({ id: worksiteDayConfigurations.id });

  if (command.employeeIds.length > 0) {
    await tx.insert(dayTeamMembers).values(
      configRows.flatMap((config) =>
        command.employeeIds.map((employeeId) => ({
          orgId: deps.tenant.orgId,
          configurationId: config.id,
          employeeId,
        })),
      ),
    );
  }

  if (command.resourceIds.length > 0) {
    await tx.insert(dayResourceAllocations).values(
      configRows.flatMap((config) =>
        command.resourceIds.map((resourceId) => ({
          orgId: deps.tenant.orgId,
          configurationId: config.id,
          resourceId,
        })),
      ),
    );
  }

  await recordAudit(tx, {
    orgId: deps.tenant.orgId,
    actor: deps.tenant.actor,
    operation: OPERATION,
    subjectId: engagementId,
    payload: { title: command.title, dayCount: dayRows.length },
    correlationId: deps.correlationId,
  });

  return {
    engagementId,
    worksiteDayIds: dayRows.map((day) => day.id),
    localDates: dayRows.map((day) => day.localDate),
  };
}
