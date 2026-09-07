import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  colourFor,
  COLOUR_KEYS,
  contrastRatio,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TEXT_CONTRAST_MIN,
  UI_CONTRAST_MIN,
} from "./colour-palette";

describe("contrastRatio", () => {
  it("rechnet die WCAG-Formel gegen bekannte Ankerwerte", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 4);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 4);
    // Dokumentierter WCAG-Grenzfall: #767676 auf Weiss liegt knapp ueber 4.5.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.5422, 3);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
  });

  it("ist symmetrisch", () => {
    expect(contrastRatio("#1e5231", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#1e5231"),
      10,
    );
  });
});

describe("COLOUR_KEYS", () => {
  it("kennt genau acht Orientierungsfarben", () => {
    expect(COLOUR_KEYS).toHaveLength(8);
    expect([...COLOUR_KEYS]).toEqual([
      "moos",
      "ocker",
      "himmel",
      "ton",
      "pflaume",
      "petrol",
      "schiefer",
      "rose",
    ]);
  });

  it("wirft bei einem unbekannten Key", () => {
    expect(() => colourFor("tuerkis")).toThrow(/unbekannt/i);
  });

  it("haelt die Schwellen bei 4.5 und 3.0 - sie duerfen nicht abgesenkt werden", () => {
    expect(TEXT_CONTRAST_MIN).toBe(4.5);
    expect(UI_CONTRAST_MIN).toBe(3);
  });
});

describe("Kontrastnachweis je Farbe", () => {
  const modes = [
    { name: "light", surface: SURFACE_LIGHT },
    { name: "dark", surface: SURFACE_DARK },
  ] as const;

  for (const key of COLOUR_KEYS) {
    for (const mode of modes) {
      it(`${key}/${mode.name}: Text auf Fuellung >= 4.5 und Rahmen auf Flaeche >= 3.0`, () => {
        const scheme = colourFor(key)[mode.name];

        expect(contrastRatio(scheme.text, scheme.fill)).toBeGreaterThanOrEqual(TEXT_CONTRAST_MIN);
        expect(contrastRatio(scheme.frame, mode.surface)).toBeGreaterThanOrEqual(UI_CONTRAST_MIN);
      });
    }
  }

  it("traegt fuer jede Farbe ein lesbares Label", () => {
    for (const key of COLOUR_KEYS) {
      expect(colourFor(key).label.length).toBeGreaterThan(0);
    }
  });
});

describe("Flaechenfarben stimmen mit den Tokens ueberein", () => {
  it("nutzt dieselben Surface-Werte wie src/styles/tokens.css", () => {
    // Der Kontrastnachweis waere wertlos, wenn die Flaechenfarbe hier von der
    // im Stylesheet abweicht.
    const tokens = readFileSync("src/styles/tokens.css", "utf8");
    const surfaces = [...tokens.matchAll(/--eyt-bg-surface:\s*(#[0-9a-f]{6})/g)].map((m) => m[1]);

    expect(surfaces).toEqual([SURFACE_LIGHT, SURFACE_DARK]);
  });
});
