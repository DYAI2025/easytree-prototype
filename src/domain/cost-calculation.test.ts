import { describe, expect, it } from "vitest";

import { calculateEngagementCosts, COST_RULE_VERSION } from "./cost-calculation";
import { parseLocalDate, type LocalDate } from "./local-date";

const d = (value: string): LocalDate => parseLocalDate(value);

const ANNA = { id: "e-anna", label: "Anna", dailyCostMinorUnits: 25_000n };
const ERIK = { id: "e-erik", label: "Erik", dailyCostMinorUnits: null };
const HEBEBUEHNE = { id: "r-hb", label: "Hebebuehne", dailyCostMinorUnits: 12_000n };

function input(overrides: Partial<Parameters<typeof calculateEngagementCosts>[0]> = {}) {
  return {
    engagementId: "eng-1",
    days: [
      { date: d("2026-09-07"), employees: [ANNA], resources: [] },
      { date: d("2026-09-08"), employees: [ANNA], resources: [] },
    ],
    ...overrides,
  };
}

describe("calculateEngagementCosts", () => {
  it("summiert zwei Tage mal einen Tagessatz", () => {
    const overview = calculateEngagementCosts(input());

    expect(overview.totalMinorUnits).toBe(50_000n);
    expect(overview.complete).toBe(true);
    expect(overview.missingCount).toBe(0);
    expect(overview.currency).toBe("EUR");
  });

  it("zaehlt eine fehlende Grundlage als fehlt und niemals als 0", () => {
    const overview = calculateEngagementCosts(
      input({
        days: [
          { date: d("2026-09-07"), employees: [ANNA, ERIK], resources: [] },
          { date: d("2026-09-08"), employees: [ANNA, ERIK], resources: [] },
        ],
      }),
    );

    const erikPositions = overview.days.flatMap((day) =>
      day.positions.filter((position) => position.subjectId === ERIK.id),
    );

    expect(erikPositions).toHaveLength(2);
    expect(erikPositions.every((position) => position.missing)).toBe(true);
    // Der entscheidende Punkt: fehlt heisst null, nicht 0n.
    expect(erikPositions.every((position) => position.amountMinorUnits === null)).toBe(true);
    expect(erikPositions.some((position) => position.amountMinorUnits === 0n)).toBe(false);

    expect(overview.missingCount).toBe(2);
    expect(overview.complete).toBe(false);
    // Erik erhoeht die Summe nicht und senkt sie auch nicht.
    expect(overview.totalMinorUnits).toBe(50_000n);

    const erik = overview.byEmployee.find((entry) => entry.subjectId === ERIK.id);
    expect(erik?.totalMinorUnits).toBe(0n);
    expect(erik?.missingCount).toBe(2);
  });

  it("aggregiert Ressourcen getrennt, zaehlt sie aber in die Tagessumme", () => {
    const overview = calculateEngagementCosts(
      input({
        days: [
          { date: d("2026-09-07"), employees: [ANNA], resources: [HEBEBUEHNE] },
          { date: d("2026-09-08"), employees: [ANNA], resources: [] },
        ],
      }),
    );

    expect(overview.byEmployee.map((entry) => entry.subjectId)).toEqual([ANNA.id]);
    expect(overview.byResource.map((entry) => entry.subjectId)).toEqual([HEBEBUEHNE.id]);
    expect(overview.byResource[0]?.totalMinorUnits).toBe(12_000n);

    expect(overview.days[0]?.subtotalMinorUnits).toBe(37_000n);
    expect(overview.days[1]?.subtotalMinorUnits).toBe(25_000n);
    expect(overview.totalMinorUnits).toBe(62_000n);
  });

  it("laesst geplante Uhrzeiten die Summe unveraendert", () => {
    const ohneZeiten = calculateEngagementCosts(input());
    const mitZeiten = calculateEngagementCosts(
      input({
        days: [
          {
            date: d("2026-09-07"),
            employees: [ANNA],
            resources: [],
            plannedStart: "08:00",
            plannedEnd: "18:00",
          },
          {
            date: d("2026-09-08"),
            employees: [ANNA],
            resources: [],
            plannedStart: "06:00",
            plannedEnd: "22:00",
          },
        ],
      }),
    );

    expect(mitZeiten.totalMinorUnits).toBe(ohneZeiten.totalMinorUnits);
    expect(mitZeiten.totalMinorUnits).toBe(50_000n);
  });

  it("nennt die Regelversion", () => {
    expect(calculateEngagementCosts(input()).ruleVersion).toBe("prototype-daily-rate-v1");
    expect(COST_RULE_VERSION).toBe("prototype-daily-rate-v1");
  });

  it("liefert fuer einen Einsatz ohne Tage eine leere, vollstaendige Uebersicht", () => {
    const overview = calculateEngagementCosts({ engagementId: "eng-leer", days: [] });

    expect(overview.totalMinorUnits).toBe(0n);
    expect(overview.complete).toBe(true);
    expect(overview.days).toEqual([]);
  });

  it("rechnet ausschliesslich mit bigint", () => {
    const overview = calculateEngagementCosts(input());

    expect(typeof overview.totalMinorUnits).toBe("bigint");
    expect(typeof overview.days[0]?.subtotalMinorUnits).toBe("bigint");
    expect(typeof overview.byEmployee[0]?.totalMinorUnits).toBe("bigint");
  });
});
