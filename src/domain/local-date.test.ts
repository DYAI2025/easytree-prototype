import { describe, expect, it } from "vitest";

import {
  addDays,
  compareLocalDate,
  daysInMonth,
  formatLocalDate,
  isoWeekOf,
  isoWeekYearOf,
  isWeekend,
  localDateInZone,
  monthOf,
  parseLocalDate,
  weekdayOf,
} from "./local-date";

describe("parseLocalDate", () => {
  it("akzeptiert ein gültiges lokales Datum", () => {
    expect(parseLocalDate("2026-09-07")).toBe("2026-09-07");
  });

  it("weist den 31. Februar zurück", () => {
    expect(() => parseLocalDate("2026-02-31")).toThrow(/ungültig/i);
  });

  it("weist den 29. Februar in einem Nicht-Schaltjahr zurück", () => {
    expect(() => parseLocalDate("2026-02-29")).toThrow(/ungültig/i);
    expect(parseLocalDate("2028-02-29")).toBe("2028-02-29");
  });

  it("weist Formatfehler zurück", () => {
    expect(() => parseLocalDate("2026-9-7")).toThrow(/ungültig/i);
    expect(() => parseLocalDate("07.09.2026")).toThrow(/ungültig/i);
  });
});

describe("addDays", () => {
  it("überschreitet die Monatsgrenze im Nicht-Schaltjahr", () => {
    expect(addDays(parseLocalDate("2026-02-28"), 1)).toBe("2026-03-01");
  });

  it("trifft den Schalttag im Schaltjahr", () => {
    expect(addDays(parseLocalDate("2028-02-28"), 1)).toBe("2028-02-29");
  });

  it("überschreitet die Jahresgrenze in beide Richtungen", () => {
    expect(addDays(parseLocalDate("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(parseLocalDate("2026-01-01"), -1)).toBe("2025-12-31");
  });

  it("überspringt den DST-Wechsel ohne Tagesverlust", () => {
    // 2026-03-29 ist der Sommerzeitbeginn in Europe/Berlin (nur 23 Stunden).
    expect(addDays(parseLocalDate("2026-03-28"), 1)).toBe("2026-03-29");
    expect(addDays(parseLocalDate("2026-03-29"), 1)).toBe("2026-03-30");
  });
});

describe("weekdayOf und isWeekend", () => {
  it("zählt Montag als 1 und Sonntag als 7", () => {
    expect(weekdayOf(parseLocalDate("2026-09-07"))).toBe(1);
    expect(weekdayOf(parseLocalDate("2026-09-12"))).toBe(6);
    expect(weekdayOf(parseLocalDate("2026-09-13"))).toBe(7);
  });

  it("erkennt Samstag und Sonntag als Wochenende", () => {
    expect(isWeekend(parseLocalDate("2026-09-12"))).toBe(true);
    expect(isWeekend(parseLocalDate("2026-09-13"))).toBe(true);
    expect(isWeekend(parseLocalDate("2026-09-11"))).toBe(false);
  });
});

describe("isoWeekOf", () => {
  it("folgt ISO 8601 an den Jahresgrenzen", () => {
    // Erwartungswerte aus BSD `date +%V` / `+%G` (ISO-8601), nicht aus dieser
    // Implementierung.
    expect(isoWeekOf(parseLocalDate("2026-01-01"))).toBe(1);
    expect(isoWeekOf(parseLocalDate("2026-12-31"))).toBe(53);
    expect(isoWeekOf(parseLocalDate("2026-09-07"))).toBe(37);
  });

  it("trennt ISO-Wochenjahr und Kalenderjahr", () => {
    // Diese Faelle unterscheiden die Donnerstag-Regel vom blossen Kalenderjahr:
    //   2025-12-29 (Mo) -> KW 01 des ISO-Jahres 2026
    //   2027-01-01 (Fr) -> KW 53 des ISO-Jahres 2026
    //   2027-01-04 (Mo) -> KW 01 des ISO-Jahres 2027
    expect(isoWeekOf(parseLocalDate("2025-12-28"))).toBe(52);
    expect(isoWeekYearOf(parseLocalDate("2025-12-28"))).toBe(2025);

    expect(isoWeekOf(parseLocalDate("2025-12-29"))).toBe(1);
    expect(isoWeekYearOf(parseLocalDate("2025-12-29"))).toBe(2026);

    expect(isoWeekOf(parseLocalDate("2027-01-01"))).toBe(53);
    expect(isoWeekYearOf(parseLocalDate("2027-01-01"))).toBe(2026);

    expect(isoWeekOf(parseLocalDate("2027-01-03"))).toBe(53);
    expect(isoWeekOf(parseLocalDate("2027-01-04"))).toBe(1);
    expect(isoWeekYearOf(parseLocalDate("2027-01-04"))).toBe(2027);
  });
});

describe("monthOf, daysInMonth, compare und format", () => {
  it("schneidet den Monat ab", () => {
    expect(monthOf(parseLocalDate("2026-09-07"))).toBe("2026-09");
  });

  it("kennt die Monatslängen inklusive Schaltjahr", () => {
    expect(daysInMonth("2026-09")).toBe(30);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
  });

  it("sortiert chronologisch", () => {
    expect(
      compareLocalDate(parseLocalDate("2026-09-07"), parseLocalDate("2026-09-08")),
    ).toBeLessThan(0);
    expect(
      compareLocalDate(parseLocalDate("2026-09-08"), parseLocalDate("2026-09-07")),
    ).toBeGreaterThan(0);
    expect(compareLocalDate(parseLocalDate("2026-09-07"), parseLocalDate("2026-09-07"))).toBe(0);
  });

  it("formatiert aus Jahr, Monat und Tag", () => {
    expect(formatLocalDate(2026, 9, 7)).toBe("2026-09-07");
  });
});

describe("localDateInZone", () => {
  it("liefert am DST-Übergang das lokale Datum", () => {
    expect(localDateInZone(new Date("2026-03-29T00:30:00Z"), "Europe/Berlin")).toBe("2026-03-29");
  });

  it("rechnet den Abend in Berlin bereits auf den Folgetag", () => {
    expect(localDateInZone(new Date("2026-09-07T22:30:00Z"), "Europe/Berlin")).toBe("2026-09-08");
  });

  it("hängt nur von der übergebenen Zone ab, nicht von der Prozesszeitzone", () => {
    const instant = new Date("2026-09-07T22:30:00Z");

    expect(localDateInZone(instant, "Europe/Berlin")).toBe("2026-09-08");
    expect(localDateInZone(instant, "UTC")).toBe("2026-09-07");
    expect(localDateInZone(instant, "Pacific/Kiritimati")).toBe("2026-09-08");
    expect(localDateInZone(instant, "Pacific/Niue")).toBe("2026-09-07");
  });
});
