import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanungsAnsicht } from "./planungs-ansicht";
import { KEIN_DRAWER, type PlanungsViewState } from "./planning-view-state";
import type { MonthPlanningViewDto } from "../../contracts/worksite-days";
import { buildMonthGrid } from "../../domain/month-grid";

const push = vi.fn();
const refresh = vi.fn();

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiGet };
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
