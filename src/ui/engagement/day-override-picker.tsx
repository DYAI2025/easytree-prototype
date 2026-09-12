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
          /*
           * min-h-11 = 44 CSS-Pixel (WCAG 2.5.5, EYT-176).
           *
           * Die Hoehe sitzt am LABEL, nicht an der Checkbox: die Checkbox
           * bleibt das 13x13 grosse Betriebssystemelement, bedient wird die
           * Zeile, die sie umschliesst - ein Klick irgendwo darauf schaltet
           * sie. Dieselbe Loesung wie bei den Team- und Ressourcenzeilen des
           * Tagesdrawers; die Zeile IST hier bereits die Trefferflaeche, sie
           * war nur zu flach.
           *
           * Gemessen im Produktionsbuild vor der Reparatur: 156x24 (375 px),
           * 131x24 (325 px), 128,5x24 (320 px). Ein Teil der Zeilen erreichte
           * bei 320 px durch den Textumbruch zufaellig 48 px - Zufall ist
           * keine Zusicherung, deshalb steht die Untergrenze jetzt fest.
           */
          <label key={tag} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={ausgewaehlt.has(tag)} onChange={() => onToggle(tag)} />
            {tagLabel(tag)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
