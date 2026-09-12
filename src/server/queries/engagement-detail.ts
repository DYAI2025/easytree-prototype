import { and, asc, eq, isNull } from "drizzle-orm";

import type { CommandDeps } from "../commands/command-deps";
import { notFound } from "../commands/command-deps";
import {
  customers,
  engagements,
  worksiteDayConfigurations,
  worksiteDays,
  worksites,
} from "../db/schema";

export interface EngagementDetail {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly planningHorizonDate: string | null;
  readonly colourKey: string;
  readonly worksiteId: string;
  readonly worksiteName: string;
  readonly customerName: string;
  readonly days: { worksiteDayId: string; localDate: string; revisionNo: number; origin: string }[];
}

/** Einsatzdetail inklusive seiner Tage mit jeweils AKTUELLER Revision. */
export async function engagementDetail(
  deps: CommandDeps,
  engagementId: string,
): Promise<EngagementDetail> {
  const rows = await deps.db
    .select({
      id: engagements.id,
      title: engagements.title,
      description: engagements.description,
      startDate: engagements.startDate,
      endDate: engagements.endDate,
      planningHorizonDate: engagements.planningHorizonDate,
      colourKey: engagements.colourKey,
      worksiteId: worksites.id,
      worksiteName: worksites.name,
      customerName: customers.name,
    })
    .from(engagements)
    .innerJoin(worksites, eq(worksites.id, engagements.worksiteId))
    .innerJoin(customers, eq(customers.id, worksites.customerId))
    .where(and(eq(engagements.id, engagementId), eq(engagements.orgId, deps.tenant.orgId)))
    .limit(1);

  const row = rows[0];

  if (row === undefined) {
    throw notFound("Einsatz", engagementId);
  }

  const days = await deps.db
    .select({
      worksiteDayId: worksiteDays.id,
      localDate: worksiteDays.localDate,
      revisionNo: worksiteDayConfigurations.revisionNo,
      origin: worksiteDayConfigurations.origin,
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

  return { ...row, days };
}
