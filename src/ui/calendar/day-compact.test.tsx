import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseLocalDate } from "../../domain/local-date";
import { DayIndicator, DayList } from "./day-compact";
import type { DayCardModel } from "./day-card";

afterEach(cleanup);

const karten: DayCardModel[] = [
  {
    worksiteDayId: "wd-1",
    engagementId: "e-1",
    title: "Baumpflege Herbstschnitt",
    worksiteName: "Parkanlage Nordring",
    colourKey: "moos",
    employeeCount: 3,
    resourceCount: 2,
  },
  {
    worksiteDayId: "wd-2",
    engagementId: "e-2",
    title: "Sturmschaden Sofortmassnahme",
    worksiteName: "Innenhof Gruenblick",
    colourKey: "pflaume",
    employeeCount: 2,
    resourceCount: 1,
  },
];

/*
 * V049-01, Plan 6.2: unterhalb von 768 px zeigt die Tageszelle Farbpunkte und
 * einen Zaehler - nicht das Desktop-Kartenlayout.
 */
describe("DayIndicator", () => {
  it("zeigt die Anzahl paralleler Einsaetze als Text", () => {
    render(
      <DayIndicator
        date={parseLocalDate("2026-09-10")}
        cards={karten}
        selected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("tagesindikator").textContent).toContain("2 Einsaetze");
  });

  it("sagt Einsatz im Singular", () => {
    render(
      <DayIndicator
        date={parseLocalDate("2026-09-10")}
        cards={[karten[0]!]}
        selected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("tagesindikator").textContent).toContain("1 Einsatz");
  });

  it("traegt je Einsatz einen Farbpunkt, der selbst keine Information transportiert", () => {
    render(
      <DayIndicator
        date={parseLocalDate("2026-09-10")}
        cards={karten}
        selected={false}
        onSelect={() => {}}
      />,
    );

    const punkte = screen.getAllByTestId("farbpunkt");

    expect(punkte).toHaveLength(2);
    // Produktinvariante 6: Farbe ist Orientierung, nie Statuswahrheit. Geprueft
    // wird der Vertrag - die Punkte sind fuer assistive Technik unsichtbar -
    // und nicht, an welchem Element genau das aria-hidden haengt.
    for (const punkt of punkte) {
      expect(punkt.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(punkt.textContent).toBe("");
    }
  });

  it("nennt im zugaenglichen Namen das volle Datum und die Anzahl", () => {
    render(
      <DayIndicator
        date={parseLocalDate("2026-09-10")}
        cards={karten}
        selected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("tagesindikator").getAttribute("aria-label")).toBe(
      "Donnerstag, 10. September 2026, 2 Einsaetze, Tagesliste anzeigen",
    );
  });

  it("meldet die Auswahl ueber aria-pressed und nicht allein ueber Farbe", () => {
    const { rerender } = render(
      <DayIndicator
        date={parseLocalDate("2026-09-10")}
        cards={karten}
        selected={false}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("tagesindikator").getAttribute("aria-pressed")).toBe("false");

    rerender(
      <DayIndicator
        date={parseLocalDate("2026-09-10")}
        cards={karten}
        selected
        onSelect={() => {}}
      />,
    );

    const knopf = screen.getByTestId("tagesindikator");

    expect(knopf.getAttribute("aria-pressed")).toBe("true");
    expect(knopf.getAttribute("data-ausgewaehlt")).toBe("true");
  });

  it("waehlt den Tag aus, statt einen Drawer zu oeffnen", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <DayIndicator
        date={parseLocalDate("2026-09-10")}
        cards={karten}
        selected={false}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByTestId("tagesindikator"));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-09-10");
  });
});

describe("DayList", () => {
  it("benennt den gewaehlten Tag als Text, nicht nur farblich", () => {
    render(<DayList date={parseLocalDate("2026-09-10")} cards={karten} onOpen={() => {}} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Donnerstag, 10. September 2026",
    );
  });

  it("macht jede Tageskarte des Tages erreichbar", () => {
    render(<DayList date={parseLocalDate("2026-09-10")} cards={karten} onOpen={() => {}} />);

    expect(screen.getAllByTestId("tageskarte")).toHaveLength(2);
  });

  it("oeffnet den Baustellentag aus der Liste heraus", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(<DayList date={parseLocalDate("2026-09-10")} cards={karten} onOpen={onOpen} />);
    await user.click(screen.getAllByTestId("tageskarte")[1]!);

    expect(onOpen).toHaveBeenCalledExactlyOnceWith("wd-2");
  });
});
