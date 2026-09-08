import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Drawer } from "./drawer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * jsdom kennt `matchMedia` nicht. Ohne Stub liefert der Reduced-Motion-Test
 * kein Ergebnis, sondern einen TypeError - und waere damit kein Nachweis.
 */
function stubReducedMotion(reduziert: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduziert && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function Buehne({ titel = "Einsatz anlegen" }: { readonly titel?: string }) {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOffen(true)}>
        Oeffnen
      </button>
      <Drawer open={offen} onOpenChange={setOffen} title={titel}>
        <button type="button">Erstes Feld</button>
        <button type="button">Zweites Feld</button>
      </Drawer>
    </>
  );
}

describe("Drawer", () => {
  it("setzt den Fokus beim Oeffnen in den Drawer", async () => {
    stubReducedMotion(false);
    const nutzer = userEvent.setup();

    render(<Buehne />);
    await nutzer.click(screen.getByRole("button", { name: "Oeffnen" }));

    const dialog = await screen.findByRole("dialog");

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it("haelt den Fokus im Drawer, statt ihn hinter den Drawer wandern zu lassen", async () => {
    stubReducedMotion(false);
    const nutzer = userEvent.setup();

    render(<Buehne />);

    // VOR dem Oeffnen greifen: der modale Dialog nimmt den Rest des Dokuments
    // aus dem Zugaenglichkeitsbaum, danach ist der Ausloeser ueber seine
    // Rolle nicht mehr auffindbar - das ist gewolltes Verhalten.
    const ausloeser = screen.getByRole("button", { name: "Oeffnen" });

    await nutzer.click(ausloeser);

    const dialog = await screen.findByRole("dialog");

    // 1. Der Rest des Dokuments liegt nicht mehr im Zugaenglichkeitsbaum.
    //    Ohne diese Pruefung bliebe der Test auch bei modal={false} gruen -
    //    gemessen: die reine Tab-Schleife allein erkennt das nicht.
    expect(ausloeser.closest("[aria-hidden]")?.getAttribute("aria-hidden")).toBe("true");

    // 2. Der Fokus zykliert IM Drawer: nach so vielen Tabs, wie es dort
    //    fokussierbare Elemente gibt, steht er wieder am Anfang.
    const fokussierbare = [...dialog.querySelectorAll("button, [href], input, select, textarea")];

    expect(fokussierbare.length).toBeGreaterThan(1);

    const start = document.activeElement;

    for (let i = 0; i < fokussierbare.length; i += 1) {
      await nutzer.tab();
      expect(document.activeElement).not.toBe(ausloeser);
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    expect(document.activeElement).toBe(start);
  });

  it("schliesst mit Esc und gibt den Fokus an den Ausloeser zurueck", async () => {
    stubReducedMotion(false);
    const nutzer = userEvent.setup();

    render(<Buehne />);
    const ausloeser = screen.getByRole("button", { name: "Oeffnen" });

    await nutzer.click(ausloeser);
    await screen.findByRole("dialog");
    await nutzer.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(ausloeser);
    });
  });

  it("verweist mit aria-labelledby auf die Ueberschrift", async () => {
    stubReducedMotion(false);
    const nutzer = userEvent.setup();

    render(<Buehne titel="Einsatz anlegen" />);
    await nutzer.click(screen.getByRole("button", { name: "Oeffnen" }));

    const dialog = await screen.findByRole("dialog");
    const id = dialog.getAttribute("aria-labelledby");

    expect(id).not.toBeNull();
    // Nicht nur "irgendeine id": sie muss auf die sichtbare Ueberschrift zeigen.
    expect(document.getElementById(id!)?.textContent).toBe("Einsatz anlegen");
    expect(screen.getByRole("heading", { name: "Einsatz anlegen" })).toBeTruthy();
  });

  it("verzichtet bei prefers-reduced-motion auf die Uebergangsklasse", async () => {
    stubReducedMotion(true);
    const nutzer = userEvent.setup();

    render(<Buehne />);
    await nutzer.click(screen.getByRole("button", { name: "Oeffnen" }));

    const dialog = await screen.findByRole("dialog");

    expect(dialog.getAttribute("data-bewegung")).toBe("reduziert");
    expect(dialog.className).not.toContain("transition");
  });

  it("nutzt die Uebergangsklasse, wenn keine Reduktion gewuenscht ist", async () => {
    stubReducedMotion(false);
    const nutzer = userEvent.setup();

    render(<Buehne />);
    await nutzer.click(screen.getByRole("button", { name: "Oeffnen" }));

    const dialog = await screen.findByRole("dialog");

    expect(dialog.getAttribute("data-bewegung")).toBe("voll");
    expect(dialog.className).toContain("transition");
  });
});
