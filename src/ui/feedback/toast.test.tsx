import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Toast } from "./toast";

afterEach(cleanup);

/*
 * EYT-175.
 *
 * Der Live-Bereich ist das eigentliche Produkt dieses Tickets: der Live-QA-Lauf
 * QA-2026-09-09-01 fand nach erfolgreichen Mutationen ueberhaupt kein
 * `[role="status"]` vor. Hier ist deshalb nicht nur der Text geprueft, sondern
 * die Bedingungen, unter denen assistive Technik ihn ueberhaupt vorliest.
 */
describe("Toast", () => {
  it("haelt den Live-Bereich schon VOR der ersten Meldung im Dokument", () => {
    render(<Toast text={null} />);

    /*
     * Der entscheidende Punkt und der Grund, warum dieser Test existiert: eine
     * Live-Region, die erst zusammen mit ihrem Text eingehaengt wird, gilt bei
     * assistiver Technik als neuer Inhalt und nicht als Aenderung - sie wird
     * dann typischerweise NICHT vorgelesen. Der Bereich muss also leer
     * dastehen und sich spaeter fuellen.
     */
    expect(screen.getByTestId("erfolgsmeldung")).toBeTruthy();
    expect(screen.getByRole("status")).toBe(screen.getByTestId("erfolgsmeldung"));
  });

  it("meldet hoeflich statt zu unterbrechen", () => {
    render(<Toast text="Einsatz angelegt" />);

    const bereich = screen.getByTestId("erfolgsmeldung");

    expect(bereich.getAttribute("aria-live")).toBe("polite");
    // Erfolg ist kein Fehleralert (Accessibility-Vertrag des Tickets).
    expect(bereich.getAttribute("role")).toBe("status");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("zeigt den Text sichtbar im selben Bereich", () => {
    render(<Toast text="Einsatz „Baumpflege“ angelegt - 4 Baustellentage." />);

    const bereich = screen.getByTestId("erfolgsmeldung");

    expect(bereich.textContent).toContain("4 Baustellentage");
    // Sichtbar heisst: NICHT nur fuer den Screenreader da.
    expect(bereich.className.split(/\s+/)).not.toContain("sr-only");
  });

  it("beansprucht ohne Meldung keinen Platz im Layout", () => {
    render(<Toast text={null} />);

    const bereich = screen.getByTestId("erfolgsmeldung");

    /*
     * `sr-only` ist absolut positioniert. Ein absolut positioniertes Kind ist
     * kein Flex-Item, zaehlt also weder mit eigener Hoehe noch mit einem
     * zusaetzlichen `gap` in die umgebende Spalte. Ohne diese Eigenschaft
     * verschoebe der stets vorhandene Bereich jedes Bild der Sichtpruefung.
     */
    expect(bereich.className.split(/\s+/)).toContain("sr-only");
    expect(bereich.textContent).toBe("");
  });

  it("erneuert den Inhalt auch bei zweimal derselben Meldung", () => {
    const { rerender } = render(<Toast text="Baustellentag 10.09.2026 gespeichert." nummer={1} />);

    const bereich = screen.getByTestId("erfolgsmeldung");
    const zuerst = bereich.firstElementChild;

    rerender(<Toast text="Baustellentag 10.09.2026 gespeichert." nummer={2} />);

    /*
     * Zweimal derselbe Satz ist ein echter Fall - denselben Tag zweimal
     * speichern. Bliebe der Textknoten dabei unveraendert, gaebe es keine
     * Mutation im Live-Bereich und die zweite Bestaetigung waere stumm.
     */
    expect(bereich.firstElementChild).not.toBe(zuerst);
    expect(bereich.textContent).toContain("10.09.2026");
    // Der Bereich selbst bleibt derselbe Knoten - er darf nicht neu einhaengen.
    expect(screen.getByTestId("erfolgsmeldung")).toBe(bereich);
  });
});
