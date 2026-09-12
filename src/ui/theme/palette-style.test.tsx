import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COLOUR_KEYS, colourFor } from "../../domain/colour-palette";
import { PaletteStyle } from "./palette-style";

describe("PaletteStyle", () => {
  it("liefert je Farbschluessel frame, fill und text als Variable", () => {
    const { container } = render(<PaletteStyle />);
    const css = container.querySelector("style")?.textContent ?? "";

    for (const key of COLOUR_KEYS) {
      const farbe = colourFor(key);

      expect(css).toContain(`--eyt-colour-${key}-frame: ${farbe.light.frame}`);
      expect(css).toContain(`--eyt-colour-${key}-fill: ${farbe.light.fill}`);
      expect(css).toContain(`--eyt-colour-${key}-text: ${farbe.light.text}`);
    }
  });

  it("setzt im Dunkelmodus jede Rolle neu, damit keine im Hellwert stehen bleibt", () => {
    const { container } = render(<PaletteStyle />);
    const css = container.querySelector("style")?.textContent ?? "";
    const dunkel = css.slice(css.indexOf("prefers-color-scheme: dark"));

    expect(dunkel).not.toBe("");

    for (const key of COLOUR_KEYS) {
      const farbe = colourFor(key);

      expect(dunkel).toContain(`--eyt-colour-${key}-frame: ${farbe.dark.frame}`);
      expect(dunkel).toContain(`--eyt-colour-${key}-fill: ${farbe.dark.fill}`);
      expect(dunkel).toContain(`--eyt-colour-${key}-text: ${farbe.dark.text}`);
    }
  });

  it("erzeugt die Werte aus der Domainpalette und nicht aus einer zweiten Liste", () => {
    const { container } = render(<PaletteStyle />);
    const css = container.querySelector("style")?.textContent ?? "";

    // Ein Hexwert, der nicht in der Palette steht, darf hier nicht auftauchen.
    const erlaubt = new Set(
      COLOUR_KEYS.flatMap((key) => {
        const farbe = colourFor(key);

        return [
          farbe.light.frame,
          farbe.light.fill,
          farbe.light.text,
          farbe.dark.frame,
          farbe.dark.fill,
          farbe.dark.text,
        ];
      }),
    );

    for (const hex of css.match(/#[0-9a-f]{6}/g) ?? []) {
      expect(erlaubt.has(hex)).toBe(true);
    }

    expect((css.match(/#[0-9a-f]{6}/g) ?? []).length).toBe(COLOUR_KEYS.length * 6);
  });
});
