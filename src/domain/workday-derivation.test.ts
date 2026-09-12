import { describe, expect, it } from "vitest";

import { parseLocalDate, type LocalDate } from "./local-date";
import {
  applyDayOverrides,
  deriveDefaultWorkdays,
  MAX_DAYS_PER_MATERIALISATION,
} from "./workday-derivation";

const d = (value: string): LocalDate => parseLocalDate(value);

describe("deriveDefaultWorkdays", () => {
  it("leitet Montag bis Freitag inklusiv ab und laesst Wochenenden aus", () => {
    // 2026-09-07 ist ein Montag, 2026-09-12/13 sind Samstag/Sonntag.
    const days = deriveDefaultWorkdays({ start: d("2026-09-07"), end: d("2026-09-18") });

    expect(days).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(days).toHaveLength(10);
    expect(days).not.toContain("2026-09-12");
    expect(days).not.toContain("2026-09-13");
    expect(days).not.toContain("2026-09-19");
  });

  it("liefert fuer einen einzelnen Samstag nichts, weil Wochenende kein Default ist", () => {
    expect(deriveDefaultWorkdays({ start: d("2026-09-12"), end: d("2026-09-12") })).toEqual([]);
  });

  it("wirft TOO_MANY_DAYS, sobald der Zeitraum die Obergrenze ueberschreitet", () => {
    const start = d("2026-01-01");

    // Genau an der Grenze noch erlaubt: 366 Tage inklusiv.
    expect(() => deriveDefaultWorkdays({ start, end: d("2027-01-01") })).not.toThrow();

    expect(() => deriveDefaultWorkdays({ start, end: d("2027-01-02") })).toThrow(
      expect.objectContaining({ code: "TOO_MANY_DAYS" }),
    );
    expect(MAX_DAYS_PER_MATERIALISATION).toBe(366);
  });

  it("wirft, wenn das Ende vor dem Start liegt", () => {
    expect(() => deriveDefaultWorkdays({ start: d("2026-09-18"), end: d("2026-09-07") })).toThrow(
      expect.objectContaining({ code: "ENGAGEMENT_END_BEFORE_START" }),
    );
  });
});

describe("applyDayOverrides", () => {
  const period = { start: d("2026-09-07"), end: d("2026-09-18") };
  const defaults = deriveDefaultWorkdays(period);

  it("nimmt Wochenendtage auf und entfernt abgewaehlte Tage", () => {
    const days = applyDayOverrides(defaults, {
      period,
      added: [d("2026-09-12")],
      removed: [d("2026-09-09")],
    });

    expect(days).not.toContain("2026-09-09");
    expect(days).toContain("2026-09-12");
    expect(days).toHaveLength(10);
  });

  it("liefert immer aufsteigend sortiert und duplikatfrei", () => {
    const days = applyDayOverrides(defaults, {
      period,
      added: [d("2026-09-13"), d("2026-09-12"), d("2026-09-12"), d("2026-09-07")],
      removed: [],
    });

    expect(days).toEqual([...days].sort());
    expect(new Set(days).size).toBe(days.length);
    expect(days.slice(0, 7)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("wirft DAY_OUTSIDE_PERIOD, wenn ein zugewaehlter Tag ausserhalb des Zeitraums liegt", () => {
    expect(() =>
      applyDayOverrides(defaults, { period, added: [d("2026-09-19")], removed: [] }),
    ).toThrow(expect.objectContaining({ code: "DAY_OUTSIDE_PERIOD" }));

    expect(() =>
      applyDayOverrides(defaults, { period, added: [d("2026-09-06")], removed: [] }),
    ).toThrow(expect.objectContaining({ code: "DAY_OUTSIDE_PERIOD" }));
  });

  it("laesst das Entfernen eines nicht enthaltenen Tages wirkungslos", () => {
    const days = applyDayOverrides(defaults, {
      period,
      added: [],
      removed: [d("2026-09-12")],
    });

    expect(days).toEqual(defaults);
  });
});
