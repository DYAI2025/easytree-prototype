"use client";

import { addDays, parseLocalDate, type LocalDate } from "../../domain/local-date";

const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

/** "Di 08.09.2026" - Wochentag mit im Label, sonst ist Werktag vs. Wochenende blind. */
export function tagLabel(datum: LocalDate): string {
  const [jahr, monat, tag] = datum.split("-") as [string, string, string];
  const wochentag = WOCHENTAG[new Date(`${datum}T00:00:00Z`).getUTCDay()]!;

  return `${wochentag} ${tag}.${monat}.${jahr}`;
}

export function tageImZeitraum(start: LocalDate, ende: LocalDate): LocalDate[] {
  const tage: LocalDate[] = [];

  for (let tag = start; tag <= ende; tag = addDays(tag, 1)) {
    tage.push(tag);
  }

  return tage;
}

/**
 * Optionale Feinkorrektur der abgeleiteten Tage.
 *
 * BEWUSST kein Pflichtschritt: die Tage stehen bereits aus Zeitraum und
 * Werktagsregel fest. Wer den Picker nie oeffnet, bekommt trotzdem einen
 * vollstaendigen Einsatz - das ist die Kernentscheidung gegen die Drift
 * "Kalender ist Pflichtschritt".
 */
export function DayOverridePicker({
  start,
  ende,
  ausgewaehlt,
  onToggle,
}: {
  readonly start: string;
  readonly ende: string;
  readonly ausgewaehlt: ReadonlySet<string>;
  readonly onToggle: (datum: LocalDate) => void;
}) {
  const tage = tageImZeitraum(parseLocalDate(start), parseLocalDate(ende));

  return (
    <fieldset data-testid="tage-picker" className="rounded border border-line p-3">
      <legend className="font-medium">Tage anpassen</legend>
      <div className="grid grid-cols-2 gap-1">
        {tage.map((tag) => (
          <label key={tag} className="flex items-center gap-2">
            <input type="checkbox" checked={ausgewaehlt.has(tag)} onChange={() => onToggle(tag)} />
            {tagLabel(tag)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
