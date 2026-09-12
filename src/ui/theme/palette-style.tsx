import { COLOUR_KEYS, colourFor } from "../../domain/colour-palette";

/**
 * Bringt die acht Einsatzfarben als CSS-Variablen in das Dokument.
 *
 * Warum ueberhaupt: die Palette ist datengetrieben (der Farbschluessel kommt
 * aus der Datenbank). Eine zur Laufzeit gebaute Tailwind-Klasse wie
 * `bg-${key}-frame` waere wirkungslos - Tailwind liest Klassennamen statisch
 * aus dem Quelltext und sieht so eine Klasse nie. Die Farbe fehlte dann
 * komplett, ohne dass irgendetwas rot wird.
 *
 * Warum hier und nicht in `tokens.css`: die Werte stehen bereits in
 * `src/domain/colour-palette.ts` und sind dort gegen die WCAG-Schwellen
 * gerechnet. Ein zweiter Satz Hexwerte im CSS koennte davon abdriften.
 */
export function PaletteStyle() {
  const variablen = (modus: "light" | "dark"): string =>
    COLOUR_KEYS.map((key) => {
      const schema = colourFor(key)[modus];

      return [
        `--eyt-colour-${key}-frame: ${schema.frame};`,
        `--eyt-colour-${key}-fill: ${schema.fill};`,
        `--eyt-colour-${key}-text: ${schema.text};`,
      ].join(" ");
    }).join(" ");

  // Wie tokens.css: im Dunkelmodus wird JEDE Rolle neu gesetzt, damit keine
  // unbemerkt im Hellwert stehen bleibt.
  const css = [
    `:root { ${variablen("light")} }`,
    `@media (prefers-color-scheme: dark) { :root { ${variablen("dark")} } }`,
  ].join("\n");

  return <style>{css}</style>;
}
