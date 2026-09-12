import { compareLocalDate, differenceInDays, type LocalDate } from "./local-date";
import type { ProblemCode } from "./problem-codes";
import {
  applyDayOverrides,
  deriveDefaultWorkdays,
  DomainRuleError,
  MAX_DAYS_PER_MATERIALISATION,
  type Period,
} from "./workday-derivation";

export interface EngagementPeriodInput {
  readonly startDate: LocalDate;
  /** Fehlt bei offenem Ende; dann ist `planningHorizonDate` Pflicht. */
  readonly endDate?: LocalDate;
  readonly planningHorizonDate?: LocalDate;
  readonly addedDays?: readonly LocalDate[];
  readonly removedDays?: readonly LocalDate[];
}

export type EngagementPeriodResult =
  | { readonly ok: true; readonly effectiveDays: LocalDate[] }
  | { readonly ok: false; readonly codes: ProblemCode[] };

/**
 * Prueft Zeitraum, Planungshorizont und Vergangenheitsregel und leitet die
 * effektiven Baustellentage ab.
 *
 * Gibt bewusst ALLE verletzten Codes zurueck, nicht nur den ersten: das
 * Formular soll alle Fehler auf einmal anzeigen koennen.
 *
 * `today` wird hereingereicht (Clock-Port, REQ-A-005); diese Funktion liest
 * niemals selbst die Uhr und ist damit ohne Zeitmocking testbar.
 */
export function validateEngagementPeriod(
  input: EngagementPeriodInput,
  today: LocalDate,
): EngagementPeriodResult {
  const codes: ProblemCode[] = [];
  const { startDate, endDate, planningHorizonDate } = input;

  if (compareLocalDate(startDate, today) < 0) {
    codes.push("ENGAGEMENT_START_IN_PAST");
  }

  let end: LocalDate | undefined;

  if (endDate !== undefined) {
    if (compareLocalDate(endDate, startDate) < 0) {
      codes.push("ENGAGEMENT_END_BEFORE_START");
    } else {
      end = endDate;
    }
  } else if (planningHorizonDate === undefined) {
    codes.push("PLANNING_HORIZON_REQUIRED");
  } else if (compareLocalDate(planningHorizonDate, startDate) < 0) {
    codes.push("PLANNING_HORIZON_BEFORE_START");
  } else {
    end = planningHorizonDate;
  }

  if (end === undefined) {
    return { ok: false, codes };
  }

  const period: Period = { start: startDate, end };

  if (differenceInDays(period.start, period.end) + 1 > MAX_DAYS_PER_MATERIALISATION) {
    codes.push("TOO_MANY_DAYS");
    return { ok: false, codes };
  }

  let effectiveDays: LocalDate[];

  try {
    effectiveDays = applyDayOverrides(deriveDefaultWorkdays(period), {
      period,
      added: input.addedDays ?? [],
      removed: input.removedDays ?? [],
    });
  } catch (error) {
    // Die Ableitung wirft; hier wird daraus ein Code, damit der Aufrufer alle
    // Verstoesse gemeinsam bekommt statt eines abgebrochenen Laufs.
    if (error instanceof DomainRuleError) {
      codes.push(error.code);
      return { ok: false, codes };
    }

    throw error;
  }

  if (effectiveDays.length === 0) {
    codes.push("NO_EFFECTIVE_DAYS");
  }

  return codes.length > 0 ? { ok: false, codes } : { ok: true, effectiveDays };
}
