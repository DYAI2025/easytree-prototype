import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { parseLocalDate } from "../../domain/local-date";
import { buildMonthGrid, computeSpanSegments } from "../../domain/month-grid";
import { SpanLayer } from "./span-layer";

afterEach(cleanup);

const grid = buildMonthGrid("2026-09");

const segmente = computeSpanSegments(grid, [
  {
    engagementId: "eng-1",
    days: [
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
    ].map(parseLocalDate),
  },
]);

describe("SpanLayer", () => {
  it("rendert je Segment ein rein dekoratives Element", () => {
    const { container } = render(
      <SpanLayer segments={segmente} colourByEngagement={{ "eng-1": "moos" }} />,
    );
    const balken = [...container.querySelectorAll('[data-testid="span-segment"]')];

    expect(balken).toHaveLength(2);
    // Der Balken traegt keine Information: die steckt in der Tageskarte.
    expect(balken.every((b) => b.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(balken.every((b) => b.textContent === "")).toBe(true);
  });

  it("setzt die Grid-Spalten um eins versetzt, weil Spalte 1 die KW ist", () => {
    const { container } = render(
      <SpanLayer segments={segmente} colourByEngagement={{ "eng-1": "moos" }} />,
    );
    const erstes = container.querySelector<HTMLElement>('[data-testid="span-segment"]');

    // startCol 1 (Montag) rendert auf Grid-Spalte 2.
    expect(erstes?.style.gridColumnStart).toBe("2");
    expect(erstes?.style.gridColumnEnd).toBe("7");
    expect(erstes?.getAttribute("data-zeile")).toBe("1");
  });

  it("kennzeichnet fortgesetzte Kanten", () => {
    const durchgehend = computeSpanSegments(grid, [
      {
        engagementId: "eng-2",
        days: [
          "2026-09-07",
          "2026-09-08",
          "2026-09-09",
          "2026-09-10",
          "2026-09-11",
          "2026-09-12",
          "2026-09-13",
          "2026-09-14",
        ].map(parseLocalDate),
      },
    ]);

    const { container } = render(
      <SpanLayer segments={durchgehend} colourByEngagement={{ "eng-2": "ocker" }} />,
    );
    const balken = [...container.querySelectorAll('[data-testid="span-segment"]')];

    expect(balken[0]?.getAttribute("data-weiter-rechts")).toBe("true");
    expect(balken[1]?.getAttribute("data-weiter-links")).toBe("true");
  });
});

describe("SpanLayer Farbe und Zeilenbasis", () => {
  it("faerbt den Balken ueber die Palettenvariablen statt ueber eine Klasse", () => {
    const { container } = render(
      <SpanLayer segments={segmente} colourByEngagement={{ "eng-1": "moos" }} />,
    );
    const balken = container.querySelector<HTMLElement>('[data-testid="span-segment"]')!;

    // Eine zur Laufzeit zusammengebaute Tailwind-Klasse wie `bg-moos-frame`
    // wird nie erzeugt - der Balken waere unsichtbar.
    expect(balken.className).not.toContain("moos");
    expect(balken.style.backgroundColor).toBe("var(--eyt-colour-moos-frame)");
  });

  it("verschiebt die Gitterzeile um rowBase, damit ein Segment in seine Wochenzeile passt", () => {
    const zweiteZeile = segmente.filter((s) => s.rowIndex === 2);

    expect(zweiteZeile).toHaveLength(1);

    const { container } = render(
      <SpanLayer segments={zweiteZeile} colourByEngagement={{ "eng-1": "moos" }} rowBase={2} />,
    );
    const balken = container.querySelector<HTMLElement>('[data-testid="span-segment"]')!;

    // Ohne rowBase landete das Segment in Gitterzeile 3 einer Zeile, die nur
    // eine hat - es wuerde zwei leere Zeilen erzeugen und alles verschieben.
    expect(balken.style.gridRowStart).toBe("1");
    // Die echte Zeilennummer bleibt als Information erhalten.
    expect(balken.getAttribute("data-zeile")).toBe("2");
  });
});
