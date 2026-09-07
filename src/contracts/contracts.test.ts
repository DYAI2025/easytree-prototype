import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  fromWire,
  LocalDateSchema,
  MinorUnitsSchema,
  MinorUnitsWireSchema,
  toWire,
} from "./common";
import { DayChangeCommand } from "./day-change";
import { CreateEngagementCommand } from "./engagement";

describe("LocalDateSchema", () => {
  it("nimmt ein gueltiges Datum an", () => {
    expect(LocalDateSchema.parse("2026-09-07")).toBe("2026-09-07");
  });

  it("weist unmoegliche Kalenderdaten ab", () => {
    expect(LocalDateSchema.safeParse("2026-13-01").success).toBe(false);
    expect(LocalDateSchema.safeParse("2026-02-31").success).toBe(false);
    expect(LocalDateSchema.safeParse("2026-9-7").success).toBe(false);
    expect(LocalDateSchema.safeParse("07.09.2026").success).toBe(false);
  });
});

describe("MinorUnitsSchema", () => {
  it("nimmt eine Dezimalzeichenkette an und liefert bigint", () => {
    const wert = MinorUnitsSchema.parse("25000");

    expect(typeof wert).toBe("bigint");
    expect(wert).toBe(25000n);
  });

  it("weist negative und gebrochene Werte ab", () => {
    expect(MinorUnitsSchema.safeParse("-1").success).toBe(false);
    expect(MinorUnitsSchema.safeParse("1.5").success).toBe(false);
    expect(MinorUnitsSchema.safeParse("abc").success).toBe(false);
  });

  it("haelt das Wire-Format als String und bleibt JSON-serialisierbar", () => {
    expect(toWire(50_000n)).toBe("50000");
    expect(() => JSON.stringify({ total: toWire(50_000n) })).not.toThrow();
    // Der Gegenbeweis: bigint direkt ist NICHT serialisierbar.
    expect(() => JSON.stringify({ total: 50_000n })).toThrow(TypeError);
    expect(fromWire("50000")).toBe(50_000n);
    expect(MinorUnitsWireSchema.parse("50000")).toBe("50000");
  });
});

describe("CreateEngagementCommand", () => {
  const basis = {
    worksiteId: "a0000000-0000-4000-8000-000000000001",
    title: "Rueckschnitt",
    colourKey: "moos",
  };

  it("verlangt ein Startdatum", () => {
    expect(CreateEngagementCommand.safeParse({ ...basis }).success).toBe(false);
    expect(
      CreateEngagementCommand.safeParse({
        ...basis,
        startDate: "2026-09-07",
        endDate: "2026-09-18",
      }).success,
    ).toBe(true);
  });

  it("nimmt endDate null zusammen mit einem Planungshorizont an", () => {
    const result = CreateEngagementCommand.safeParse({
      ...basis,
      startDate: "2026-09-07",
      endDate: null,
      planningHorizonDate: "2026-09-30",
    });

    expect(result.success).toBe(true);
  });

  it("weist einen unbekannten Farbschluessel ab", () => {
    expect(
      CreateEngagementCommand.safeParse({
        ...basis,
        colourKey: "neonpink",
        startDate: "2026-09-07",
        endDate: "2026-09-18",
      }).success,
    ).toBe(false);
  });
});

describe("DayChangeCommand", () => {
  it("verlangt scope und expectedRevisionNo", () => {
    const unvollstaendig = DayChangeCommand.safeParse({
      worksiteDayId: "a0000000-0000-4000-8000-000000000001",
      changes: {},
    });

    expect(unvollstaendig.success).toBe(false);

    const vollstaendig = DayChangeCommand.safeParse({
      worksiteDayId: "a0000000-0000-4000-8000-000000000001",
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: {},
    });

    expect(vollstaendig.success).toBe(true);
  });

  it("kennt genau zwei Scopes - eine dritte Option ist HUMAN_INPUT_REQUIRED (H-02)", () => {
    expect(
      DayChangeCommand.safeParse({
        worksiteDayId: "a0000000-0000-4000-8000-000000000001",
        scope: "WHOLE_ENGAGEMENT",
        expectedRevisionNo: 1,
        changes: {},
      }).success,
    ).toBe(false);
  });
});

describe("Contract Boundary", () => {
  it("importiert in KEINER Vertragsdatei etwas aus src/server", () => {
    const dateien = readdirSync("src/contracts").filter((name) => name.endsWith(".ts"));
    const verstoesse: string[] = [];

    for (const datei of dateien) {
      const inhalt = readFileSync(`src/contracts/${datei}`, "utf8");

      if (/from\s+["'][^"']*server/.test(inhalt) || /from\s+["']\.\.\/server/.test(inhalt)) {
        verstoesse.push(datei);
      }
    }

    expect(verstoesse).toEqual([]);
    expect(dateien.length).toBeGreaterThanOrEqual(8);
  });
});
