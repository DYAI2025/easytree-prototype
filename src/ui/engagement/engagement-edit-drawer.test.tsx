import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngagementDetailDto } from "../../contracts/engagement";
import { ApiProblemError } from "../../lib/api-client";
import { EngagementEditDrawer } from "./engagement-edit-drawer";

const { apiGet, apiPatch } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPatch: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiGet, apiPatch };
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
  apiPatch.mockReset();
});

const EINSATZ_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "2026-09-07T08:00:00.123456Z";

const MIT_ENDE: EngagementDetailDto = {
  id: EINSATZ_ID,
  title: "Baumpflege Herbstschnitt",
  description: null,
  startDate: "2026-09-07",
  endDate: "2026-09-18",
  planningHorizonDate: null,
  colourKey: "moos",
  updatedAt: TOKEN,
  worksiteId: "b0000000-0000-4000-8000-000000000001",
  worksiteName: "Parkanlage Nordring",
  customerName: "Stadtwerke Musterstadt",
  days: [
    {
      worksiteDayId: "d0000000-0000-4000-8000-000000000001",
      localDate: "2026-09-07",
      revisionNo: 1,
      origin: "materialized",
    },
  ],
};

const OFFEN: EngagementDetailDto = {
  ...MIT_ENDE,
  endDate: null,
  planningHorizonDate: "2026-09-18",
};

function laden(detail: EngagementDetailDto = MIT_ENDE): void {
  apiGet.mockResolvedValue(detail);
}

function rendere(overrides: Partial<Parameters<typeof EngagementEditDrawer>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  render(
    <EngagementEditDrawer
      engagementId={EINSATZ_ID}
      today="2026-09-07"
      onClose={onClose}
      onSaved={onSaved}
      {...overrides}
    />,
  );

  return { onClose, onSaved };
}

async function geladen() {
  return screen.findByTestId("einsatzkopf");
}

describe("EngagementEditDrawer", () => {
  it("laedt den Einsatz und zeigt seine Servertruth in den Feldern", async () => {
    laden();
    rendere();

    const kopf = await geladen();

    expect(kopf).toHaveAttribute("data-engagement-id", EINSATZ_ID);
    expect(apiGet).toHaveBeenCalledWith(`/api/einsaetze/${EINSATZ_ID}`);
    expect(screen.getByLabelText("Titel")).toHaveValue("Baumpflege Herbstschnitt");
    expect(screen.getByLabelText("Ende")).toHaveValue("2026-09-18");
  });

  it("unterscheidet sich sichtbar von der Baustellentagbearbeitung", async () => {
    laden();
    rendere();
    await geladen();

    // Der Dialogname trennt die beiden Flaechen (UI ACCEPTANCE).
    expect(screen.getByRole("dialog", { name: "Einsatz bearbeiten" })).toBeInTheDocument();
  });

  it("erklaert, dass bestehende Baustellentage unveraendert bleiben", async () => {
    laden();
    rendere();
    await geladen();

    const hinweis = screen.getByTestId("verlaengerungshinweis");

    expect(hinweis).toHaveTextContent(/Bestehende Baustellentage bleiben unver/i);
    expect(hinweis).toHaveTextContent(/zus(ae|ä)tzliche Tage werden erg(ae|ä)nzt/i);
  });

  it("zeigt beim offenen Einsatz den Planungshorizont statt eines Enddatums", async () => {
    laden(OFFEN);
    rendere();
    await geladen();

    expect(screen.getByLabelText("Planen bis")).toHaveValue("2026-09-18");
    expect(screen.queryByLabelText("Ende")).not.toBeInTheDocument();
  });

  it("sendet den gelesenen Versionstoken als Vorbedingung mit", async () => {
    laden();
    apiPatch.mockResolvedValue({
      engagementId: EINSATZ_ID,
      updatedAt: "2026-09-07T08:00:01.000000Z",
      addedWorksiteDayIds: [],
      addedLocalDates: [],
    });

    const { onSaved } = rendere();

    await geladen();

    const nutzer = userEvent.setup();

    await nutzer.clear(screen.getByLabelText("Titel"));
    await nutzer.type(screen.getByLabelText("Titel"), "Neuer Titel");
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledTimes(1);
    });

    const [pfad, koerper] = apiPatch.mock.calls[0] as [string, Record<string, unknown>];

    expect(pfad).toBe(`/api/einsaetze/${EINSATZ_ID}`);
    expect(koerper.expectedUpdatedAt).toBe(TOKEN);
    expect(koerper.title).toBe("Neuer Titel");
    // Der Start und die Baustelle sind nicht bearbeitbar und duerfen auch
    // nicht im Rumpf auftauchen.
    expect(koerper).not.toHaveProperty("startDate");
    expect(koerper).not.toHaveProperty("worksiteId");

    expect(onSaved).toHaveBeenCalledWith("Neuer Titel", 0);
  });

  it("meldet die Zahl der ergaenzten Tage aus der SERVERANTWORT", async () => {
    laden();
    apiPatch.mockResolvedValue({
      engagementId: EINSATZ_ID,
      updatedAt: "2026-09-07T08:00:01.000000Z",
      addedWorksiteDayIds: ["1", "2", "3"],
      addedLocalDates: ["2026-09-21", "2026-09-22", "2026-09-23"],
    });

    const { onSaved } = rendere();

    await geladen();

    const nutzer = userEvent.setup();

    await nutzer.clear(screen.getByLabelText("Ende"));
    await nutzer.type(screen.getByLabelText("Ende"), "2026-09-23");
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith("Baumpflege Herbstschnitt", 3);
    });
  });

  it("behauptet KEINEN Erfolg, bevor der Server bestaetigt hat", async () => {
    laden();

    let aufloesen: ((wert: unknown) => void) | undefined;

    apiPatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          aufloesen = resolve;
        }),
    );

    const { onSaved } = rendere();

    await geladen();

    const nutzer = userEvent.setup();

    await nutzer.clear(screen.getByLabelText("Titel"));
    await nutzer.type(screen.getByLabelText("Titel"), "Schwebend");
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledTimes(1);
    });

    // Der Server hat noch nicht geantwortet - es darf keine Erfolgsmeldung
    // und keinen geschlossenen Drawer geben.
    expect(onSaved).not.toHaveBeenCalled();

    aufloesen?.({
      engagementId: EINSATZ_ID,
      updatedAt: "x",
      addedWorksiteDayIds: [],
      addedLocalDates: [],
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it("erklaert einen Nebenlaeufigkeitskonflikt und bietet Neuladen an", async () => {
    laden();
    apiPatch.mockRejectedValue(
      new ApiProblemError({
        type: "urn:easytree-prototype:problem:ENGAGEMENT_VERSION_CONFLICT",
        title: "Der Einsatz wurde zwischenzeitlich geaendert.",
        status: 409,
        correlationId: "corr-test",
      }),
    );

    const { onSaved } = rendere();

    await geladen();

    const nutzer = userEvent.setup();

    await nutzer.clear(screen.getByLabelText("Titel"));
    await nutzer.type(screen.getByLabelText("Titel"), "Kollision");
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    const meldung = await screen.findByRole("alert");

    expect(meldung).toHaveTextContent(/zwischenzeitlich/i);
    expect(within(meldung).getByRole("button", { name: "Neu laden" })).toBeInTheDocument();
    // Ein Fehler ist kein Erfolg - auch nicht halb.
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("zeigt einen Serverfehler sichtbar statt ihn zu verschlucken", async () => {
    laden();
    apiPatch.mockRejectedValue(
      new ApiProblemError({
        type: "urn:easytree-prototype:problem:ENGAGEMENT_SHRINK_NOT_ALLOWED",
        title: "Ein Einsatz kann nicht verkuerzt werden.",
        status: 422,
        correlationId: "corr-test",
      }),
    );

    const { onSaved } = rendere();

    await geladen();

    const nutzer = userEvent.setup();

    await nutzer.clear(screen.getByLabelText("Ende"));
    await nutzer.type(screen.getByLabelText("Ende"), "2026-09-08");
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    const meldung = await screen.findByRole("alert");

    expect(meldung).toHaveTextContent("Ein Einsatz kann nicht verkuerzt werden.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("laesst das Enddatum nicht vor dem bisherigen Ende auswaehlen", async () => {
    laden();
    rendere();
    await geladen();

    // Die serverseitige Regel bleibt massgeblich; das Feld erklaert sie nur
    // vorab, statt den Nutzer in einen 422 laufen zu lassen.
    expect(screen.getByLabelText("Ende")).toHaveAttribute("min", "2026-09-18");
  });

  it("meldet einen Ladefehler statt ein leeres Formular zu zeigen", async () => {
    apiGet.mockRejectedValue(new Error("kaputt"));
    rendere();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Einsatz konnte nicht geladen werden/i,
    );
    expect(screen.queryByTestId("einsatzkopf")).not.toBeInTheDocument();
  });
});
