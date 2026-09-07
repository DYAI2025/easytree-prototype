import { and, asc, eq, isNull } from "drizzle-orm";

import { calculateEngagementCosts, type CostOverview } from "../../domain/cost-calculation";
import { parseLocalDate } from "../../domain/local-date";
import type { CommandDeps } from "../commands/command-deps";
import { notFound } from "../commands/command-deps";
import {
  dayResourceAllocations,
  dayTeamMembers,
  employees,
  engagements,
  resources,
  worksiteDayConfigurations,
  worksiteDays,
} from "../db/schema";

/** Wire-Format der Kostenuebersicht: Minor Units als Dezimalstring. */
export interface CostOverviewDto {
  readonly engagementId: string;
  readonly currency: string;
  readonly ruleVersion: string;
  readonly totalMinorUnits: string;
  readonly missingCount: number;
  readonly complete: boolean;
  readonly days: {
    date: string;
    subtotalMinorUnits: string;
    missingCount: number;
    positions: {
      subjectId: string;
      subjectLabel: string;
      kind: string;
      amountMinorUnits: string | null;
      missing: boolean;
    }[];
  }[];
  readonly byEmployee: {
    subjectId: string;
    subjectLabel: string;
    totalMinorUnits: string;
    missingCount: number;
  }[];
  readonly byResource: {
    subjectId: string;
    subjectLabel: string;
    totalMinorUnits: string;
    missingCount: number;
  }[];
}

function toDto(overview: CostOverview): CostOverviewDto {
  return {
    engagementId: overview.engagementId,
    currency: overview.currency,
    ruleVersion: overview.ruleVersion,
    totalMinorUnits: overview.totalMinorUnits.toString(),
    missingCount: overview.missingCount,
    complete: overview.complete,
    days: overview.days.map((day) => ({
      date: day.date,
      subtotalMinorUnits: day.subtotalMinorUnits.toString(),
      missingCount: day.missingCount,
      positions: day.positions.map((position) => ({
        subjectId: position.subjectId,
        subjectLabel: position.subjectLabel,
        kind: position.kind,
        // NULL bleibt NULL - "fehlt" darf nie als 0 ueber die Grenze gehen.
        amountMinorUnits:
          position.amountMinorUnits === null ? null : position.amountMinorUnits.toString(),
        missing: position.missing,
      })),
    })),
    byEmployee: overview.byEmployee.map((entry) => ({
      subjectId: entry.subjectId,
      subjectLabel: entry.subjectLabel,
      totalMinorUnits: entry.totalMinorUnits.toString(),
      missingCount: entry.missingCount,
    })),
    byResource: overview.byResource.map((entry) => ({
      subjectId: entry.subjectId,
      subjectLabel: entry.subjectLabel,
      totalMinorUnits: entry.totalMinorUnits.toString(),
      missingCount: entry.missingCount,
    })),
  };
}

/**
 * Kostenuebersicht aus der Servertruth: Grundlage ist die AKTUELLE Revision je
 * Baustellentag. Die Rechnung selbst liegt in der Domaene und kennt keine
 * Datenbank.
 */
export async function costOverview(
  deps: CommandDeps,
  engagementId: string,
): Promise<CostOverviewDto> {
  const vorhanden = await deps.db
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.id, engagementId), eq(engagements.orgId, deps.tenant.orgId)))
    .limit(1);

  if (vorhanden[0] === undefined) {
    throw notFound("Einsatz", engagementId);
  }

  const tage = await deps.db
    .select({
      configurationId: worksiteDayConfigurations.id,
      date: worksiteDays.localDate,
    })
    .from(worksiteDays)
    .innerJoin(
      worksiteDayConfigurations,
      and(
        eq(worksiteDayConfigurations.worksiteDayId, worksiteDays.id),
        isNull(worksiteDayConfigurations.supersededAt),
      ),
    )
    .where(
      and(eq(worksiteDays.orgId, deps.tenant.orgId), eq(worksiteDays.engagementId, engagementId)),
    )
    .orderBy(asc(worksiteDays.localDate));

  const personen = await deps.db
    .select({
      configurationId: dayTeamMembers.configurationId,
      id: employees.id,
      label: employees.displayName,
      dailyCost: employees.dailyCostMinorUnits,
    })
    .from(dayTeamMembers)
    .innerJoin(employees, eq(employees.id, dayTeamMembers.employeeId))
    .where(eq(dayTeamMembers.orgId, deps.tenant.orgId));

  const geraete = await deps.db
    .select({
      configurationId: dayResourceAllocations.configurationId,
      id: resources.id,
      label: resources.name,
      dailyCost: resources.dailyCostMinorUnits,
    })
    .from(dayResourceAllocations)
    .innerJoin(resources, eq(resources.id, dayResourceAllocations.resourceId))
    .where(eq(dayResourceAllocations.orgId, deps.tenant.orgId));

  const overview = calculateEngagementCosts({
    engagementId,
    days: tage.map((tag) => ({
      date: parseLocalDate(tag.date),
      employees: personen
        .filter((person) => person.configurationId === tag.configurationId)
        .map((person) => ({
          id: person.id,
          label: person.label,
          dailyCostMinorUnits: person.dailyCost,
        })),
      resources: geraete
        .filter((geraet) => geraet.configurationId === tag.configurationId)
        .map((geraet) => ({
          id: geraet.id,
          label: geraet.label,
          dailyCostMinorUnits: geraet.dailyCost,
        })),
    })),
  });

  return toDto(overview);
}
