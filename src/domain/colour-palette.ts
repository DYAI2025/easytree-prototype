/**
 * Acht Orientierungsfarben fuer Einsaetze (REQ-F-011).
 *
 * Farbe ist nachgeordnet: sie ordnet, sie traegt keinen Status. Jede Karte
 * nennt ihren Einsatz zusaetzlich im Text (REQ-NF-004). Gespeichert wird immer
 * der KEY, nie ein Hexwert - so bleibt die Palette aenderbar, ohne Daten zu
 * migrieren.
 *
 * Die Werte sind nicht nach Augenmass gewaehlt, sondern gegen die Schwellen
 * unten gerechnet; der Test ist die Quelle der Wahrheit.
 */

/** Kleintext auf Fuellung (WCAG 1.4.3). */
export const TEXT_CONTRAST_MIN = 4.5;
/** Rahmen als UI-Komponente auf der Flaeche (WCAG 1.4.11). */
export const UI_CONTRAST_MIN = 3;

/** Muss `--eyt-bg-surface` aus `src/styles/tokens.css` entsprechen. */
export const SURFACE_LIGHT = "#ffffff";
export const SURFACE_DARK = "#211f1c";

export const COLOUR_KEYS = [
  "moos",
  "ocker",
  "himmel",
  "ton",
  "pflaume",
  "petrol",
  "schiefer",
  "rose",
] as const;

export type ColourKey = (typeof COLOUR_KEYS)[number];

export interface ColourScheme {
  /** Linker Balken der Karte und Rahmen des Spans. */
  readonly frame: string;
  /** Flaechenfarbe des Spans. */
  readonly fill: string;
  /** Textfarbe auf `fill`. */
  readonly text: string;
}

export interface Colour {
  readonly label: string;
  readonly light: ColourScheme;
  readonly dark: ColourScheme;
}

const PALETTE: Record<ColourKey, Colour> = {
  moos: {
    label: "Moos",
    light: { frame: "#5e9e51", fill: "#f3f7f3", text: "#11260d" },
    dark: { frame: "#5a974e", fill: "#1e2d1a", text: "#eff7ed" },
  },
  ocker: {
    label: "Ocker",
    light: { frame: "#b28834", fill: "#f9f6f0", text: "#2b1f08" },
    dark: { frame: "#b28834", fill: "#352a12", text: "#faf5eb" },
  },
  himmel: {
    label: "Himmel",
    light: { frame: "#5196c8", fill: "#f1f5f9", text: "#081c2b" },
    dark: { frame: "#377dae", fill: "#162c3c", text: "#ebf4fa" },
  },
  ton: {
    label: "Ton",
    light: { frame: "#b6825d", fill: "#f7f4f2", text: "#28170b" },
    dark: { frame: "#9e6b47", fill: "#36271c", text: "#f8f1ec" },
  },
  pflaume: {
    label: "Pflaume",
    light: { frame: "#ab68b1", fill: "#f7f3f7", text: "#240d26" },
    dark: { frame: "#9b53a2", fill: "#38223a", text: "#f7edf7" },
  },
  petrol: {
    label: "Petrol",
    light: { frame: "#419caa", fill: "#f1f7f8", text: "#09252a" },
    dark: { frame: "#3f99a6", fill: "#162e32", text: "#ebf7f9" },
  },
  schiefer: {
    label: "Schiefer",
    light: { frame: "#7c8a9c", fill: "#f3f4f7", text: "#111822" },
    dark: { frame: "#637083", fill: "#242a32", text: "#eff2f5" },
  },
  rose: {
    label: "Rose",
    light: { frame: "#c05972", fill: "#f8f1f3", text: "#2a0911" },
    dark: { frame: "#b94663", fill: "#431e27", text: "#f9ebef" },
  },
};

export function isColourKey(value: string): value is ColourKey {
  return (COLOUR_KEYS as readonly string[]).includes(value);
}

export function colourFor(key: string): Colour {
  if (!isColourKey(key)) {
    throw new Error(`Unbekannter Farbschluessel: ${key}`);
  }

  return PALETTE[key];
}

function channelLuminance(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Relative Leuchtdichte nach WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Unbekannter Farbwert: ${hex}`);
  }

  const [red, green, blue] = [0, 2, 4].map((offset) =>
    channelLuminance(Number.parseInt(value.slice(offset, offset + 2), 16) / 255),
  ) as [number, number, number];

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Kontrastverhaeltnis nach WCAG 2.x; Reihenfolge der Argumente egal. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}
