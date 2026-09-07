import { describe, expect, it } from "vitest";

import { validateEngagementPeriod } from "./engagement-rules";
import { parseLocalDate, type LocalDate } from "./local-date";
import { httpStatusForProblem, PROBLEM_CODES, PROBLEM_STATUS } from "./problem-codes";

const d = (value: string): LocalDate => parseLocalDate(value);
const TODAY = d("2026-09-07");

function codesOf(result: ReturnType<typeof validateEngagementPeriod>): string[] {
  return result.ok ? [] : [...result.codes].sort();
}

describe("validateEngagementPeriod", () => {
  it("lehnt einen Start vor dem heutigen lokalen Datum ab", () => {
    const result = validateEngagementPeriod(
      { startDate: d("2026-09-06"), endDate: d("2026-09-18") },
      TODAY,
    );

    expect(result.ok).toBe(false);
    expect(codesOf(result)).toContain("ENGAGEMENT_START_IN_PAST");
  });

  it("erlaubt einen Start am heutigen Tag", () => {
    const result = validateEngagementPeriod({ startDate: TODAY, endDate: d("2026-09-11") }, TODAY);

    expect(result.ok).toBe(true);
    expect(result.ok && result.effectiveDays).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);
  });

  it("lehnt ein Ende vor dem Start ab", () => {
    const result = validateEngagementPeriod({ startDate: TODAY, endDate: d("2026-09-05") }, TODAY);

    expect(codesOf(result)).toContain("ENGAGEMENT_END_BEFORE_START");
  });

  it("verlangt bei offenem Ende einen Planungshorizont", () => {
    const result = validateEngagementPeriod({ startDate: TODAY }, TODAY);

    expect(codesOf(result)).toContain("PLANNING_HORIZON_REQUIRED");
  });

  it("lehnt einen Horizont vor dem Start ab", () => {
    const result = validateEngagementPeriod(
      { startDate: TODAY, planningHorizonDate: d("2026-09-01") },
      TODAY,
    );

    expect(codesOf(result)).toContain("PLANNING_HORIZON_BEFORE_START");
  });

  it("meldet NO_EFFECTIVE_DAYS, wenn nur Wochenende im Zeitraum liegt", () => {
    const result = validateEngagementPeriod(
      { startDate: d("2026-09-12"), endDate: d("2026-09-13") },
      TODAY,
    );

    expect(codesOf(result)).toContain("NO_EFFECTIVE_DAYS");
  });

  it("meldet ALLE verletzten Regeln, nicht nur die erste", () => {
    const result = validateEngagementPeriod(
      { startDate: d("2026-09-06"), endDate: d("2026-09-05") },
      TODAY,
    );

    expect(codesOf(result)).toEqual(["ENGAGEMENT_END_BEFORE_START", "ENGAGEMENT_START_IN_PAST"]);
  });

  it("meldet ALLE Regeln auch auf dem Pfad mit aufgeloestem Zeitraum", () => {
    // 2026-09-05 ist ein Samstag und liegt vor TODAY, 2026-09-06 ein Sonntag.
    // Damit ist der Zeitraum gueltig aufloesbar (kein frueher Ausstieg), und es
    // treffen zwei Verstoesse zusammen: Start in der Vergangenheit UND kein
    // einziger effektiver Tag.
    const result = validateEngagementPeriod(
      { startDate: d("2026-09-05"), endDate: d("2026-09-06") },
      TODAY,
    );

    expect(codesOf(result)).toEqual(["ENGAGEMENT_START_IN_PAST", "NO_EFFECTIVE_DAYS"]);
  });

  it("meldet TOO_MANY_DAYS oberhalb der Obergrenze", () => {
    const result = validateEngagementPeriod(
      { startDate: TODAY, planningHorizonDate: d("2027-09-30") },
      TODAY,
    );

    expect(codesOf(result)).toContain("TOO_MANY_DAYS");
  });

  it("nimmt Wochenendtage ueber Overrides auf", () => {
    const result = validateEngagementPeriod(
      {
        startDate: d("2026-09-12"),
        endDate: d("2026-09-13"),
        addedDays: [d("2026-09-12")],
      },
      TODAY,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.effectiveDays).toEqual(["2026-09-12"]);
  });

  it("meldet DAY_OUTSIDE_PERIOD statt zu werfen", () => {
    const result = validateEngagementPeriod(
      { startDate: TODAY, endDate: d("2026-09-11"), addedDays: [d("2026-10-01")] },
      TODAY,
    );

    expect(codesOf(result)).toContain("DAY_OUTSIDE_PERIOD");
  });
});

describe("problem-codes", () => {
  it("ordnet JEDEM Code der Union einen HTTP-Status zu", () => {
    const ohneStatus = PROBLEM_CODES.filter((code) => typeof PROBLEM_STATUS[code] !== "number");

    expect(ohneStatus).toEqual([]);
    expect(PROBLEM_CODES.length).toBeGreaterThanOrEqual(16);
  });

  it("haelt die im Plan festgelegten Status ein", () => {
    expect(PROBLEM_STATUS.ENGAGEMENT_START_IN_PAST).toBe(422);
    expect(PROBLEM_STATUS.ENGAGEMENT_END_BEFORE_START).toBe(422);
    expect(PROBLEM_STATUS.PLANNING_HORIZON_REQUIRED).toBe(422);
    expect(PROBLEM_STATUS.PLANNING_HORIZON_BEFORE_START).toBe(422);
    expect(PROBLEM_STATUS.TOO_MANY_DAYS).toBe(422);
    expect(PROBLEM_STATUS.NO_EFFECTIVE_DAYS).toBe(422);
    expect(PROBLEM_STATUS.DAY_OUTSIDE_PERIOD).toBe(400);
    expect(PROBLEM_STATUS.WORKSITE_DAY_ALREADY_PLANNED).toBe(409);
    expect(PROBLEM_STATUS.STALE_REVISION).toBe(409);
    expect(PROBLEM_STATUS.IDEMPOTENCY_KEY_REUSED).toBe(409);
    expect(PROBLEM_STATUS.MISSING_IDEMPOTENCY_KEY).toBe(400);
    expect(PROBLEM_STATUS.DAY_IN_PAST_LOCKED).toBe(422);
    expect(PROBLEM_STATUS.VALIDATION_FAILED).toBe(400);
    expect(PROBLEM_STATUS.GEOCODER_UNAVAILABLE).toBe(503);
    expect(PROBLEM_STATUS.GEOCODER_NOT_CONFIGURED).toBe(422);
    expect(PROBLEM_STATUS.NOT_FOUND).toBe(404);
  });

  it("faellt fuer einen unbekannten Code auf 500 zurueck statt still zu raten", () => {
    expect(httpStatusForProblem("NOT_FOUND")).toBe(404);
    expect(httpStatusForProblem("GIBT_ES_NICHT")).toBe(500);
  });

  it("nennt keinen Code doppelt", () => {
    expect(new Set(PROBLEM_CODES).size).toBe(PROBLEM_CODES.length);
  });
});
