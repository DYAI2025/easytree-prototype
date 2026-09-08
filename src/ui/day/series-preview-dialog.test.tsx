import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SeriesPreviewDto, WorksiteDayDetailDto } from "../../contracts/worksite-days";
import { SeriesPreviewDialog } from "./series-preview-dialog";

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiPost };
});

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
  apiPost.mockReset();
});

const TAG = (n: number): string => `d0000000-0000-4000-8000-00000000000${n}`;
const ANNA = "e0000000-0000-4000-8000-00000000000a";
const BERND = "e0000000-0000-4000-8000-00000000000b";
const BUEHNE = "r0000000-0000-4000-8000-00000000000a";
const HAECKSLER = "r0000000-0000-4000-8000-00000000000b";

const DETAIL: WorksiteDayDetailDto = {
  worksiteDayId: TAG(2),
  localDate: "2026-09-08",
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
  employees: [
    { id: ANNA, displayName: "Anna Bergmann" },
    { id: BERND, displayName: "Bernd Kowalski" },
  ],
  resources: [{ id: BUEHNE, name: "Hebebuehne HB-18", kind: "machine" }],
};

/** Anna bleibt, Bernd faellt weg, Haecksler kommt dazu. */
const ENTWURF = {
  employeeIds: [ANNA],
  resourceIds: [BUEHNE, HAECKSLER],
  plannedStartTime: null,
  plannedEndTime: null,
  note: "",
};

const NAMEN = {
  employees: [
    { id: ANNA, name: "Anna Bergmann" },
    { id: BERND, name: "Bernd Kowalski" },
  ],
  resources: [
    { id: BUEHNE, name: "Hebebuehne HB-18" },
    { id: HAECKSLER, name: "Haecksler HX-9" },
  ],
};

function vorschau(includeAdjustedDayIds: readonly string[] = []): SeriesPreviewDto {
  const angepasstEinbezogen = includeAdjustedDayIds.includes(TAG(3));

  return {
    engagementId: DETAIL.engagementId,
    fromDate: "2026-09-08",
    rows: [
      { worksiteDayId: TAG(1), date: "2026-09-07", origin: "materialized", status: "past_locked" },
      { worksiteDayId: TAG(2), date: "2026-09-08", origin: "materialized", status: "unchanged" },
      {
        worksiteDayId: TAG(3),
        date: "2026-09-09",
        origin: "day_edit",
        status: angepasstEinbezogen ? "adjusted_included" : "adjusted_excluded",
      },
      { worksiteDayId: TAG(4), date: "2026-09-10", origin: "materialized", status: "unchanged" },
    ],
    targetIds: angepasstEinbezogen ? [TAG(2), TAG(3), TAG(4)] : [TAG(2), TAG(4)],
    adjustedCount: 1,
  };
}

function zeichnen() {
  return render(
    <SeriesPreviewDialog
      detail={DETAIL}
      entwurf={ENTWURF}
      namen={NAMEN}
      onClose={() => {}}
      onApplied={() => {}}
    />,
  );
}

function antworteMitVorschau(): void {
  apiPost.mockImplementation(
    async (pfad: string, koerper: { includeAdjustedDayIds?: string[] }) => {
      if (pfad.endsWith("/vorschau")) {
        return vorschau(koerper.includeAdjustedDayIds ?? []);
      }

      return { updatedDayIds: [], newRevisions: [] };
    },
  );
}

const zeilen = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("SeriesPreviewDialog", () => {
  it("listet jeden Zieltag mit Datum und einem Statustext, nicht nur Farbe", async () => {
    antworteMitVorschau();
    zeichnen();

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());

    expect(
      zeilen().map((zeile) => {
        const zellen = within(zeile).getAllByRole("cell");

        return [zellen[0]!.textContent, zellen[1]!.textContent];
      }),
    ).toEqual([
      ["07.09.2026", "vergangen - gesperrt"],
      ["08.09.2026", "unveraendert"],
      ["09.09.2026", "individuell angepasst - ausgeschlossen"],
      ["10.09.2026", "unveraendert"],
    ]);
  });

  it("schliesst angepasste Tage vorausgewaehlt aus und laesst sie einzeln einbeziehen", async () => {
    const nutzer = userEvent.setup();

    antworteMitVorschau();
    zeichnen();

    const kasten = await screen.findByRole("checkbox", { name: "09.09.2026 einbeziehen" });

    expect(kasten).not.toBeChecked();

    await nutzer.click(kasten);

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "09.09.2026 einbeziehen" })).toBeChecked(),
    );

    // Der Server bleibt die Wahrheit ueber den Status: die Einbeziehung geht
    // als includeAdjustedDayIds erneut an die Vorschau.
    expect(apiPost).toHaveBeenLastCalledWith(expect.stringContaining("/vorschau"), {
      includeAdjustedDayIds: [TAG(3)],
    });

    expect(
      within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1)
        .map((zeile) => within(zeile).getAllByRole("cell")[1]!.textContent),
    ).toContain("individuell angepasst - einbezogen");
  });

  it("nennt die Aenderung im Klartext", async () => {
    antworteMitVorschau();
    zeichnen();

    const zusammenfassung = await screen.findByTestId("serien-zusammenfassung");

    expect(zusammenfassung).toHaveTextContent("Team: -Bernd Kowalski");
    expect(zusammenfassung).toHaveTextContent("Ressourcen: +Haecksler HX-9");
    /*
     * Der Plan nennt in 6.6 nur "N ausgeschlossen". Hier stehen zwei Zahlen,
     * weil es zwei verschiedene Gruende sind: die Ausschluss-Regel fuer
     * angepasste Tage ist eine Prototyp-Vorgabe und per Checkbox aufhebbar
     * (OQ-001), die Vergangenheitssperre ist serverseitig unumgehbar (A-07).
     * Eine gemeinsame Zahl haette beides zu "2 ausgeschlossen" verschmolzen.
     */
    expect(screen.getByTestId("serien-zaehler")).toHaveTextContent(
      "2 Tage werden geaendert, 1 ausgeschlossen (individuell angepasst), 1 gesperrt (vergangen)",
    );
  });

  it("laesst Uebernehmen erst zu, wenn die Vorschau geladen ist", async () => {
    let freigeben: (wert: unknown) => void = () => {};

    apiPost.mockReturnValue(
      new Promise((resolve) => {
        freigeben = resolve;
      }),
    );

    zeichnen();

    expect(screen.getByRole("button", { name: "Uebernehmen" })).toBeDisabled();

    freigeben(vorschau());

    await waitFor(() => expect(screen.getByRole("button", { name: "Uebernehmen" })).toBeEnabled());
  });

  /*
   * OQ-001 ist offen. Die Regel "angepasste Tage bleiben aussen vor" ist eine
   * Prototyp-Vorgabe (A-06), keine Produktentscheidung - und das muss auf der
   * Flaeche stehen, nicht nur im Plan.
   */
  it("weist sichtbar darauf hin, dass die Regel eine Prototyp-Vorgabe ist", async () => {
    antworteMitVorschau();
    zeichnen();

    expect(
      await screen.findByText(
        "Regel fuer bereits angepasste Tage ist eine Prototyp-Vorgabe (OQ-001 offen).",
      ),
    ).toBeInTheDocument();
  });

  it("bietet fuer vergangene Tage gar keine Einbeziehung an", async () => {
    antworteMitVorschau();
    zeichnen();

    await screen.findByRole("table");

    expect(screen.queryByRole("checkbox", { name: "07.09.2026 einbeziehen" })).toBeNull();

    const vergangeneZeile = zeilen()[0]!;

    expect(within(vergangeneZeile).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(vergangeneZeile).getAllByRole("cell")[1]).toHaveTextContent(
      "vergangen - gesperrt",
    );
  });
});
