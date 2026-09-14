import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { CommandDeps } from "../commands/command-deps";
import { notFound } from "../commands/command-deps";
import {
  customers,
  engagements,
  worksiteDayConfigurations,
  worksiteDays,
  worksites,
} from "../db/schema";

/**
 * Versionstoken eines Einsatzes - die optimistische Sperre aus REQ-E04.
 *
 * Warum nicht einfach die Spalte `updated_at`: der Treiber liefert sie als
 * JavaScript-`Date`, und das kennt nur MILLISEKUNDEN. PostgreSQL speichert
 * `timestamptz` mit MIKROSEKUNDEN. Zwei Schreibvorgaenge weniger als eine
 * Millisekunde auseinander haetten damit denselben Token - und der veraltete
 * Stand des zweiten Clients waere still angenommen worden. Genau das soll die
 * Sperre verhindern.
 *
 * Deshalb wird der Token in der Datenbank gerendert, mit `US` (sechs Stellen)
 * und fest in UTC: die Sitzungszeitzone darf den Vergleich nicht verschieben.
 * Das Format hat feste Breite, also ist der lexikografische Vergleich zugleich
 * der chronologische.
 *
 * Diese Funktion steht bewusst NEBEN dem Lesemodell und wird vom
 * Update-Command mitbenutzt. Zwei Kopien derselben Formatzeichenkette waeren
 * die eigentliche Gefahr: liefen Leser und Pruefer auseinander, waere die
 * Vorbedingung wirkungslos, ohne dass ein Test es zwangslaeufig merkt.
 */
export function engagementVersionToken() {
  return sql<string>`to_char(${engagements.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

export interface EngagementDetail {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly planningHorizonDate: string | null;
  readonly colourKey: string;
  /** Versionstoken fuer die naechste Bearbeitung, nicht zur Anzeige. */
  readonly updatedAt: string;
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
      updatedAt: engagementVersionToken(),
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
