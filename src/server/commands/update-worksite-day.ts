import { and, eq, isNull, sql } from "drizzle-orm";

import { DayChangeCommand, type DayChangeResult } from "../../contracts/day-change";
import { compareLocalDate, parseLocalDate } from "../../domain/local-date";
import { DomainRuleError } from "../../domain/workday-derivation";
import { recordAudit } from "../audit/audit-log";
import type { Clock } from "../clock/clock";
import { withTransaction, type Transaction } from "../db/client";
import {
  dayResourceAllocations,
  dayTeamMembers,
  worksiteDayConfigurations,
  worksiteDays,
} from "../db/schema";
import { notFound, parseInput, type CommandDeps } from "./command-deps";

export interface DayCommandDeps extends CommandDeps {
  readonly clock: Clock;
}

export interface CurrentConfiguration {
  readonly configurationId: string;
  readonly revisionNo: number;
  readonly plannedStartTime: string | null;
  readonly plannedEndTime: string | null;
  readonly note: string | null;
  readonly employeeIds: string[];
  readonly resourceIds: string[];
}

/**
 * Sperrt den Baustellentag und liest seine aktuelle Revision.
 *
 * `select ... for update` auf der worksite_days-Zeile ist der erste Schritt der
 * verbindlichen Reihenfolge aus Abschnitt 7. Aufsteigende ID-Reihenfolge beim
 * Sperren mehrerer Tage haelt die Lock-Reihenfolge deterministisch und
 * verhindert Deadlocks zwischen gleichzeitigen Serienaenderungen.
 */
export async function lockDayAndReadCurrent(
  tx: Transaction,
  orgId: string,
  worksiteDayId: string,
): Promise<{ localDate: string; current: CurrentConfiguration }> {
  const dayRows = await tx
    .select({ id: worksiteDays.id, localDate: worksiteDays.localDate })
    .from(worksiteDays)
    .where(and(eq(worksiteDays.id, worksiteDayId), eq(worksiteDays.orgId, orgId)))
    .for("update");

  const day = dayRows[0];

  if (day === undefined) {
    throw notFound("Baustellentag", worksiteDayId);
  }

  const configRows = await tx
    .select({
      id: worksiteDayConfigurations.id,
      revisionNo: worksiteDayConfigurations.revisionNo,
      plannedStartTime: worksiteDayConfigurations.plannedStartTime,
      plannedEndTime: worksiteDayConfigurations.plannedEndTime,
      note: worksiteDayConfigurations.note,
    })
    .from(worksiteDayConfigurations)
    .where(
      and(
        eq(worksiteDayConfigurations.worksiteDayId, worksiteDayId),
        isNull(worksiteDayConfigurations.supersededAt),
      ),
    );

  const config = configRows[0];

  if (config === undefined) {
    throw notFound("Tageskonfiguration", worksiteDayId);
  }

  const team = await tx
    .select({ employeeId: dayTeamMembers.employeeId })
    .from(dayTeamMembers)
    .where(eq(dayTeamMembers.configurationId, config.id));

  const ressourcen = await tx
    .select({ resourceId: dayResourceAllocations.resourceId })
    .from(dayResourceAllocations)
    .where(eq(dayResourceAllocations.configurationId, config.id));

  return {
    localDate: day.localDate,
    current: {
      configurationId: config.id,
      revisionNo: config.revisionNo,
      plannedStartTime: config.plannedStartTime,
      plannedEndTime: config.plannedEndTime,
      note: config.note,
      employeeIds: team.map((row) => row.employeeId),
      resourceIds: ressourcen.map((row) => row.resourceId),
    },
  };
}

export interface RevisionChanges {
  employeeIds?: string[];
  resourceIds?: string[];
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  note?: string | null;
}

/**
 * Schreibt eine neue Revision fuer genau einen Tag.
 *
 * VERBINDLICHE REIHENFOLGE (Abschnitt 7): erst die bisherige Revision
 * abloesen, dann die neue einfuegen. Umgekehrt verletzt der Insert den
 * Partial-Unique-Index worksite_day_configurations_one_current und PostgreSQL
 * meldet 23505 - der Index ist kein Constraint und damit nicht DEFERRABLE.
 */
export async function writeNextRevision(
  tx: Transaction,
  orgId: string,
  worksiteDayId: string,
  current: CurrentConfiguration,
  changes: RevisionChanges,
  origin: "day_edit" | "series_edit",
  correlationId: string | undefined,
): Promise<number> {
  await tx
    .update(worksiteDayConfigurations)
    .set({ supersededAt: sql`now()` })
    .where(
      and(
        eq(worksiteDayConfigurations.worksiteDayId, worksiteDayId),
        isNull(worksiteDayConfigurations.supersededAt),
      ),
    );

  const naechste = current.revisionNo + 1;

  const [neu] = await tx
    .insert(worksiteDayConfigurations)
    .values({
      orgId,
      worksiteDayId,
      revisionNo: naechste,
      origin,
      plannedStartTime:
        changes.plannedStartTime === undefined
          ? current.plannedStartTime
          : changes.plannedStartTime,
      plannedEndTime:
        changes.plannedEndTime === undefined ? current.plannedEndTime : changes.plannedEndTime,
      note: changes.note === undefined ? current.note : changes.note,
      correlationId: correlationId ?? null,
    })
    .returning({ id: worksiteDayConfigurations.id });

  const employeeIds = changes.employeeIds ?? current.employeeIds;
  const resourceIds = changes.resourceIds ?? current.resourceIds;

  if (employeeIds.length > 0) {
    await tx
      .insert(dayTeamMembers)
      .values(employeeIds.map((employeeId) => ({ orgId, configurationId: neu!.id, employeeId })));
  }

  if (resourceIds.length > 0) {
    await tx
      .insert(dayResourceAllocations)
      .values(resourceIds.map((resourceId) => ({ orgId, configurationId: neu!.id, resourceId })));
  }

  return naechste;
}

/** Wirft, wenn der Tag vor dem heutigen lokalen Datum liegt (A-07, OQ-002). */
export function assertNotInPast(localDate: string, today: string): void {
  if (compareLocalDate(parseLocalDate(localDate), parseLocalDate(today)) < 0) {
    throw new DomainRuleError(
      "DAY_IN_PAST_LOCKED",
      `Der ${localDate} liegt vor dem heutigen Datum. Rueckwirkende Aenderungen sind nicht freigegeben.`,
    );
  }
}

export async function updateWorksiteDay(
  deps: DayCommandDeps,
  input: unknown,
): Promise<DayChangeResult> {
  const command = parseInput(DayChangeCommand, input);
  const today = deps.clock.todayLocal(deps.tenant.timeZone);

  return withTransaction(deps.db, async (tx) => {
    const { localDate, current } = await lockDayAndReadCurrent(
      tx,
      deps.tenant.orgId,
      command.worksiteDayId,
    );

    assertNotInPast(localDate, today);

    if (current.revisionNo !== command.expectedRevisionNo) {
      throw new DomainRuleError(
        "STALE_REVISION",
        `Der Tag wurde zwischenzeitlich geaendert (Revision ${current.revisionNo}, erwartet ${command.expectedRevisionNo}).`,
      );
    }

    const revisionNo = await writeNextRevision(
      tx,
      deps.tenant.orgId,
      command.worksiteDayId,
      current,
      command.changes,
      "day_edit",
      deps.correlationId,
    );

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: "update_worksite_day",
      subjectId: command.worksiteDayId,
      payload: { localDate, revisionNo },
      correlationId: deps.correlationId,
    });

    return {
      updatedDayIds: [command.worksiteDayId],
      newRevisions: [{ worksiteDayId: command.worksiteDayId, revisionNo }],
    };
  });
}
