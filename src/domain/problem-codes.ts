/**
 * Zentrale Union aller Problemcodes und ihre HTTP-Status-Zuordnung
 * (Plan Abschnitt 5.12).
 *
 * Die Liste ist die Laufzeitwahrheit, der Typ wird daraus abgeleitet. Dadurch
 * kann ein Test ueber ALLE Codes iterieren; eine reine Typ-Union waere zur
 * Laufzeit nicht aufzaehlbar, und ein fehlender Status fiele erst im Betrieb
 * als generischer 500 auf.
 */
export const PROBLEM_CODES = [
  "ENGAGEMENT_START_IN_PAST",
  "ENGAGEMENT_END_BEFORE_START",
  "PLANNING_HORIZON_REQUIRED",
  "PLANNING_HORIZON_BEFORE_START",
  "TOO_MANY_DAYS",
  "NO_EFFECTIVE_DAYS",
  "DAY_OUTSIDE_PERIOD",
  "WORKSITE_DAY_ALREADY_PLANNED",
  "STALE_REVISION",
  "IDEMPOTENCY_KEY_REUSED",
  "MISSING_IDEMPOTENCY_KEY",
  "DAY_IN_PAST_LOCKED",
  "VALIDATION_FAILED",
  "GEOCODER_UNAVAILABLE",
  "GEOCODER_NOT_CONFIGURED",
  "NOT_FOUND",
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

/**
 * Vollstaendige Status-Map. `Record<ProblemCode, number>` erzwingt bereits im
 * Typsystem, dass kein Code vergessen wird; der zugehoerige Test prueft es
 * zusaetzlich zur Laufzeit.
 */
export const PROBLEM_STATUS: Record<ProblemCode, number> = {
  ENGAGEMENT_START_IN_PAST: 422,
  ENGAGEMENT_END_BEFORE_START: 422,
  PLANNING_HORIZON_REQUIRED: 422,
  PLANNING_HORIZON_BEFORE_START: 422,
  TOO_MANY_DAYS: 422,
  NO_EFFECTIVE_DAYS: 422,
  DAY_OUTSIDE_PERIOD: 400,
  WORKSITE_DAY_ALREADY_PLANNED: 409,
  STALE_REVISION: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  MISSING_IDEMPOTENCY_KEY: 400,
  DAY_IN_PAST_LOCKED: 422,
  VALIDATION_FAILED: 400,
  GEOCODER_UNAVAILABLE: 503,
  GEOCODER_NOT_CONFIGURED: 422,
  NOT_FOUND: 404,
};

export function isProblemCode(value: string): value is ProblemCode {
  return (PROBLEM_CODES as readonly string[]).includes(value);
}

/** Unbekannte Codes werden zu 500 - nie stillschweigend zu einem 4xx geraten. */
export function httpStatusForProblem(code: string): number {
  return isProblemCode(code) ? PROBLEM_STATUS[code] : 500;
}
