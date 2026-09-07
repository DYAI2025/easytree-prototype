import {
  addDays,
  compareLocalDate,
  differenceInDays,
  isWeekend,
  type LocalDate,
} from "./local-date";
import type { ProblemCode } from "./problem-codes";

/**
 * Obergrenze materialisierter Tage je Einsatz-Erzeugung (Annahme A-10).
 * Schuetzt vor Endlos-Materialisierung bei offenem Ende. Die Pruefung laeuft
 * ueber die Zeitraumlaenge; sie ist damit strenger als eine Pruefung auf die
 * Zahl der Werktage und erfuellt A-10 in jedem Fall.
 */
export const MAX_DAYS_PER_MATERIALISATION = 366;

/**
 * Fehler der Domaenenregeln. `code` ist auf die Union aus `problem-codes.ts`
 * eingeschraenkt, damit ein Tippfehler beim Werfen schon der Typecheck faengt
 * und der Problem-JSON-Layer (TASK-021) ohne Cast auf den Status abbilden kann.
 */
export class DomainRuleError extends Error {
  readonly code: ProblemCode;

  constructor(code: ProblemCode, detail: string) {
    super(detail);
    this.name = "DomainRuleError";
    this.code = code;
  }
}

export interface Period {
  readonly start: LocalDate;
  /** Enddatum oder - bei offenem Ende - der Planungshorizont. */
  readonly end: LocalDate;
}

export interface DayOverrides {
  readonly period: Period;
  readonly added: readonly LocalDate[];
  readonly removed: readonly LocalDate[];
}

function assertPeriod(period: Period): number {
  const span = differenceInDays(period.start, period.end) + 1;

  if (span <= 0) {
    throw new DomainRuleError(
      "ENGAGEMENT_END_BEFORE_START",
      `Das Ende ${period.end} liegt vor dem Start ${period.start}.`,
    );
  }

  if (span > MAX_DAYS_PER_MATERIALISATION) {
    throw new DomainRuleError(
      "TOO_MANY_DAYS",
      `Der Zeitraum umfasst ${span} Tage, erlaubt sind ${MAX_DAYS_PER_MATERIALISATION}.`,
    );
  }

  return span;
}

function isInPeriod(day: LocalDate, period: Period): boolean {
  return compareLocalDate(day, period.start) >= 0 && compareLocalDate(day, period.end) <= 0;
}

/**
 * Alle Montage bis Freitage im inklusiven Zeitraum. Wochenenden sind bewusst
 * kein Default; sie kommen nur ueber `applyDayOverrides` hinzu (D-005/D-006).
 */
export function deriveDefaultWorkdays(period: Period): LocalDate[] {
  const span = assertPeriod(period);
  const days: LocalDate[] = [];

  for (let offset = 0; offset < span; offset += 1) {
    const day = addDays(period.start, offset);

    if (!isWeekend(day)) {
      days.push(day);
    }
  }

  return days;
}

/**
 * Wendet die optionale Tagesauswahl an. Das Ergebnis ist immer aufsteigend
 * sortiert und duplikatfrei; zugewaehlte Tage muessen im Zeitraum liegen.
 *
 * Abweichung von der Kurzsignatur in Abschnitt 5.1: der Zeitraum wird
 * mitgegeben. Er laesst sich nicht aus `defaults` rekonstruieren - bei einem
 * reinen Wochenend-Zeitraum ist `defaults` leer.
 */
export function applyDayOverrides(
  defaults: readonly LocalDate[],
  overrides: DayOverrides,
): LocalDate[] {
  const { period, added, removed } = overrides;

  for (const day of added) {
    if (!isInPeriod(day, period)) {
      throw new DomainRuleError(
        "DAY_OUTSIDE_PERIOD",
        `Der Tag ${day} liegt ausserhalb von ${period.start} bis ${period.end}.`,
      );
    }
  }

  const result = new Set<LocalDate>(defaults);

  for (const day of added) {
    result.add(day);
  }

  for (const day of removed) {
    result.delete(day);
  }

  // ISO-Datumsstrings sortieren lexikografisch = chronologisch.
  return [...result].sort(compareLocalDate);
}
