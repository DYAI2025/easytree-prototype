import { describe, expect, it } from "vitest";

import { parseLocalDate, type LocalDate } from "./local-date";
import { buildMonthGrid, computeSpanSegments, MAX_VISIBLE_CARDS_PER_DAY } from "./month-grid";

const d = (value: string): LocalDate => parseLocalDate(value);

/** Alle Kalendertage von `from` bis `to` inklusiv - auch Wochenenden. */
function range(from: string, to: string): LocalDate[] {
  const days: LocalDate[] = [];
  let current = d(from);

  while (current <= d(to)) {
    days.push(current);
    const next = new Date(`${current}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    current = d(next.toISOString().slice(0, 10));
  }

  return days;
}

const flat = (grid: ReturnType<typeof buildMonthGrid>): LocalDate[] =>
  grid.weeks.flatMap((week) => week.days.map((day) => day.date));

describe("buildMonthGrid", () => {
  it("beginnt am Montag vor dem Monatsersten und fuellt volle Wochen", () => {
    // 2026-09-01 ist ein Dienstag, 2026-08-31 der Montag davor;
    // 2026-09-30 ist ein Mittwoch, die Woche laeuft bis Sonntag 2026-10-04.
    const grid = buildMonthGrid("2026-09");
    const cells = flat(grid);

    expect(cells[0]).toBe("2026-08-31");
    expect(cells.at(-1)).toBe("2026-10-04");
    expect(grid.weeks).toHaveLength(5);
    expect(cells).toHaveLength(35);
  });

  it("markiert Nachbarmonatstage als ausserhalb des Monats", () => {
    const grid = buildMonthGrid("2026-09");
    const byDate = new Map(grid.weeks.flatMap((w) => w.days).map((day) => [day.date, day.inMonth]));

    expect(byDate.get(d("2026-08-31"))).toBe(false);
    expect(byDate.get(d("2026-09-01"))).toBe(true);
    expect(byDate.get(d("2026-09-30"))).toBe(true);
    expect(byDate.get(d("2026-10-01"))).toBe(false);
    expect([...byDate.values()].filter(Boolean)).toHaveLength(30);
  });

  it("braucht fuer 2026-08 sechs Zeilen", () => {
    // 2026-08-01 ist ein Samstag -> Raster beginnt am Montag 2026-07-27,
    // der 31.08. faellt damit in die sechste Zeile.
    const grid = buildMonthGrid("2026-08");
    const cells = flat(grid);

    expect(grid.weeks).toHaveLength(6);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toBe("2026-07-27");
    expect(cells.at(-1)).toBe("2026-09-06");
  });

  it("traegt die ISO-Kalenderwoche je Zeile", () => {
    const grid = buildMonthGrid("2026-09");

    expect(grid.weeks.map((week) => week.isoWeek)).toEqual([36, 37, 38, 39, 40]);
  });

  it("exportiert die Obergrenze sichtbarer Karten", () => {
    expect(MAX_VISIBLE_CARDS_PER_DAY).toBe(3);
  });
});

describe("computeSpanSegments", () => {
  const grid = buildMonthGrid("2026-09");
  // Zeile 0 = 31.08.-06.09., Zeile 1 = 07.-13.09., Zeile 2 = 14.-20.09.
  const MO_BIS_FR = [
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
  ].map(d);

  it("bricht den Balken am ungeplanten Wochenende", () => {
    const segments = computeSpanSegments(grid, [{ engagementId: "e1", days: MO_BIS_FR }]);

    expect(segments).toEqual([
      {
        engagementId: "e1",
        rowIndex: 1,
        startCol: 1,
        endCol: 5,
        continuesLeft: false,
        continuesRight: false,
      },
      {
        engagementId: "e1",
        rowIndex: 2,
        startCol: 1,
        endCol: 5,
        continuesLeft: false,
        continuesRight: false,
      },
    ]);
  });

  it("verlaengert das Segment auf einen zugewaehlten Samstag", () => {
    const segments = computeSpanSegments(grid, [
      { engagementId: "e1", days: [...MO_BIS_FR, d("2026-09-12")] },
    ]);
    const row1 = segments.find((s) => s.rowIndex === 1);

    expect(row1?.startCol).toBe(1);
    expect(row1?.endCol).toBe(6);
    // Der Sonntag 13.09. fehlt weiterhin, der Balken laeuft also nicht weiter.
    expect(row1?.continuesRight).toBe(false);
  });

  it("endet nach sieben durchgehenden Tagen ohne Fortsetzung", () => {
    const segments = computeSpanSegments(grid, [
      { engagementId: "e1", days: range("2026-09-07", "2026-09-13") },
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      rowIndex: 1,
      startCol: 1,
      endCol: 7,
      continuesRight: false,
    });
  });

  it("setzt bei acht durchgehenden Tagen die Fortsetzung ueber die Zeilengrenze", () => {
    const segments = computeSpanSegments(grid, [
      { engagementId: "e1", days: range("2026-09-07", "2026-09-14") },
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ rowIndex: 1, endCol: 7, continuesRight: true });
    expect(segments[1]).toMatchObject({
      rowIndex: 2,
      startCol: 1,
      endCol: 1,
      continuesLeft: true,
    });
  });

  it("macht aus Luecken getrennte Segmente statt eines durchgehenden Balkens", () => {
    const segments = computeSpanSegments(grid, [
      { engagementId: "e1", days: [d("2026-09-07"), d("2026-09-09"), d("2026-09-11")] },
    ]);

    expect(segments).toHaveLength(3);
    expect(segments.map((s) => [s.startCol, s.endCol])).toEqual([
      [1, 1],
      [3, 3],
      [5, 5],
    ]);
    expect(segments.every((s) => !s.continuesLeft && !s.continuesRight)).toBe(true);
  });

  it("zeigt einen ueber die Monatsgrenze laufenden Einsatz mit continuesLeft", () => {
    // Durchgehender Zeitraum inklusive Wochenende: der 30.08. (Sonntag) ist
    // geplant, deshalb setzt sich der Balken links der Rasterkante fort.
    const segments = computeSpanSegments(grid, [
      { engagementId: "e1", days: range("2026-08-28", "2026-09-02") },
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      engagementId: "e1",
      rowIndex: 0,
      startCol: 1,
      endCol: 3,
      continuesLeft: true,
      continuesRight: false,
    });
  });

  it("liefert Segmente je Zeile disjunkt und aufsteigend", () => {
    const segments = computeSpanSegments(grid, [
      { engagementId: "e1", days: [...MO_BIS_FR, d("2026-09-12")] },
      { engagementId: "e2", days: [d("2026-09-21"), d("2026-09-22")] },
    ]);

    for (const engagementId of ["e1", "e2"]) {
      const rows = new Map<number, number[]>();

      for (const segment of segments.filter((s) => s.engagementId === engagementId)) {
        const seen = rows.get(segment.rowIndex) ?? [];
        expect(seen.every((col) => col < segment.startCol)).toBe(true);
        rows.set(segment.rowIndex, [...seen, segment.endCol]);
      }
    }

    expect(segments.filter((s) => s.engagementId === "e2")).toHaveLength(1);
  });
});
