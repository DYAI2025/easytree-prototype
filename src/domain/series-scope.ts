/*
 * PROTOTYPE_ONLY / OQ-001 (Jira EYT-122)
 *
 * Interim-Regel fuer die Serienaenderung "dieser und folgende Tage", solange
 * OQ-001 offen ist (Annahme A-06): Folgetage, deren aktuelle Revision aus einer
 * Einzelbearbeitung stammt (origin = "day_edit"), gelten als individuell
 * angepasst und werden STANDARDMAESSIG AUSGESCHLOSSEN. Sie lassen sich nur
 * einzeln und ausdruecklich wieder einbeziehen.
 *
 * Das ist die minimal-invasive, nicht-stille Variante (Kombination der
 * EYT-122-Optionen 1 und 2). Sie schliesst OQ-001 NICHT: die endgueltige Regel
 * ist eine Produktentscheidung und braucht menschliche Freigabe (H-01).
 * Ein stilles Ueberschreiben angepasster Tage waere ein Anti-Drift-Verstoss.
 */
import { compareLocalDate, type LocalDate } from "./local-date";

/** Herkunft der aktuellen Tageskonfiguration. */
export type ConfigurationOrigin = "materialized" | "day_edit" | "series_edit";

export type SeriesTargetStatus =
  /** Nicht individuell angepasst - wird geaendert. */
  | "unchanged"
  /** Individuell angepasst, deshalb ausgeschlossen. */
  | "adjusted_excluded"
  /** Individuell angepasst, aber ausdruecklich einbezogen. */
  | "adjusted_included"
  /** Liegt vor dem heutigen lokalen Datum - nie Ziel (A-07). */
  | "past_locked";

export interface SeriesDay {
  readonly worksiteDayId: string;
  readonly date: LocalDate;
  readonly origin: ConfigurationOrigin;
}

export interface SeriesTargetRow {
  readonly worksiteDayId: string;
  readonly date: LocalDate;
  readonly origin: ConfigurationOrigin;
  readonly status: SeriesTargetStatus;
}

export interface SeriesScopeInput {
  readonly days: readonly SeriesDay[];
  /** Startpunkt der Serie: der adressierte Tag selbst. */
  readonly fromDate: LocalDate;
  readonly today: LocalDate;
  readonly includeAdjustedIds?: readonly string[];
}

/**
 * Bestimmt die Zielmenge einer Serienaenderung ab `fromDate`.
 *
 * Jede Zeile traegt ihre Baustellentag-ID, damit die Vorschau genau die Tage
 * benennen kann, die sie aendern wird - eine Zieltagsmenge ohne IDs waere in
 * der Bestaetigung nicht ueberpruefbar.
 */
export function resolveSeriesTargets(input: SeriesScopeInput): SeriesTargetRow[] {
  const included = new Set(input.includeAdjustedIds ?? []);

  return input.days
    .filter((day) => compareLocalDate(day.date, input.fromDate) >= 0)
    .slice()
    .sort((a, b) => compareLocalDate(a.date, b.date))
    .map((day) => ({
      worksiteDayId: day.worksiteDayId,
      date: day.date,
      origin: day.origin,
      status: statusFor(day, input.today, included),
    }));
}

function statusFor(
  day: SeriesDay,
  today: LocalDate,
  included: ReadonlySet<string>,
): SeriesTargetStatus {
  // Die Vergangenheitssperre gewinnt gegen jede Auswahl: ein gesperrter Tag
  // darf auch dann nicht Ziel werden, wenn er ausdruecklich angehakt wurde.
  if (compareLocalDate(day.date, today) < 0) {
    return "past_locked";
  }

  if (day.origin !== "day_edit") {
    return "unchanged";
  }

  return included.has(day.worksiteDayId) ? "adjusted_included" : "adjusted_excluded";
}

/** Genau die Tage, die eine Serienaenderung anfassen darf. */
export function targetIdsOf(rows: readonly SeriesTargetRow[]): string[] {
  return rows
    .filter((row) => row.status === "unchanged" || row.status === "adjusted_included")
    .map((row) => row.worksiteDayId);
}
