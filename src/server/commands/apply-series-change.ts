import { DayChangeCommand, type DayChangeResult } from "../../contracts/day-change";
import { DomainRuleError } from "../../domain/workday-derivation";
import { recordAudit } from "../audit/audit-log";
import { withTransaction } from "../db/client";
import { readSeriesPreview } from "./preview-series-change";
import { parseInput, type CommandDeps } from "./command-deps";
import {
  assertNotInPast,
  lockDayAndReadCurrent,
  writeNextRevision,
  type DayCommandDeps,
} from "./update-worksite-day";

export interface ApplySeriesHooks {
  /** Test-Hook fuer die Fehlerinjektion; im Produktionspfad nie gesetzt. */
  readonly beforeDay?: (worksiteDayId: string, index: number) => Promise<void>;
}

/**
 * Wendet eine Aenderung auf den adressierten Tag und seine Folgetage an.
 *
 * Individuell angepasste Tage (origin = "day_edit") sind standardmaessig
 * AUSGESCHLOSSEN und werden nur einbezogen, wenn sie ausdruecklich in
 * includeAdjustedDayIds stehen (A-06, PROTOTYPE_ONLY / OQ-001). Ein stilles
 * Ueberschreiben waere ein Anti-Drift-Verstoss.
 *
 * Alles laeuft in EINER Transaktion: entweder alle Zieltage bekommen ihre neue
 * Revision oder keiner. Die Tage werden nach ID aufsteigend gesperrt - eine
 * deterministische Reihenfolge verhindert Deadlocks zwischen gleichzeitigen
 * Serienaenderungen.
 */
export async function applySeriesChange(
  deps: DayCommandDeps & CommandDeps,
  input: unknown,
  hooks?: ApplySeriesHooks,
): Promise<DayChangeResult> {
  const command = parseInput(DayChangeCommand, input);

  if (command.scope !== "THIS_AND_FOLLOWING") {
    throw new DomainRuleError(
      "VALIDATION_FAILED",
      "applySeriesChange erwartet scope THIS_AND_FOLLOWING.",
    );
  }

  const today = deps.clock.todayLocal(deps.tenant.timeZone);

  return withTransaction(deps.db, async (tx) => {
    const vorschau = await readSeriesPreview(tx, deps, {
      worksiteDayId: command.worksiteDayId,
      includeAdjustedDayIds: command.includeAdjustedDayIds,
    });

    const anker = vorschau.rows.find((row) => row.worksiteDayId === command.worksiteDayId);

    if (anker === undefined) {
      throw new DomainRuleError(
        "VALIDATION_FAILED",
        "Der adressierte Tag liegt nicht in der aufgeloesten Serie.",
      );
    }

    if (anker.status === "past_locked") {
      assertNotInPast(anker.date, today);
    }

    // Deterministische Lock-Reihenfolge: aufsteigend nach ID.
    const zielIds = [...vorschau.targetIds].sort();
    const updatedDayIds: string[] = [];
    const newRevisions: { worksiteDayId: string; revisionNo: number }[] = [];

    for (const [index, worksiteDayId] of zielIds.entries()) {
      await hooks?.beforeDay?.(worksiteDayId, index);

      const { localDate, current } = await lockDayAndReadCurrent(
        tx,
        deps.tenant.orgId,
        worksiteDayId,
      );

      assertNotInPast(localDate, today);

      if (
        worksiteDayId === command.worksiteDayId &&
        current.revisionNo !== command.expectedRevisionNo
      ) {
        throw new DomainRuleError(
          "STALE_REVISION",
          `Der Tag wurde zwischenzeitlich geaendert (Revision ${current.revisionNo}, erwartet ${command.expectedRevisionNo}).`,
        );
      }

      const revisionNo = await writeNextRevision(
        tx,
        deps.tenant.orgId,
        worksiteDayId,
        current,
        command.changes,
        "series_edit",
        deps.correlationId,
      );

      updatedDayIds.push(worksiteDayId);
      newRevisions.push({ worksiteDayId, revisionNo });
    }

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: "apply_series_change",
      subjectId: vorschau.engagementId,
      payload: {
        fromDate: vorschau.fromDate,
        changedCount: updatedDayIds.length,
        excludedAdjusted: vorschau.rows
          .filter((row) => row.status === "adjusted_excluded")
          .map((row) => row.date),
      },
      correlationId: deps.correlationId,
    });

    return { updatedDayIds, newRevisions };
  });
}
