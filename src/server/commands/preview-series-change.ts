import { and, asc, eq, isNull } from "drizzle-orm";

import { parseLocalDate } from "../../domain/local-date";
import { resolveSeriesTargets, targetIdsOf, type SeriesTargetRow } from "../../domain/series-scope";
import type { Database, Transaction } from "../db/client";
import { worksiteDayConfigurations, worksiteDays } from "../db/schema";
import { notFound, type CommandDeps } from "./command-deps";
import type { DayCommandDeps } from "./update-worksite-day";

export interface SeriesPreview {
  readonly engagementId: string;
  readonly fromDate: string;
  readonly rows: SeriesTargetRow[];
  readonly targetIds: string[];
  /** Anzahl individuell angepasster Tage - Grundlage der Zusammenfassung in der UI. */
  readonly adjustedCount: number;
}

export interface PreviewInput {
  readonly worksiteDayId: string;
  readonly includeAdjustedDayIds?: readonly string[];
}

/**
 * Liest die Tage des Einsatzes ab dem adressierten Tag und bestimmt fuer jeden
 * seinen Status.
 *
 * Die Vorschau ist reines Lesen und faellt bewusst nicht in eine Transaktion
 * mit der spaeteren Anwendung: sie ist eine Entscheidungsgrundlage fuer den
 * Menschen, keine Reservierung.
 */
export async function readSeriesPreview(
  executor: Database | Transaction,
  deps: Pick<DayCommandDeps, "tenant" | "clock">,
  input: PreviewInput,
): Promise<SeriesPreview> {
  const anker = await executor
    .select({ engagementId: worksiteDays.engagementId, localDate: worksiteDays.localDate })
    .from(worksiteDays)
    .where(and(eq(worksiteDays.id, input.worksiteDayId), eq(worksiteDays.orgId, deps.tenant.orgId)))
    .limit(1);

  const start = anker[0];

  if (start === undefined) {
    throw notFound("Baustellentag", input.worksiteDayId);
  }

  // Alle Tage desselben EINSATZES - die Serie folgt dem Einsatz, nicht der
  // Baustelle: an derselben Baustelle koennen andere Einsaetze liegen.
  const tage = await executor
    .select({
      worksiteDayId: worksiteDays.id,
      localDate: worksiteDays.localDate,
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
      and(
        eq(worksiteDays.orgId, deps.tenant.orgId),
        eq(worksiteDays.engagementId, start.engagementId),
      ),
    )
    .orderBy(asc(worksiteDays.localDate));

  const rows = resolveSeriesTargets({
    days: tage.map((row) => ({
      worksiteDayId: row.worksiteDayId,
      date: parseLocalDate(row.localDate),
      origin: row.origin as "materialized" | "day_edit" | "series_edit",
    })),
    fromDate: parseLocalDate(start.localDate),
    today: parseLocalDate(deps.clock.todayLocal(deps.tenant.timeZone)),
    includeAdjustedIds: input.includeAdjustedDayIds ?? [],
  });

  return {
    engagementId: start.engagementId,
    fromDate: start.localDate,
    rows,
    targetIds: targetIdsOf(rows),
    adjustedCount: rows.filter(
      (row) => row.status === "adjusted_excluded" || row.status === "adjusted_included",
    ).length,
  };
}

export async function previewSeriesChange(
  deps: DayCommandDeps & CommandDeps,
  input: PreviewInput,
): Promise<SeriesPreview> {
  return readSeriesPreview(deps.db, deps, input);
}
