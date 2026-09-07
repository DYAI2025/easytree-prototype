import { validateEngagementPeriod } from "../../domain/engagement-rules";
import { parseLocalDate, type LocalDate } from "../../domain/local-date";
import { DomainRuleError } from "../../domain/workday-derivation";
import { CreateEngagementCommand, type EngagementCreated } from "../../contracts/engagement";
import { recordAudit } from "../audit/audit-log";
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

/**
 * Erzeugt Einsatz, alle effektiven Baustellentage und je Tag die Revision 1 -
 * in EINER Transaktion. Es gibt keinen Zwischenzustand, in dem ein Einsatz
 * ohne seine Tage existiert (REQ-F-007, REQ-A-002).
 */
export async function createEngagement(
  deps: CreateEngagementDeps,
  input: unknown,
  hooks?: CreateEngagementHooks,
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

  return withTransaction(deps.db, (tx) =>
    materialise(tx, deps, command, period.effectiveDays, hooks),
  );
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
    operation: "create_engagement",
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
