import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanungsAnsicht } from "./planungs-ansicht";
import {
  KEIN_DRAWER,
  resolvePlanungsViewState,
  type PlanungsViewState,
} from "./planning-view-state";
import type {
  MonthPlanningViewDto,
  SeriesPreviewDto,
  WorksiteDayDetailDto,
} from "../../contracts/worksite-days";
import { buildMonthGrid } from "../../domain/month-grid";
import { ApiProblemError } from "../../lib/api-client";

const push = vi.fn();
const refresh = vi.fn();

const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiGet, apiPost };
});

/** jsdom kennt matchMedia nicht; ohne Stub wirft usePrefersReducedMotion im Drawer. */
function stubMatchMedia(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  stubMatchMedia();
  push.mockReset();
  refresh.mockReset();
  // Die Drawer laden ihre Daten selbst; hier bleibt es beim Ladezustand -
  // geprueft wird der Ansichtszustand, nicht ihr Inhalt.
  apiGet.mockReset();
  apiGet.mockImplementation(() => new Promise(() => {}));
  apiPost.mockReset();
  apiPost.mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const grid = buildMonthGrid("2026-09");

const TAG_ID = "a0000000-0000-4000-8000-000000000001";
const EINSATZ_ID = "a0000000-0000-4000-8000-000000000002";

const view = (cards: MonthPlanningViewDto["cards"] = []): MonthPlanningViewDto => ({
  month: "2026-09",
  today: "2026-09-08",
  weeks: grid.weeks.map((w) => ({
    isoWeek: w.isoWeek,
    days: w.days.map((d) => ({ date: d.date as string, inMonth: d.inMonth })),
  })),
  cards,
  spans: [],
});

const karte: MonthPlanningViewDto["cards"][number] = {
  worksiteDayId: TAG_ID,
  date: "2026-09-10",
  engagementId: EINSATZ_ID,
  title: "Baumpflege",
  colourKey: "moos",
  worksiteName: "Park",
  employeeCount: 3,
  resourceCount: 1,
  revisionNo: 1,
  origin: "materialized",
};

function zeige(
  cards: MonthPlanningViewDto["cards"] = [],
  zustand: PlanungsViewState = KEIN_DRAWER,
) {
  return render(<PlanungsAnsicht view={view(cards)} viewState={zustand} />);
}

describe("PlanungsAnsicht", () => {
  it("zeigt einen Leerzustand mit klarer Aktion, wenn der Monat leer ist", () => {
    zeige();

    expect(screen.getByText("Keine Einsaetze in diesem Monat")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Einsatz anlegen" }).length).toBeGreaterThan(0);
  });

  it("zeigt keinen Leerzustand, sobald Karten vorhanden sind", () => {
    zeige([karte]);

    expect(screen.queryByText("Keine Einsaetze in diesem Monat")).toBeNull();
    expect(screen.getAllByTestId("tageskarte")).toHaveLength(1);
    expect(screen.getByTestId("tageskarte").textContent).toContain("3 Personen");
  });

  /*
   * B-05: Oeffnen ist eine Navigation, kein lokaler Zustand. Genau das macht
   * den Drawer reload- und linkfaehig.
   */
  it("schreibt den Tagesdrawer in die URL, statt ihn lokal zu merken", () => {
    zeige([karte]);

    fireEvent.click(screen.getByTestId("tageskarte"));

    expect(push).toHaveBeenCalledWith(
      `/planung?monat=2026-09&tag=2026-09-10&drawer=tag&id=${TAG_ID}`,
      { scroll: false },
    );
  });

  it("schreibt die Einsatzanlage in die URL", () => {
    zeige();

    fireEvent.click(screen.getAllByRole("button", { name: "Einsatz anlegen" })[0]!);

    expect(push).toHaveBeenCalledWith("/planung?monat=2026-09&drawer=neu", { scroll: false });
  });

  it("rekonstruiert den Kosten-Drawer allein aus dem uebergebenen Zustand", () => {
    zeige([karte], {
      drawer: "kosten",
      engagementId: EINSATZ_ID,
      engagementTitle: "Baumpflege",
      tag: "2026-09-10",
    });

    expect(screen.getByRole("dialog", { name: "Plan-Kosten (Demo)" })).toBeTruthy();
  });

  it("laesst den Monat stehen, wenn ein Drawer geschlossen wird", () => {
    zeige([karte], { drawer: "neu", tag: null });

    fireEvent.click(screen.getByRole("button", { name: "Dialog schliessen" }));

    expect(push).toHaveBeenCalledWith("/planung?monat=2026-09", { scroll: false });
  });

  it("ignoriert einen leeren Ansichtszustand und zeigt nur den Kalender", () => {
    zeige([karte], KEIN_DRAWER);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("grid")).toBeTruthy();
  });
});

/*
 * EYT-174 / UX-081 / UX-082: Fokusrueckgabe nach dem Schliessen des
 * Tagesdrawers.
 *
 * Die Tests oben pruefen den Ansichtszustand mit einem Router-SPION - `push`
 * zaehlt Aufrufe, aber nichts rendert danach neu. Genau in dieser Luecke sitzt
 * der Befund: im Produkt ist Schliessen eine Navigation, die den Drawer AUS DEM
 * BAUM nimmt (und mit ihm, unterhalb des md-Umbruchs, die Tagesliste). Erst
 * dieser vollstaendige Kreis - Ausloeser -> URL -> Drawer -> URL -> kein
 * Drawer - reproduziert, was der Live-QA-Lauf gemessen hat:
 * `document.activeElement === BODY`.
 *
 * Die Buehne fuehrt den Kreis deshalb wirklich aus: der gemockte `push`
 * schreibt die URL, und `resolvePlanungsViewState` - dieselbe Funktion wie auf
 * dem Server - loest daraus den neuen Ansichtszustand auf.
 */
const navigation: { setzeUrl: (url: string) => void } = { setzeUrl: () => {} };

function params(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, "http://buehne.invalid").searchParams);
}

function PlanungsBuehne({
  cards,
  start,
}: {
  readonly cards: MonthPlanningViewDto["cards"];
  readonly start: string;
}) {
  const [url, setUrl] = useState(start);

  useEffect(() => {
    navigation.setzeUrl = setUrl;
  }, []);

  const daten = view(cards);

  return <PlanungsAnsicht view={daten} viewState={resolvePlanungsViewState(daten, params(url))} />;
}

function gridKarte(): HTMLElement {
  const zelle = document.querySelector('[role="gridcell"][data-datum="2026-09-10"]');

  return zelle!.querySelector<HTMLElement>('[data-testid="tageskarte"]')!;
}

describe("PlanungsAnsicht: Fokus nach dem Schliessen des Tagesdrawers", () => {
  beforeEach(() => {
    push.mockImplementation((ziel: string) => {
      navigation.setzeUrl(ziel);
    });
  });

  it("Fall A - per Tastatur geoeffnet, per Esc geschlossen: Fokus zurueck auf die Tageskarte", async () => {
    const nutzer = userEvent.setup();

    render(<PlanungsBuehne cards={[karte]} start="/planung?monat=2026-09" />);

    const ausloeser = gridKarte();

    ausloeser.focus();
    expect(document.activeElement).toBe(ausloeser);

    await nutzer.keyboard("{Enter}");

    await screen.findByRole("dialog", { name: "Baustellentag" });
    expect(push).toHaveBeenLastCalledWith(
      `/planung?monat=2026-09&tag=2026-09-10&drawer=tag&id=${TAG_ID}`,
      { scroll: false },
    );

    await nutzer.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // 1. Der URL-Zustand ist bereinigt - der Monat bleibt, alles andere faellt weg.
    expect(push).toHaveBeenLastCalledWith("/planung?monat=2026-09", { scroll: false });

    // 2. Der Fokus steht auf GENAU dem Element, das den Drawer geoeffnet hat.
    await waitFor(() => {
      expect(document.activeElement).toBe(gridKarte());
    });
    expect(document.activeElement).not.toBe(document.body);
  });

  it("Fall B - per Maus geoeffnet, ueber Schliessen beendet: Fokus zurueck auf die Tageskarte", async () => {
    const nutzer = userEvent.setup();

    render(<PlanungsBuehne cards={[karte]} start="/planung?monat=2026-09" />);

    const ausloeser = gridKarte();

    await nutzer.click(ausloeser);
    await screen.findByRole("dialog", { name: "Baustellentag" });

    await nutzer.click(screen.getByRole("button", { name: "Dialog schliessen" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    expect(push).toHaveBeenLastCalledWith("/planung?monat=2026-09", { scroll: false });

    await waitFor(() => {
      expect(document.activeElement).toBe(gridKarte());
    });
    expect(document.activeElement).not.toBe(document.body);
  });

  /*
   * Die Kompaktform (Plan 6.2) oeffnet den Drawer aus der Tagesliste. Die
   * verschwindet beim Schliessen mit, weil `schliesse()` auch `tag` aus der URL
   * nimmt - der Ausloeser selbst existiert danach also gar nicht mehr. Der
   * Fokus darf trotzdem nicht auf den Seitenanfang fallen, sondern gehoert an
   * die Stelle, an der derselbe Tag weiter bedienbar ist.
   */
  it("Mobilform - Ausloeser aus der Tagesliste: Fokus faellt nicht auf den Seitenanfang", async () => {
    const nutzer = userEvent.setup();

    render(<PlanungsBuehne cards={[karte]} start="/planung?monat=2026-09&tag=2026-09-10" />);

    const liste = screen.getByTestId("tagesliste");
    const ausloeser = liste.querySelector<HTMLElement>('[data-testid="tageskarte"]')!;

    await nutzer.click(ausloeser);
    await screen.findByRole("dialog", { name: "Baustellentag" });

    await nutzer.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Die Voraussetzung des Falls, gemessen statt behauptet.
    expect(screen.queryByTestId("tagesliste")).toBeNull();
    expect(ausloeser.isConnected).toBe(false);

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
    });
    // Und zwar an der Bedienflaeche DIESES Tages, nicht irgendwo.
    expect(document.activeElement?.getAttribute("data-testid")).toBe("tagesindikator");
    expect(document.activeElement?.closest('[role="gridcell"]')?.getAttribute("data-datum")).toBe(
      "2026-09-10",
    );
  });
});

/*
 * EYT-175 / UX-020, UX-031, UX-032/033: Erfolgsmeldungen nach Schreibaktionen.
 *
 * Der Live-QA-Lauf QA-2026-09-09-01 hat gemessen, dass nach `201`, nach der
 * Einzeltagaenderung und nach der Serienaenderung KEIN sichtbarer Erfolgstext
 * und kein `[role="status"]` entstand - obwohl der Server jedes Mal korrekt
 * gespeichert hatte.
 *
 * Diese Tests laufen bewusst ueber `PlanungsBuehne` (oben fuer EYT-174
 * gebaut): dort ist Schliessen wirklich eine Navigation, die den Drawer AUS DEM
 * BAUM nimmt. Nur so ist gemessen und nicht behauptet, dass die Meldung das
 * Verschwinden ihres Ausloesers ueberlebt - eine Meldung im Drawer waere in
 * genau diesem Moment mit ihm weg.
 */
const ANNA = "e0000000-0000-4000-8000-00000000000a";
const BERND = "e0000000-0000-4000-8000-00000000000b";
const KUNDE_ID = "c1000000-0000-4000-8000-000000000001";
const BAUSTELLE_ID = "b1000000-0000-4000-8000-000000000001";

const TAGES_DETAIL: WorksiteDayDetailDto = {
  worksiteDayId: TAG_ID,
  localDate: "2026-09-10",
  engagementId: EINSATZ_ID,
  engagementTitle: "Baumpflege",
  colourKey: "moos",
  worksiteName: "Park",
  customerName: "Stadtwerke Musterstadt",
  revisionNo: 1,
  origin: "materialized",
  plannedStartTime: null,
  plannedEndTime: null,
  note: null,
  employees: [{ id: ANNA, displayName: "Anna Bergmann" }],
  resources: [],
};

const FOLGETAG_A = "a0000000-0000-4000-8000-00000000000b";
const FOLGETAG_B = "a0000000-0000-4000-8000-00000000000c";

const VORSCHAU: SeriesPreviewDto = {
  engagementId: EINSATZ_ID,
  fromDate: "2026-09-10",
  rows: [
    { worksiteDayId: TAG_ID, date: "2026-09-10", origin: "materialized", status: "unchanged" },
    { worksiteDayId: FOLGETAG_A, date: "2026-09-11", origin: "materialized", status: "unchanged" },
    { worksiteDayId: FOLGETAG_B, date: "2026-09-14", origin: "materialized", status: "unchanged" },
  ],
  targetIds: [TAG_ID, FOLGETAG_A, FOLGETAG_B],
  adjustedCount: 0,
};

function person(id: string, name: string) {
  return {
    id,
    displayName: name,
    roleLabel: null,
    active: true,
    dailyCostMinorUnits: "32000",
    costNote: null,
  };
}

/** Alles, was Tagesdrawer und Anlage-Assistent lesend brauchen. */
function stammdatenLaden(): void {
  apiGet.mockImplementation(async (pfad: string) => {
    if (pfad === `/api/baustellentage/${TAG_ID}`) {
      return TAGES_DETAIL;
    }

    if (pfad === "/api/mitarbeitende") {
      return { items: [person(ANNA, "Anna Bergmann"), person(BERND, "Bernd Kowalski")] };
    }

    if (pfad === "/api/auftraggeber") {
      return {
        items: [
          {
            id: KUNDE_ID,
            name: "Stadtwerke Musterstadt",
            contact: null,
            notes: null,
            active: true,
          },
        ],
      };
    }

    if (pfad === "/api/baustellen") {
      return {
        items: [
          {
            id: BAUSTELLE_ID,
            customerId: KUNDE_ID,
            name: "Parkanlage Nordring",
            addressLine: "Nordring 12",
            postalCode: null,
            city: null,
            country: "DE",
            lat: null,
            lng: null,
            geocodeSource: null,
            notes: null,
            active: true,
          },
        ],
      };
    }

    return { items: [] };
  });
}

function meldungsBereich(): HTMLElement {
  return screen.getByTestId("erfolgsmeldung");
}

function meldung(): string {
  return meldungsBereich().textContent ?? "";
}

describe("PlanungsAnsicht: Erfolg nach Schreibaktionen (EYT-175)", () => {
  beforeEach(() => {
    stammdatenLaden();
    push.mockImplementation((ziel: string) => {
      navigation.setzeUrl(ziel);
    });
  });

  async function tagesdrawerOeffnen() {
    render(
      <PlanungsBuehne
        cards={[karte]}
        start={`/planung?monat=2026-09&tag=2026-09-10&drawer=tag&id=${TAG_ID}`}
      />,
    );

    await screen.findByTestId("tageskopf");

    return screen.getByRole("dialog");
  }

  it("bestaetigt eine erfolgreiche Einzeltagaenderung mit Datum - und die Meldung ueberlebt den Drawer", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockResolvedValue({
      updatedDayIds: [TAG_ID],
      newRevisions: [{ worksiteDayId: TAG_ID, revisionNo: 2 }],
    });

    const drawer = await tagesdrawerOeffnen();

    // Vor der Mutation ist der Live-Bereich leer - sonst waere jede
    // Zusicherung unten auch ohne Speichern gruen.
    expect(meldung()).toBe("");

    await nutzer.click(within(drawer).getByRole("checkbox", { name: /Bernd Kowalski/ }));
    await nutzer.click(within(drawer).getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Der Kern der Architekturregel: der Drawer ist WEG, die Meldung steht.
    await waitFor(() => {
      expect(meldung()).toContain("gespeichert");
    });
    expect(meldung()).toContain("10.09.2026");
    expect(meldungsBereich().getAttribute("role")).toBe("status");
    expect(meldungsBereich().getAttribute("aria-live")).toBe("polite");
  });

  it("erzeugt bei einer fehlgeschlagenen Aenderung KEINE Erfolgsmeldung", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockRejectedValue(
      new ApiProblemError({
        type: "urn:easytree-prototype:problem:STALE_REVISION",
        title: "Der Tag wurde zwischenzeitlich geaendert.",
        status: 409,
        detail: "Revision 1 ist nicht mehr aktuell.",
        correlationId: "test",
      }),
    );

    const drawer = await tagesdrawerOeffnen();

    await nutzer.click(within(drawer).getByRole("checkbox", { name: /Bernd Kowalski/ }));
    await nutzer.click(within(drawer).getByRole("button", { name: "Speichern" }));

    // Der bestehende Fehlerweg bleibt unangetastet und sichtbar ...
    await waitFor(() => {
      expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toContain(
        "Zwischenzeitlich geaendert",
      );
    });

    // ... und daneben darf kein Erfolg behauptet werden.
    expect(meldung()).toBe("");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("bestaetigt die Serienaenderung mit der Anzahl aus der Serverantwort", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockImplementation(async (pfad: string) => {
      if (pfad.endsWith("/vorschau")) {
        return VORSCHAU;
      }

      /*
       * Bewusst ZWEI statt der drei Zieltage der Vorschau: die Zahl in der
       * Meldung muss aus der Antwort der Uebernahme stammen. Zaehlte der
       * Client stattdessen seine eigene Vorschau, stuende hier 3.
       */
      return {
        updatedDayIds: [TAG_ID, FOLGETAG_A],
        newRevisions: [],
      };
    });

    const drawer = await tagesdrawerOeffnen();

    /*
     * Erst eine INHALTLICHE Aenderung, dann der Scope. Ohne sie ist der Knopf
     * `disabled` (`gesperrt || !geaendert`) und der Klick verpufft lautlos -
     * gemessen: die Vorschau erschien nie, obwohl die Beschriftung bereits
     * "Vorschau anzeigen ..." lautete.
     */
    await nutzer.click(within(drawer).getByRole("checkbox", { name: /Bernd Kowalski/ }));
    await nutzer.click(
      within(drawer).getByRole("radio", { name: "Dieser und folgende Tage dieses Einsatzes" }),
    );
    await nutzer.click(within(drawer).getByRole("button", { name: "Vorschau anzeigen ..." }));

    const vorschau = await screen.findByRole("dialog", { name: "Serienaenderung pruefen" });

    // Vor der Uebernahme gibt es nichts zu melden.
    expect(meldung()).toBe("");

    await nutzer.click(within(vorschau).getByRole("button", { name: "Uebernehmen" }));

    await waitFor(() => {
      expect(meldung()).toContain("geändert");
    });
    expect(meldung()).toContain("2 Baustellentage");
    expect(meldung()).not.toContain("3 Baustellentage");
    expect(meldungsBereich().getAttribute("role")).toBe("status");
  });

  it("bestaetigt die Einsatzanlage mit Titel und der Tagesanzahl des Servers", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockImplementation(async (pfad: string) => {
      if (pfad === "/api/einsaetze") {
        /*
         * VIER Tage - der Zeitraum unten hat fuenf Werktage. Die Abweichung
         * ist Absicht: sie trennt die Servertruth von der Ableitung, die der
         * Assistent selbst im Kopf hat. Steht am Ende "5", zaehlt der Client.
         */
        return {
          engagementId: EINSATZ_ID,
          worksiteDayIds: [TAG_ID, FOLGETAG_A, FOLGETAG_B, "a0000000-0000-4000-8000-00000000000d"],
          localDates: ["2027-05-03", "2027-05-04", "2027-05-05", "2027-05-06"],
        };
      }

      return {};
    });

    render(<PlanungsBuehne cards={[karte]} start="/planung?monat=2026-09&drawer=neu" />);

    const drawer = await screen.findByRole("dialog", { name: "Einsatz anlegen" });

    await nutzer.type(
      await within(drawer).findByLabelText("Titel", { exact: true }),
      "Baumpflege Herbstschnitt",
    );
    await nutzer.selectOptions(
      within(drawer).getByLabelText("Auftraggeber", { exact: true }),
      KUNDE_ID,
    );
    await nutzer.selectOptions(
      within(drawer).getByLabelText("Baustelle", { exact: true }),
      BAUSTELLE_ID,
    );
    await nutzer.click(within(drawer).getByRole("button", { name: "Weiter" }));

    await nutzer.type(within(drawer).getByLabelText("Beginn", { exact: true }), "2027-05-03");
    await nutzer.type(within(drawer).getByLabelText("Ende", { exact: true }), "2027-05-07");
    // Die Ableitung des Assistenten, gemessen - damit die Abweichung zur
    // Serverantwort belegt und nicht bloss behauptet ist.
    expect(within(drawer).getByTestId("arbeitstage").textContent).toContain("5 Arbeitstage");

    await nutzer.click(within(drawer).getByRole("button", { name: "Weiter" }));
    await nutzer.click(within(drawer).getByRole("button", { name: "Einsatz anlegen" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await waitFor(() => {
      expect(meldung()).toContain("angelegt");
    });
    expect(meldung()).toContain("Baumpflege Herbstschnitt");
    expect(meldung()).toContain("4 Baustellentage");
    expect(meldung()).not.toContain("5 Baustellentage");
    expect(meldungsBereich().getAttribute("role")).toBe("status");
  });
});
