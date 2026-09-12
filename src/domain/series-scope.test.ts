import { describe, expect, it } from "vitest";

import { parseLocalDate, type LocalDate } from "./local-date";
import { resolveSeriesTargets, targetIdsOf, type SeriesDay } from "./series-scope";

const d = (value: string): LocalDate => parseLocalDate(value);

/** Mo-Fr von 2026-09-07 bis 2026-09-18, alle materialisiert. */
function tage(overrides: Record<string, SeriesDay["origin"]> = {}): SeriesDay[] {
  return [
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
  ].map((date) => ({
    worksiteDayId: `wd-${date}`,
    date: d(date),
    origin: overrides[date] ?? "materialized",
  }));
}

const HEUTE = d("2026-09-10");

describe("resolveSeriesTargets", () => {
  it("laesst Tage vor dem Startpunkt weg", () => {
    const rows = resolveSeriesTargets({ days: tage(), fromDate: d("2026-09-10"), today: HEUTE });

    expect(rows.map((row) => row.date)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(rows.map((row) => row.date)).not.toContain("2026-09-09");
  });

  it("sperrt Tage vor heute und macht sie nie zum Ziel", () => {
    // Startpunkt bewusst VOR heute: nur so entstehen Zeilen, die im Zeitraum
    // liegen und trotzdem in der Vergangenheit sind.
    const rows = resolveSeriesTargets({ days: tage(), fromDate: d("2026-09-08"), today: HEUTE });
    const vergangen = rows.filter((row) => row.date < "2026-09-10");

    expect(vergangen.map((row) => row.date)).toEqual(["2026-09-08", "2026-09-09"]);
    expect(vergangen.every((row) => row.status === "past_locked")).toBe(true);
    expect(targetIdsOf(rows)).not.toContain("wd-2026-09-08");
    expect(targetIdsOf(rows)).not.toContain("wd-2026-09-09");
  });

  it("schliesst individuell angepasste Tage standardmaessig aus", () => {
    const rows = resolveSeriesTargets({
      days: tage({ "2026-09-15": "day_edit" }),
      fromDate: d("2026-09-10"),
      today: HEUTE,
    });
    const angepasst = rows.find((row) => row.date === "2026-09-15");

    expect(angepasst?.status).toBe("adjusted_excluded");
    expect(targetIdsOf(rows)).not.toContain("wd-2026-09-15");
  });

  it("bezieht einen angepassten Tag nur nach ausdruecklicher Auswahl ein", () => {
    const rows = resolveSeriesTargets({
      days: tage({ "2026-09-15": "day_edit" }),
      fromDate: d("2026-09-10"),
      today: HEUTE,
      includeAdjustedIds: ["wd-2026-09-15"],
    });
    const angepasst = rows.find((row) => row.date === "2026-09-15");

    expect(angepasst?.status).toBe("adjusted_included");
    expect(targetIdsOf(rows)).toContain("wd-2026-09-15");
  });

  it("behandelt materialized und series_edit als unveraendert und damit als Ziel", () => {
    const rows = resolveSeriesTargets({
      days: tage({ "2026-09-16": "series_edit" }),
      fromDate: d("2026-09-10"),
      today: HEUTE,
    });

    expect(rows.find((row) => row.date === "2026-09-11")?.status).toBe("unchanged");
    expect(rows.find((row) => row.date === "2026-09-16")?.status).toBe("unchanged");
    expect(targetIdsOf(rows)).toContain("wd-2026-09-16");
  });

  it("traegt fuer jede Zeile die Baustellentag-ID", () => {
    const rows = resolveSeriesTargets({ days: tage(), fromDate: d("2026-09-10"), today: HEUTE });

    expect(rows.every((row) => row.worksiteDayId.length > 0)).toBe(true);
    expect(rows.map((row) => row.worksiteDayId)).toEqual([
      "wd-2026-09-10",
      "wd-2026-09-11",
      "wd-2026-09-14",
      "wd-2026-09-15",
      "wd-2026-09-16",
      "wd-2026-09-17",
      "wd-2026-09-18",
    ]);
  });

  it("laesst einen angepassten Tag in der Vergangenheit gesperrt, auch wenn er ausgewaehlt ist", () => {
    const rows = resolveSeriesTargets({
      days: tage({ "2026-09-08": "day_edit" }),
      fromDate: d("2026-09-08"),
      today: HEUTE,
      includeAdjustedIds: ["wd-2026-09-08"],
    });

    expect(rows.find((row) => row.date === "2026-09-08")?.status).toBe("past_locked");
    expect(targetIdsOf(rows)).not.toContain("wd-2026-09-08");
  });

  it("liefert die Zeilen aufsteigend sortiert", () => {
    const rows = resolveSeriesTargets({
      days: [...tage()].reverse(),
      fromDate: d("2026-09-10"),
      today: HEUTE,
    });

    expect(rows.map((row) => row.date)).toEqual([...rows.map((row) => row.date)].sort());
  });
});
