import { and, asc, between, eq, isNull, sql } from "drizzle-orm";

import { buildMonthGrid, computeSpanSegments, type SpanSegment } from "../../domain/month-grid";
import { firstDayOfMonth, lastDayOfMonth, parseLocalDate, addDays } from "../../domain/local-date";
import type { CommandDeps } from "../commands/command-deps";
import type { Clock } from "../clock/clock";
import {
  dayResourceAllocations,
  dayTeamMembers,
  engagements,
  worksiteDayConfigurations,
  worksiteDays,
  worksites,
} from "../db/schema";

export interface MonthCard {
  readonly worksiteDayId: string;
  readonly date: string;
  readonly engagementId: string;
  readonly title: string;
  readonly colourKey: string;
  readonly worksiteName: string;
  readonly employeeCount: number;
  readonly resourceCount: number;
  readonly revisionNo: number;
  readonly origin: string;
}

export interface MonthPlanningView {
  readonly month: string;
  readonly today: string;
  readonly weeks: { isoWeek: number; days: { date: string; inMonth: boolean }[] }[];
  readonly cards: MonthCard[];
  readonly spans: SpanSegment[];
}

/**
 * Serverseitig berechnetes Lesemodell des Monatskalenders (REQ-A-003).
 *
 * Es gibt GENAU EINE Karte je Baustellentag - unabhaengig davon, wie viele
 * Personen an dem Tag eingeplant sind. Die Teamgroesse steht als Zahl auf der
 * Karte. Deshalb wird ueber die Konfiguration gruppiert und gezaehlt, statt
 * ueber die Zuordnungen zu joinen.
 *
 * Die UI rechnet daraus nur noch Layout; Raster und Spans kommen fertig aus der
 * Domaene.
 */
export async function monthPlanningView(
  deps: CommandDeps & { clock: Clock },
  month: string,
): Promise<MonthPlanningView> {
  const grid = buildMonthGrid(month);
  const rasterStart = grid.weeks[0]!.days[0]!.date;
  const rasterEnde = grid.weeks.at(-1)!.days.at(-1)!.date;

  const rows = await deps.db
    .select({
      worksiteDayId: worksiteDays.id,
      date: worksiteDays.localDate,
      engagementId: engagements.id,
      title: engagements.title,
      colourKey: engagements.colourKey,
      worksiteName: worksites.name,
      revisionNo: worksiteDayConfigurations.revisionNo,
      origin: worksiteDayConfigurations.origin,
      employeeCount: sql<number>`(
        select count(*)::int from ${dayTeamMembers}
        where ${dayTeamMembers.configurationId} = ${worksiteDayConfigurations.id}
      )`,
      resourceCount: sql<number>`(
        select count(*)::int from ${dayResourceAllocations}
        where ${dayResourceAllocations.configurationId} = ${worksiteDayConfigurations.id}
      )`,
    })
    .from(worksiteDays)
    .innerJoin(engagements, eq(engagements.id, worksiteDays.engagementId))
    .innerJoin(worksites, eq(worksites.id, worksiteDays.worksiteId))
    .innerJoin(
      worksiteDayConfigurations,
      and(
        eq(worksiteDayConfigurations.worksiteDayId, worksiteDays.id),
        isNull(worksiteDayConfigurations.supersededAt),
      ),
    )
    .where(
      and(
        eq(worksiteDays.orgId, deps.tenant.orgId),
        between(worksiteDays.localDate, rasterStart, rasterEnde),
      ),
    )
    .orderBy(asc(worksiteDays.localDate), asc(engagements.title));

  const proEinsatz = new Map<string, string[]>();

  for (const row of rows) {
    const bisher = proEinsatz.get(row.engagementId) ?? [];
    bisher.push(row.date);
    proEinsatz.set(row.engagementId, bisher);
  }

  // Fuer die Fortsetzungskanten zaehlen auch Tage AUSSERHALB des Rasters.
  const randStart = addDays(parseLocalDate(rasterStart), -1);
  const randEnde = addDays(parseLocalDate(rasterEnde), 1);

  const randTage = await deps.db
    .select({ engagementId: worksiteDays.engagementId, date: worksiteDays.localDate })
    .from(worksiteDays)
    .where(
      and(
        eq(worksiteDays.orgId, deps.tenant.orgId),
        between(worksiteDays.localDate, randStart, randEnde),
      ),
    );

  for (const row of randTage) {
    const bisher = proEinsatz.get(row.engagementId);
    if (bisher !== undefined && !bisher.includes(row.date)) {
      bisher.push(row.date);
    }
  }

  const spans = computeSpanSegments(
    grid,
    [...proEinsatz.entries()].map(([engagementId, dates]) => ({
      engagementId,
      days: dates.map(parseLocalDate),
    })),
  );

  return {
    month: grid.month,
    today: deps.clock.todayLocal(deps.tenant.timeZone),
    weeks: grid.weeks.map((week) => ({
      isoWeek: week.isoWeek,
      days: week.days.map((day) => ({ date: day.date as string, inMonth: day.inMonth })),
    })),
    cards: rows.map((row) => ({ ...row })),
    spans,
  };
}

export { firstDayOfMonth, lastDayOfMonth };
