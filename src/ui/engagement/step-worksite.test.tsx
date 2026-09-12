import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer } from "../../contracts/customer";
import type { Worksite } from "../../contracts/worksite";
import { StepWorksite } from "./step-worksite";

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiPost };
});

afterEach(cleanup);
beforeEach(() => {
  apiPost.mockReset();
});

const kunde = (id: string, name: string): Customer => ({
  id,
  name,
  contact: null,
  notes: null,
  active: true,
});

const baustelle = (id: string, customerId: string, name: string): Worksite => ({
  id,
  customerId,
  name,
  addressLine: "Musterweg 1",
  postalCode: null,
  city: null,
  country: "DE",
  lat: null,
  lng: null,
  geocodeSource: null,
  notes: null,
  active: true,
});

const KUNDEN = [
  kunde("11111111-1111-4111-8111-111111111111", "Stadtwerke"),
  kunde("22222222-2222-4222-8222-222222222222", "Wohnbau"),
];

const BAUSTELLEN = [
  baustelle("aaaaaaaa-1111-4111-8111-111111111111", KUNDEN[0]!.id, "Nordring"),
  baustelle("aaaaaaaa-2222-4222-8222-222222222222", KUNDEN[0]!.id, "Suedpark"),
  baustelle("bbbbbbbb-1111-4111-8111-111111111111", KUNDEN[1]!.id, "Innenhof"),
];

function auswahl(name: string): HTMLSelectElement {
  return screen.getByLabelText(name) as HTMLSelectElement;
}

describe("StepWorksite", () => {
  it("zeigt nur die Baustellen des gewaehlten Auftraggebers", async () => {
    const nutzer = userEvent.setup();

    render(<StepWorksite customers={KUNDEN} worksites={BAUSTELLEN} onNext={() => {}} />);

    await nutzer.selectOptions(auswahl("Auftraggeber"), KUNDEN[0]!.id);

    const feld = auswahl("Baustelle");
    const namen = within(feld)
      .getAllByRole("option")
      .map((o) => o.textContent)
      .filter((t) => t !== "Bitte waehlen");

    expect(namen).toEqual(["Nordring", "Suedpark"]);

    await nutzer.selectOptions(auswahl("Auftraggeber"), KUNDEN[1]!.id);

    expect(
      within(auswahl("Baustelle"))
        .getAllByRole("option")
        .map((o) => o.textContent)
        .filter((t) => t !== "Bitte waehlen"),
    ).toEqual(["Innenhof"]);
  });

  it("meldet eine fehlende Baustelle am Feld und setzt den Fokus dorthin", async () => {
    const nutzer = userEvent.setup();
    const weiter = vi.fn();

    render(<StepWorksite customers={KUNDEN} worksites={BAUSTELLEN} onNext={weiter} />);

    await nutzer.selectOptions(auswahl("Auftraggeber"), KUNDEN[0]!.id);
    await nutzer.click(screen.getByRole("button", { name: "Weiter" }));

    const feld = auswahl("Baustelle");

    expect(weiter).not.toHaveBeenCalled();
    expect(feld.getAttribute("aria-invalid")).toBe("true");
    // Der Fehler steht am Feld, nicht nur irgendwo auf der Seite.
    const fehlerId = feld.getAttribute("aria-describedby");
    expect(document.getElementById(fehlerId!)?.textContent).toContain("Baustelle");
    expect(document.activeElement).toBe(feld);
  });

  it("legt einen Auftraggeber inline an und waehlt ihn danach aus", async () => {
    const nutzer = userEvent.setup();
    const neu = kunde("33333333-3333-4333-8333-333333333333", "Gruenflaechenamt");

    apiPost.mockResolvedValue(neu);

    render(<StepWorksite customers={KUNDEN} worksites={BAUSTELLEN} onNext={() => {}} />);

    await nutzer.click(screen.getByRole("button", { name: "Neuen Auftraggeber anlegen" }));
    await nutzer.type(screen.getByLabelText("Name des Auftraggebers"), "Gruenflaechenamt");
    await nutzer.click(screen.getByRole("button", { name: "Auftraggeber speichern" }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/api/auftraggeber", { name: "Gruenflaechenamt" });
    });

    await waitFor(() => {
      expect(auswahl("Auftraggeber").value).toBe(neu.id);
    });
    expect(within(auswahl("Auftraggeber")).getByText("Gruenflaechenamt")).toBeTruthy();
  });

  it("zeigt ohne Auftraggeber einen Leerzustand mit klarer Handlung", async () => {
    const nutzer = userEvent.setup();

    render(<StepWorksite customers={[]} worksites={[]} onNext={() => {}} />);

    expect(screen.getByText("Noch keine Auftraggeber")).toBeTruthy();

    // Der Leerzustand ist kein Text allein: er fuehrt direkt zur Anlage.
    await nutzer.click(screen.getByRole("button", { name: "Ersten Auftraggeber anlegen" }));

    expect(screen.getByLabelText("Name des Auftraggebers")).toBeTruthy();
  });
});
