import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorksiteDayDetailDto } from "../../contracts/worksite-days";
import { ApiProblemError } from "../../lib/api-client";
import { DayDrawer } from "./day-drawer";

const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiGet, apiPost };
});

/** jsdom kennt matchMedia nicht; ohne Stub wirft usePrefersReducedMotion. */
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  stubMatchMedia();
  apiGet.mockReset();
  apiPost.mockReset();
});

const TAG_ID = "d0000000-0000-4000-8000-000000000001";
const ANNA = "e0000000-0000-4000-8000-00000000000a";
const BERND = "e0000000-0000-4000-8000-00000000000b";
const BUEHNE = "r0000000-0000-4000-8000-00000000000a";
const HAECKSLER = "r0000000-0000-4000-8000-00000000000b";

const DETAIL: WorksiteDayDetailDto = {
  worksiteDayId: TAG_ID,
  localDate: "2026-09-10",
  engagementId: "c0000000-0000-4000-8000-000000000001",
  engagementTitle: "Baumpflege Herbstschnitt",
  colourKey: "moos",
  worksiteName: "Parkanlage Nordring",
  customerName: "Stadtwerke Musterstadt",
  revisionNo: 1,
  origin: "materialized",
  plannedStartTime: null,
  plannedEndTime: null,
  note: null,
  employees: [{ id: ANNA, displayName: "Anna Bergmann" }],
  resources: [{ id: BUEHNE, name: "Hebebuehne HB-18", kind: "machine" }],
};

function stammdaten(detail: WorksiteDayDetailDto = DETAIL): void {
  apiGet.mockImplementation(async (pfad: string) => {
    if (pfad === `/api/baustellentage/${TAG_ID}`) {
      return detail;
    }

    if (pfad === "/api/mitarbeitende") {
      return {
        items: [
          {
            id: ANNA,
            displayName: "Anna Bergmann",
            roleLabel: "Teamleitung",
            active: true,
            dailyCostMinorUnits: "32000",
            costNote: null,
          },
          {
            id: BERND,
            displayName: "Bernd Kowalski",
            roleLabel: "Kletterer",
            active: true,
            dailyCostMinorUnits: "28000",
            costNote: null,
          },
        ],
      };
    }

    return {
      items: [
        {
          id: BUEHNE,
          kind: "machine",
          name: "Hebebuehne HB-18",
          identifier: null,
          active: true,
          dailyCostMinorUnits: "45000",
          costNote: null,
        },
        {
          id: HAECKSLER,
          kind: "machine",
          name: "Haecksler HX-9",
          identifier: null,
          active: true,
          dailyCostMinorUnits: "18000",
          costNote: null,
        },
      ],
    };
  });
}

function zeichnen(heute = "2026-09-01") {
  return render(
    <DayDrawer worksiteDayId={TAG_ID} today={heute} onClose={() => {}} onSaved={() => {}} />,
  );
}

const speichern = () => screen.getByRole("button", { name: "Speichern" });

describe("DayDrawer", () => {
  it("zeigt im Kopf Datum, Einsatz, Baustelle und die Revision", async () => {
    stammdaten();
    zeichnen();

    const kopf = await screen.findByTestId("tageskopf");

    expect(kopf).toHaveTextContent("Donnerstag, 10. September 2026");
    expect(kopf).toHaveTextContent("Baumpflege Herbstschnitt");
    expect(kopf).toHaveTextContent("Parkanlage Nordring");
    expect(kopf).toHaveTextContent("Stadtwerke Musterstadt");
    expect(kopf).toHaveTextContent("Revision 1");
  });

  it("aktiviert Speichern erst nach einer Aenderung an Team oder Ressourcen", async () => {
    const nutzer = userEvent.setup();

    stammdaten();
    zeichnen();

    await screen.findByTestId("tageskopf");

    expect(speichern()).toBeDisabled();

    await nutzer.click(screen.getByRole("checkbox", { name: "Bernd Kowalski, Kletterer" }));

    expect(speichern()).toBeEnabled();

    await nutzer.click(screen.getByRole("checkbox", { name: "Haecksler HX-9" }));

    expect(speichern()).toBeEnabled();
  });

  /*
   * Genau ZWEI Optionen. Eine dritte ("gesamter Einsatz") ist H-02 und
   * ausdruecklich nicht freigegeben - dieser Test ist die Stelle, an der ein
   * stilles Hinzufuegen auffliegt.
   */
  it("bietet genau zwei Scopes an, mit Nur dieser Tag als Vorgabe", async () => {
    stammdaten();
    zeichnen();

    await screen.findByTestId("tageskopf");

    const gruppe = screen.getByRole("radiogroup", { name: "Aenderung anwenden auf" });
    const optionen = within(gruppe).getAllByRole("radio");

    expect(optionen).toHaveLength(2);
    expect(optionen.map((o) => (o as HTMLInputElement).value)).toEqual([
      "ONLY_THIS_DAY",
      "THIS_AND_FOLLOWING",
    ]);
    expect(within(gruppe).getByRole("radio", { name: "Nur dieser Tag" })).toBeChecked();
  });

  it("zeigt bei STALE_REVISION einen Banner mit Neu-laden-Aktion", async () => {
    const nutzer = userEvent.setup();

    stammdaten();
    apiPost.mockRejectedValue(
      new ApiProblemError({
        type: "urn:easytree-prototype:problem:STALE_REVISION",
        title: "Der Tag wurde zwischenzeitlich geaendert.",
        status: 409,
        detail: "Revision 1 ist nicht mehr aktuell.",
        correlationId: "test",
      }),
    );

    zeichnen();
    await screen.findByTestId("tageskopf");

    await nutzer.click(screen.getByRole("checkbox", { name: "Bernd Kowalski, Kletterer" }));
    await nutzer.click(speichern());

    const banner = await screen.findByRole("alert");

    expect(banner).toHaveTextContent("Zwischenzeitlich geaendert");

    const anzahlVorher = apiGet.mock.calls.length;

    await nutzer.click(screen.getByRole("button", { name: "Neu laden" }));

    // Der Banner ist nur ehrlich, wenn "Neu laden" tatsaechlich die Servertruth
    // erneut liest - router.refresh() wuerde den Drawer NICHT neu laden.
    await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(anzahlVorher));
  });

  it("sperrt einen vergangenen Tag und nennt den Grund", async () => {
    stammdaten();
    // Heute ist der 15.09., der Tag ist der 10.09. - also Vergangenheit.
    zeichnen("2026-09-15");

    await screen.findByTestId("tageskopf");

    expect(screen.getByRole("checkbox", { name: "Anna Bergmann, Teamleitung" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Hebebuehne HB-18" })).toBeDisabled();
    expect(screen.getByLabelText("Hinweis")).toBeDisabled();
    expect(speichern()).toBeDisabled();

    expect(screen.getByTestId("vergangenheitsbanner")).toHaveTextContent(
      "Dieser Tag liegt vor dem heutigen Datum. Rueckwirkende Aenderungen sind noch nicht freigegeben (Produktentscheidung offen).",
    );
  });
});
