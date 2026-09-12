import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer } from "../../contracts/customer";
import type { Worksite } from "../../contracts/worksite";
import { ApiProblemError } from "../../lib/api-client";
import { CustomerPanel } from "./customer-panel";

const { apiPatch, apiPost } = vi.hoisted(() => ({ apiPatch: vi.fn(), apiPost: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiPatch, apiPost };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);
beforeEach(() => {
  apiPatch.mockReset();
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
  kunde("a0000000-0000-4000-8000-000000000001", "Stadtwerke Musterstadt"),
  kunde("a0000000-0000-4000-8000-000000000002", "Wohnungsgenossenschaft Gruenblick eG"),
];

const BAUSTELLEN = [
  baustelle("b0000000-0000-4000-8000-000000000001", KUNDEN[0]!.id, "Parkanlage Nordring"),
  baustelle("b0000000-0000-4000-8000-000000000002", KUNDEN[0]!.id, "Allee am Wasserwerk"),
  baustelle("b0000000-0000-4000-8000-000000000003", KUNDEN[1]!.id, "Innenhof Gruenblick"),
];

function auswaehlen(name: string) {
  return screen.getByRole("button", { name: `${name} auswaehlen` });
}

describe("CustomerPanel", () => {
  it("zeigt nach der Auswahl genau die Baustellen dieses Auftraggebers", async () => {
    const nutzer = userEvent.setup();

    render(<CustomerPanel customers={KUNDEN} worksites={BAUSTELLEN} />);

    await nutzer.click(auswaehlen("Stadtwerke Musterstadt"));

    const bereich = screen.getByRole("region", { name: "Baustellen" });

    expect(
      within(bereich)
        .getAllByTestId("baustellenname")
        .map((n) => n.textContent),
    ).toEqual(["Parkanlage Nordring", "Allee am Wasserwerk"]);

    await nutzer.click(auswaehlen("Wohnungsgenossenschaft Gruenblick eG"));

    expect(
      within(screen.getByRole("region", { name: "Baustellen" }))
        .getAllByTestId("baustellenname")
        .map((n) => n.textContent),
    ).toEqual(["Innenhof Gruenblick"]);
  });

  it("oeffnet Neue Baustelle mit vorbelegtem Auftraggeber", async () => {
    const nutzer = userEvent.setup();

    render(<CustomerPanel customers={KUNDEN} worksites={BAUSTELLEN} />);

    await nutzer.click(auswaehlen("Wohnungsgenossenschaft Gruenblick eG"));
    await nutzer.click(screen.getByRole("button", { name: "Neue Baustelle" }));

    const formular = screen.getByRole("form", { name: "Neue Baustelle" });
    const auftraggeber = within(formular).getByLabelText("Auftraggeber") as HTMLInputElement;

    expect(auftraggeber.value).toBe("Wohnungsgenossenschaft Gruenblick eG");
    expect(auftraggeber).toBeDisabled();
  });

  /*
   * Anti-CRM (REQ-F-003/F-004): der Auftraggeber ist hier ein Ordnungsbegriff
   * fuer Baustellen, kein Vertriebsdatensatz. Faellt dieser Test, ist die
   * Produktgrenze verschoben - nicht der Test falsch.
   *
   * Die Wortgrenzen sind Pflicht, keine Kosmetik: `textContent` klebt die Texte
   * benachbarter Elemente ohne Trennzeichen zusammen, und aus
   * "Baustelle" + "Adresse" wird "Baustel(leAd)resse" - ein Treffer fuer ein
   * nacktes /Lead/i. Gemessen; der Test war zuerst aus genau diesem Grund rot.
   */
  it("fuehrt keine CRM-Felder - auf keiner der beiden Formularflaechen", async () => {
    const nutzer = userEvent.setup();
    const CRM = /\b(Lead\w*|Umsatz\w*|Angebot\w*|Pipeline\w*|Opportunit\w*)\b/i;

    const pruefe = (container: HTMLElement): void => {
      expect(container.textContent).not.toMatch(CRM);
      expect(
        [...container.querySelectorAll("label, [aria-label], [placeholder]")]
          .map(
            (e) =>
              `${e.textContent} ${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("placeholder") ?? ""}`,
          )
          .join(" | "),
      ).not.toMatch(CRM);
    };

    const { container } = render(<CustomerPanel customers={KUNDEN} worksites={BAUSTELLEN} />);

    await nutzer.click(auswaehlen("Stadtwerke Musterstadt"));

    /*
     * BEIDE Formulare, nicht nur eines. Die erste Fassung dieses Tests oeffnete
     * ausschliesslich "Neue Baustelle"; eine Gegenmutation, die dem
     * Auftraggeberformular ein Feld "Umsatz letztes Jahr" gab, blieb deshalb
     * gruen. Der Test hatte eine Luecke genau dort, wo CRM-Drift am
     * naheliegendsten ist.
     */
    await nutzer.click(screen.getByRole("button", { name: "Neue Baustelle" }));
    pruefe(container);

    await nutzer.click(screen.getByRole("button", { name: "Neuer Auftraggeber" }));
    expect(screen.getByRole("form", { name: "Neuer Auftraggeber" })).toBeInTheDocument();
    pruefe(container);
  });
});

/*
 * Die Adresssuche ist in TASK-041 als eigene Komponente entstanden, aber KEIN
 * Task verdrahtet sie. TASK-042 verlangt den Browsernachweis "Auswahl speichert
 * Koordinaten (nach Reload sichtbar)" - dafuer braucht es eine Flaeche, auf der
 * eine Baustelle angelegt wird. Das ist diese hier. Siehe PA-06.
 */
describe("CustomerPanel mit Adresssuche", () => {
  it("speichert die Koordinaten und die Quelle des gewaehlten Treffers", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockImplementation(async (pfad: string) =>
      pfad === "/api/geocoding/suche"
        ? {
            provider: "fixture",
            candidates: [
              {
                label: "Nordring 12, 14467 Potsdam",
                addressLine: "Nordring 12",
                postalCode: "14467",
                city: "Potsdam",
                country: "DE",
                lat: 52.4009,
                lng: 13.0591,
                source: "fixture",
              },
            ],
          }
        : { id: "neu" },
    );

    render(<CustomerPanel customers={KUNDEN} worksites={BAUSTELLEN} />);

    await nutzer.click(auswaehlen("Stadtwerke Musterstadt"));
    await nutzer.click(screen.getByRole("button", { name: "Neue Baustelle" }));

    const formular = screen.getByRole("form", { name: "Neue Baustelle" });

    await nutzer.type(within(formular).getByLabelText("Name der Baustelle"), "Parkanlage Nordring");
    await nutzer.type(within(formular).getByLabelText("Adresse"), "Nordring");
    await nutzer.click(within(formular).getByRole("button", { name: "Adresse suchen" }));
    await nutzer.click(await screen.findByRole("option", { name: "Nordring 12, 14467 Potsdam" }));
    await nutzer.click(within(formular).getByRole("button", { name: "Baustelle speichern" }));

    const anlage = apiPost.mock.calls.find(([pfad]) => pfad === "/api/baustellen");

    expect(anlage).toBeDefined();
    expect(anlage![1]).toMatchObject({
      customerId: KUNDEN[0]!.id,
      name: "Parkanlage Nordring",
      addressLine: "Nordring 12",
      postalCode: "14467",
      city: "Potsdam",
      lat: 52.4009,
      lng: 13.0591,
      geocodeSource: "fixture",
    });
  });
});

/*
 * EYT-175 / UX-051: Erfolg nach der Baustellenanlage.
 *
 * Der Live-QA-Lauf QA-2026-09-09-01 hat die Anlage als erfolgreich gemessen -
 * und danach keinerlei Bestaetigung gefunden. Das Formular verschwindet beim
 * Speichern (`setFormular(null)`), die Meldung darf deshalb NICHT in ihm
 * stehen; sie gehoert in das Panel, das bleibt.
 */
describe("CustomerPanel: Erfolg nach der Baustellenanlage (EYT-175)", () => {
  function meldungsBereich(): HTMLElement {
    return screen.getByTestId("erfolgsmeldung");
  }

  function meldung(): string {
    return meldungsBereich().textContent ?? "";
  }

  async function baustelleAnlegen(nutzer: ReturnType<typeof userEvent.setup>) {
    render(<CustomerPanel customers={KUNDEN} worksites={BAUSTELLEN} />);

    await nutzer.click(auswaehlen("Stadtwerke Musterstadt"));
    await nutzer.click(screen.getByRole("button", { name: "Neue Baustelle" }));

    const formular = screen.getByRole("form", { name: "Neue Baustelle" });

    await nutzer.type(within(formular).getByLabelText("Name der Baustelle"), "Suedpark Ost");

    /*
     * Die Adresse muss ueber einen der beiden ECHTEN Wege gesetzt werden. Nur
     * in das Suchfeld zu tippen genuegt nicht: `AddressSearch` haelt den
     * Suchbegriff fuer sich und meldet eine Adresse erst, wenn ein Treffer
     * gewaehlt oder manuell eingegeben wurde - sonst bricht `absenden` mit
     * "Pflichtfeld" ab (gemessen). Der manuelle Weg ist hier der kuerzere und
     * braucht kein Geocoding.
     */
    await nutzer.click(within(formular).getByRole("button", { name: "Adresse manuell eingeben" }));
    await nutzer.type(within(formular).getByLabelText("Adresse (manuell)"), "Suedallee 3");

    return formular;
  }

  it("bestaetigt die Anlage mit dem Namen aus der Serverantwort", async () => {
    const nutzer = userEvent.setup();

    /*
     * Der Server antwortet mit einem ANDEREN Namen als dem getippten. Das ist
     * Absicht: die Meldung muss die gespeicherte Wahrheit nennen, nicht das
     * Formularfeld. Stuende am Ende "Suedpark Ost", laese der Client sich
     * selbst vor.
     */
    apiPost.mockResolvedValue({
      ...baustelle(
        "b0000000-0000-4000-8000-000000000009",
        KUNDEN[0]!.id,
        "Suedpark Ost (geprueft)",
      ),
    });

    const formular = await baustelleAnlegen(nutzer);

    expect(meldung()).toBe("");

    await nutzer.click(within(formular).getByRole("button", { name: "Baustelle speichern" }));

    // Das Formular ist weg - und die Meldung steht trotzdem.
    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "Neue Baustelle" })).toBeNull();
    });

    await waitFor(() => {
      expect(meldung()).toContain("angelegt");
    });
    expect(meldung()).toContain("Suedpark Ost (geprueft)");
    expect(meldungsBereich().getAttribute("role")).toBe("status");
    expect(meldungsBereich().getAttribute("aria-live")).toBe("polite");
  });

  it("behauptet bei einer fehlgeschlagenen Anlage keinen Erfolg", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockRejectedValue(
      new ApiProblemError({
        type: "urn:easytree-prototype:problem:VALIDATION_FAILED",
        title: "Die Eingabe ist nicht gueltig.",
        status: 400,
        detail: "name: Pflichtfeld",
        correlationId: "test",
      }),
    );

    const formular = await baustelleAnlegen(nutzer);

    await nutzer.click(within(formular).getByRole("button", { name: "Baustelle speichern" }));

    await waitFor(() => {
      expect(within(formular).getByRole("alert").textContent).toContain("nicht gueltig");
    });

    expect(meldung()).toBe("");
  });
});
