import { and, asc, eq, isNull } from "drizzle-orm";

import type { CommandDeps } from "../commands/command-deps";
import { notFound } from "../commands/command-deps";
import type { Database, Transaction } from "../db/client";
import {
  customers,
  dayResourceAllocations,
  dayTeamMembers,
  employees,
  engagements,
  resources,
  worksiteDayConfigurations,
  worksiteDays,
  worksites,
} from "../db/schema";

export interface WorksiteDayDetail {
  readonly worksiteDayId: string;
  readonly localDate: string;
  readonly engagementId: string;
  readonly engagementTitle: string;
  readonly colourKey: string;
  readonly worksiteName: string;
  readonly customerName: string;
  readonly revisionNo: number;
  readonly origin: string;
  readonly plannedStartTime: string | null;
  readonly plannedEndTime: string | null;
  readonly note: string | null;
  readonly employees: { id: string; displayName: string }[];
  readonly resources: { id: string; name: string; kind: string }[];
}

/**
 * Tagesdetail aus der Servertruth. Es wird ausschliesslich die AKTUELLE
 * Revision gelesen (superseded_at is null); die Historie bleibt in der Tabelle,
 * gehoert aber nicht in die Bearbeitungsansicht.
 */
export async function readWorksiteDayDetail(
  executor: Database | Transaction,
  orgId: string,
  worksiteDayId: string,
): Promise<WorksiteDayDetail> {
  const rows = await executor
    .select({
      worksiteDayId: worksiteDays.id,
      localDate: worksiteDays.localDate,
      engagementId: engagements.id,
      engagementTitle: engagements.title,
      colourKey: engagements.colourKey,
      worksiteName: worksites.name,
      customerName: customers.name,
      configurationId: worksiteDayConfigurations.id,
      revisionNo: worksiteDayConfigurations.revisionNo,
      origin: worksiteDayConfigurations.origin,
      plannedStartTime: worksiteDayConfigurations.plannedStartTime,
      plannedEndTime: worksiteDayConfigurations.plannedEndTime,
      note: worksiteDayConfigurations.note,
    })
    .from(worksiteDays)
    .innerJoin(engagements, eq(engagements.id, worksiteDays.engagementId))
    .innerJoin(worksites, eq(worksites.id, worksiteDays.worksiteId))
    .innerJoin(customers, eq(customers.id, worksites.customerId))
    .innerJoin(
      worksiteDayConfigurations,
      and(
        eq(worksiteDayConfigurations.worksiteDayId, worksiteDays.id),
        isNull(worksiteDayConfigurations.supersededAt),
      ),
    )
    .where(and(eq(worksiteDays.id, worksiteDayId), eq(worksiteDays.orgId, orgId)))
    .limit(1);

  const row = rows[0];

  if (row === undefined) {
    throw notFound("Baustellentag", worksiteDayId);
  }

  const team = await executor
    .select({ id: employees.id, displayName: employees.displayName })
    .from(dayTeamMembers)
    .innerJoin(employees, eq(employees.id, dayTeamMembers.employeeId))
    .where(eq(dayTeamMembers.configurationId, row.configurationId))
    .orderBy(asc(employees.displayName));

  const geraete = await executor
    .select({ id: resources.id, name: resources.name, kind: resources.kind })
    .from(dayResourceAllocations)
    .innerJoin(resources, eq(resources.id, dayResourceAllocations.resourceId))
    .where(eq(dayResourceAllocations.configurationId, row.configurationId))
    .orderBy(asc(resources.name));

  return { ...row, employees: team, resources: geraete };
}

export async function worksiteDayDetail(
  deps: CommandDeps,
  worksiteDayId: string,
): Promise<WorksiteDayDetail> {
  return readWorksiteDayDetail(deps.db, deps.tenant.orgId, worksiteDayId);
}
