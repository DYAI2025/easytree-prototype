import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProblemError } from "../../lib/api-client";
import { AddressSearch, type AddressSearchValue } from "./address-search";

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiPost };
});

afterEach(cleanup);
beforeEach(() => {
  apiPost.mockReset();
});

const LEER: AddressSearchValue = {
  addressLine: "",
  postalCode: "",
  city: "",
  lat: null,
  lng: null,
  geocodeSource: null,
};

const NORDRING = {
  label: "Nordring 12, 14467 Potsdam",
  addressLine: "Nordring 12",
  postalCode: "14467",
  city: "Potsdam",
  country: "DE",
  lat: 52.4009,
  lng: 13.0591,
  source: "fixture" as const,
};

const ZEPPELIN = {
  ...NORDRING,
  label: "Zeppelinstrasse 140, 14471 Potsdam",
  addressLine: "Zeppelinstrasse 140",
  postalCode: "14471",
  lat: 52.3906,
  lng: 13.0335,
};

function problem(code: string, status: number, detail: string): ApiProblemError {
  return new ApiProblemError({
    type: `urn:easytree-prototype:problem:${code}`,
    title:
      code === "GEOCODER_NOT_CONFIGURED"
        ? "Es ist kein Geocoding-Provider konfiguriert."
        : "Der Geocoding-Dienst ist nicht erreichbar.",
    status,
    detail,
    correlationId: "test",
  });
}

async function suchen(nutzer: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  await nutzer.type(screen.getByLabelText("Adresse"), text);
  await nutzer.click(screen.getByRole("button", { name: "Adresse suchen" }));
}

describe("AddressSearch", () => {
  it("zeigt waehrend der Suche einen Ladezustand mit Text", async () => {
    const nutzer = userEvent.setup();
    let freigeben: (wert: unknown) => void = () => {};

    apiPost.mockReturnValue(
      new Promise((resolve) => {
        freigeben = resolve;
      }),
    );

    render(<AddressSearch value={LEER} onChange={() => {}} />);
    await suchen(nutzer, "Nordring");

    expect(screen.getByRole("status")).toHaveTextContent("Adresse wird gesucht");

    freigeben({ provider: "fixture", candidates: [] });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("stellt die Treffer als listbox dar und bedient sie mit den Pfeiltasten", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockResolvedValue({ provider: "fixture", candidates: [NORDRING, ZEPPELIN] });

    render(<AddressSearch value={LEER} onChange={() => {}} />);
    await suchen(nutzer, "Potsdam");

    const liste = await screen.findByRole("listbox", { name: "Suchergebnisse" });
    const optionen = within(liste).getAllByRole("option");

    expect(optionen.map((o) => o.textContent)).toEqual([NORDRING.label, ZEPPELIN.label]);
    expect(liste).toHaveAttribute("aria-activedescendant", optionen[0]!.id);

    liste.focus();
    await nutzer.keyboard("{ArrowDown}");

    expect(liste).toHaveAttribute("aria-activedescendant", optionen[1]!.id);
    expect(optionen[1]).toHaveAttribute("aria-selected", "true");

    await nutzer.keyboard("{ArrowUp}");

    expect(liste).toHaveAttribute("aria-activedescendant", optionen[0]!.id);
  });

  it("uebernimmt die Auswahl mit Adresse, Koordinaten und Quelle", async () => {
    const nutzer = userEvent.setup();
    const gemeldet: AddressSearchValue[] = [];

    apiPost.mockResolvedValue({ provider: "fixture", candidates: [NORDRING, ZEPPELIN] });

    render(<AddressSearch value={LEER} onChange={(wert) => gemeldet.push(wert)} />);
    await suchen(nutzer, "Potsdam");

    const liste = await screen.findByRole("listbox", { name: "Suchergebnisse" });

    liste.focus();
    await nutzer.keyboard("{ArrowDown}{Enter}");

    expect(gemeldet.at(-1)).toEqual({
      addressLine: "Zeppelinstrasse 140",
      postalCode: "14471",
      city: "Potsdam",
      lat: 52.3906,
      lng: 13.0335,
      geocodeSource: "fixture",
    });
  });

  it("zeigt bei null Treffern einen Hinweis und den Weg zur manuellen Eingabe", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockResolvedValue({ provider: "fixture", candidates: [] });

    render(<AddressSearch value={LEER} onChange={() => {}} />);
    await suchen(nutzer, "Nirgendwo");

    expect(await screen.findByText("Keine Treffer zu dieser Adresse.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adresse manuell eingeben" })).toBeInTheDocument();
  });

  it("zeigt bei einem Dienstfehler einen Banner und den Weg zur manuellen Eingabe", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockRejectedValue(problem("GEOCODER_UNAVAILABLE", 503, "Zeitueberschreitung"));

    render(<AddressSearch value={LEER} onChange={() => {}} />);
    await suchen(nutzer, "Nordring");

    const banner = await screen.findByRole("alert");

    expect(banner).toHaveTextContent("Die Adresssuche ist gerade nicht erreichbar.");
    expect(screen.getByRole("button", { name: "Adresse manuell eingeben" })).toBeInTheDocument();
  });

  it("unterscheidet den nicht konfigurierten Provider vom Dienstfehler", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockRejectedValue(
      problem("GEOCODER_NOT_CONFIGURED", 422, "Adresse bitte manuell eingeben."),
    );

    render(<AddressSearch value={LEER} onChange={() => {}} />);
    await suchen(nutzer, "Nordring");

    const banner = await screen.findByRole("alert");

    expect(banner).toHaveTextContent("Kein Geocoding-Provider konfiguriert.");
    expect(banner).not.toHaveTextContent("nicht erreichbar");
    expect(screen.getByRole("button", { name: "Adresse manuell eingeben" })).toBeInTheDocument();
  });

  it("erlaubt im manuellen Modus eine Adresse ohne Koordinaten", async () => {
    const nutzer = userEvent.setup();
    const gemeldet: AddressSearchValue[] = [];

    /*
     * Kontrollierte Komponente: der Wert gehoert dem Formular, nicht der Suche.
     * Ohne diese Klammer sieht jeder Tastendruck denselben alten Wert und die
     * Eingabe "Kastanienweg 3" endet als "3" - gemessen.
     */
    function Huelle() {
      const [wert, setWert] = useState<AddressSearchValue>(LEER);

      return (
        <AddressSearch
          value={wert}
          onChange={(neu) => {
            gemeldet.push(neu);
            setWert(neu);
          }}
        />
      );
    }

    render(<Huelle />);

    await nutzer.click(screen.getByRole("button", { name: "Adresse manuell eingeben" }));
    await nutzer.type(screen.getByLabelText("Adresse (manuell)"), "Kastanienweg 3");

    expect(gemeldet.at(-1)).toEqual({
      addressLine: "Kastanienweg 3",
      postalCode: "",
      city: "",
      lat: null,
      lng: null,
      geocodeSource: "manual",
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  /*
   * Kein Autocomplete pro Tastendruck: die Nutzungsbedingungen des
   * Adressdienstes verbieten genau dieses Muster (A-04, REQ-NF-006). Der Test
   * schuetzt die Policy, nicht die Performance.
   */
  it("sucht nicht bei jedem Tastendruck, sondern nur auf Knopf oder Enter", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockResolvedValue({ provider: "fixture", candidates: [NORDRING] });

    render(<AddressSearch value={LEER} onChange={() => {}} />);

    const feld = screen.getByLabelText("Adresse");

    await nutzer.type(feld, "Nordring 12");

    expect(apiPost).not.toHaveBeenCalled();

    await nutzer.type(feld, "{Enter}");

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/api/geocoding/suche", { query: "Nordring 12" });
  });
});
