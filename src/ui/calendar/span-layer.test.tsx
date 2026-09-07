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
