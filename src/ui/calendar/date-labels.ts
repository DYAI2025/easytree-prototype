import type { LocalDate } from "../../domain/local-date";

/**
 * Deutsche Datumsbeschriftungen fuer Screenreader.
 *
 * Bewusst mit `timeZone: "UTC"`: ein LocalDate ist eine Kalenderposition ohne
 * Zeitzone. Ohne die Vorgabe wuerde Intl die Prozesszeitzone anwenden und das
 * Label je nach Serverstandort um einen Tag verrutschen.
 */
const LANG = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export const WOCHENTAGE_LANG = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export function formatiereDatumLang(date: LocalDate): string {
  return LANG.format(new Date(`${date}T00:00:00Z`));
}

/** "Donnerstag, 10. September 2026, 2 Einsaetze" */
export function tagesLabel(date: LocalDate, anzahlEinsaetze: number): string {
  const einsaetze =
    anzahlEinsaetze === 0
      ? "keine Einsaetze"
      : anzahlEinsaetze === 1
        ? "1 Einsatz"
        : `${anzahlEinsaetze} Einsaetze`;

  return `${formatiereDatumLang(date)}, ${einsaetze}`;
}
