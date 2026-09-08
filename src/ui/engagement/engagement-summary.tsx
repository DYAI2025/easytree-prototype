import { colourFor } from "../../domain/colour-palette";

export function deutschesDatum(datum: string): string {
  const [jahr, monat, tag] = datum.split("-") as [string, string, string];

  return `${tag}.${monat}.${jahr}`;
}

export interface EngagementSummaryProps {
  readonly worksiteName: string;
  readonly startDate: string;
  readonly endDate?: string;
  readonly planningHorizonDate?: string;
  readonly localDates: readonly string[];
  readonly colourKey: string;
  readonly employeeNames: readonly string[];
  readonly resourceNames: readonly string[];
}

/**
 * Letzte Kontrolle vor dem Anlegen.
 *
 * Zeigt den Farbnamen, nicht den Farbschluessel: "moos" ist ein Datenbankwert,
 * kein Wort fuer den Nutzer.
 */
export function EngagementSummary({
  worksiteName,
  startDate,
  endDate,
  planningHorizonDate,
  localDates,
  colourKey,
  employeeNames,
  resourceNames,
}: EngagementSummaryProps) {
  const bis =
    endDate === undefined
      ? `offen, geplant bis ${deutschesDatum(planningHorizonDate ?? startDate)}`
      : deutschesDatum(endDate);

  return (
    <dl
      data-testid="uebersicht"
      className="grid grid-cols-[10rem_1fr] gap-1 rounded border border-line p-3"
    >
      <dt className="text-ink-muted">Baustelle</dt>
      <dd>{worksiteName}</dd>

      <dt className="text-ink-muted">Zeitraum</dt>
      <dd>
        {deutschesDatum(startDate)} bis {bis}
      </dd>

      <dt className="text-ink-muted">Tage</dt>
      <dd>{localDates.length} Arbeitstage</dd>

      <dt className="text-ink-muted">Team</dt>
      <dd>{employeeNames.length === 0 ? "niemand ausgewaehlt" : employeeNames.join(", ")}</dd>

      <dt className="text-ink-muted">Ressourcen</dt>
      <dd>{resourceNames.length === 0 ? "keine ausgewaehlt" : resourceNames.join(", ")}</dd>

      <dt className="text-ink-muted">Farbe</dt>
      <dd>{colourFor(colourKey).label}</dd>
    </dl>
  );
}
