import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COLOUR_KEYS, colourFor } from "../../domain/colour-palette";
import { StepPeriod, type StepPeriodWerte } from "./step-period";

afterEach(cleanup);

async function zeitraum(nutzer: ReturnType<typeof userEvent.setup>, von: string, bis: string) {
  await nutzer.clear(screen.getByLabelText("Beginn"));
  await nutzer.type(screen.getByLabelText("Beginn"), von);
  await nutzer.clear(screen.getByLabelText("Ende"));
  await nutzer.type(screen.getByLabelText("Ende"), bis);
}

function zusammenfassung(): string {
  return screen.getByTestId("arbeitstage").textContent ?? "";
}

describe("StepPeriod", () => {
  it("leitet 10 Arbeitstage ab, OHNE dass der Tagespicker angefasst wird", async () => {
    const nutzer = userEvent.setup();

    render(<StepPeriod onNext={() => {}} />);
    await zeitraum(nutzer, "2026-09-07", "2026-09-18");

    expect(zusammenfassung()).toContain("10 Arbeitstage");

    // Anti-Drift: der Tagespicker ist KEIN Pflichtschritt. Er ist bis hierher
    // nicht einmal eingeblendet - es kann also gar keine Interaktion gegeben
    // haben, die zu der Zahl beigetragen haette.
    expect(screen.queryByTestId("tage-picker")).toBeNull();
    expect(screen.getByRole("button", { name: /Tage anpassen/ })).toBeTruthy();
  });

  it("macht bei offenem Ende den Planungshorizont sichtbar und zur Pflicht", async () => {
    const nutzer = userEvent.setup();
    const weiter = vi.fn();

    render(<StepPeriod onNext={weiter} />);
    await zeitraum(nutzer, "2026-09-07", "2026-09-18");

    expect(screen.queryByLabelText("Planen bis")).toBeNull();

    await nutzer.click(screen.getByRole("checkbox", { name: "Ende offen" }));

    const horizont = screen.getByLabelText("Planen bis");

    expect(screen.queryByLabelText("Ende")).toBeNull();

    await nutzer.click(screen.getByRole("button", { name: "Weiter" }));

    expect(weiter).not.toHaveBeenCalled();
    expect(horizont.getAttribute("aria-invalid")).toBe("true");

    await nutzer.type(horizont, "2026-10-31");
    await nutzer.click(screen.getByRole("button", { name: "Weiter" }));

    expect(weiter).toHaveBeenCalledTimes(1);
    expect((weiter.mock.calls[0]![0] as StepPeriodWerte).planningHorizonDate).toBe("2026-10-31");
  });

  it("senkt die Zahl auf 9, wenn ein Werktag abgewaehlt wird", async () => {
    const nutzer = userEvent.setup();

    render(<StepPeriod onNext={() => {}} />);
    await zeitraum(nutzer, "2026-09-07", "2026-09-18");
    await nutzer.click(screen.getByRole("button", { name: /Tage anpassen/ }));

    const picker = screen.getByTestId("tage-picker");

    await nutzer.click(within(picker).getByRole("checkbox", { name: /09\.09\.2026/ }));

    expect(zusammenfassung()).toContain("9 Arbeitstage");
  });

  it("hebt die Zahl auf 11, wenn ein Samstag zugewaehlt wird", async () => {
    const nutzer = userEvent.setup();

    render(<StepPeriod onNext={() => {}} />);
    await zeitraum(nutzer, "2026-09-07", "2026-09-18");
    await nutzer.click(screen.getByRole("button", { name: /Tage anpassen/ }));

    const picker = screen.getByTestId("tage-picker");
    const samstag = within(picker).getByRole("checkbox", { name: /12\.09\.2026/ });

    expect((samstag as HTMLInputElement).checked).toBe(false);

    await nutzer.click(samstag);

    expect(zusammenfassung()).toContain("11 Arbeitstage");
  });

  it("laesst Uhrzeiten ohne aktivierte Auswahl ganz aus dem Formularzustand", async () => {
    const nutzer = userEvent.setup();
    const weiter = vi.fn();

    render(<StepPeriod onNext={weiter} />);
    await zeitraum(nutzer, "2026-09-07", "2026-09-18");
    await nutzer.click(screen.getByRole("button", { name: "Weiter" }));

    const werte = weiter.mock.calls[0]![0] as StepPeriodWerte;

    // Nicht "leerer String" und nicht "00:00": die Felder existieren nicht.
    expect(werte.plannedStartTime).toBeUndefined();
    expect(werte.plannedEndTime).toBeUndefined();
    expect(Object.hasOwn(werte, "plannedStartTime")).toBe(false);
  });

  it("belegt die Uhrzeiten nach Aktivierung mit 08:00 und 18:00 vor", async () => {
    const nutzer = userEvent.setup();
    const weiter = vi.fn();

    render(<StepPeriod onNext={weiter} />);
    await zeitraum(nutzer, "2026-09-07", "2026-09-18");
    await nutzer.click(screen.getByRole("checkbox", { name: "Uhrzeiten planen" }));

    expect((screen.getByLabelText("Geplanter Beginn") as HTMLInputElement).value).toBe("08:00");
    expect((screen.getByLabelText("Geplantes Ende") as HTMLInputElement).value).toBe("18:00");

    await nutzer.click(screen.getByRole("button", { name: "Weiter" }));

    const werte = weiter.mock.calls[0]![0] as StepPeriodWerte;

    expect(werte.plannedStartTime).toBe("08:00");
    expect(werte.plannedEndTime).toBe("18:00");
  });

  it("bietet die Farbe als radiogroup mit acht benannten Optionen an", async () => {
    const nutzer = userEvent.setup();

    render(<StepPeriod onNext={() => {}} />);

    const gruppe = screen.getByRole("radiogroup", { name: "Farbe" });
    const optionen = within(gruppe).getAllByRole("radio");

    expect(optionen).toHaveLength(COLOUR_KEYS.length);

    // Namen, nicht nur Farbflaechen: eine reine Flaeche waere fuer
    // Screenreader und bei Farbfehlsichtigkeit nicht unterscheidbar.
    expect(optionen.map((o) => o.getAttribute("aria-label") ?? o.textContent)).toEqual(
      COLOUR_KEYS.map((key) => colourFor(key).label),
    );

    await nutzer.click(within(gruppe).getByRole("radio", { name: "Petrol" }));

    expect(within(gruppe).getByRole("radio", { name: "Petrol" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });
});
