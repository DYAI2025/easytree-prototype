import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CostOverviewDto } from "../../contracts/costs";
import { CostDrawer } from "./cost-drawer";

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiGet };
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
  apiGet.mockReset();
});

const EINSATZ = "c0000000-0000-4000-8000-000000000001";
const ANNA = "e0000000-0000-4000-8000-00000000000a";
const ERIK = "e0000000-0000-4000-8000-00000000000e";
const SEIL = "r0000000-0000-4000-8000-00000000000s";

/**
 * Zwei Tage. Erik hat keinen Satz, der Seilklettersatz auch nicht - also genau
 * zwei fehlende Grundlagen je Tag, vier insgesamt. Die Summe ist damit
 * 2 x 32000 = 64000.
 */
const UEBERSICHT: CostOverviewDto = {
  engagementId: EINSATZ,
  currency: "EUR",
  ruleVersion: "prototype-daily-rate-v1",
  totalMinorUnits: "64000",
  missingCount: 4,
  complete: false,
  days: [
    {
      date: "2026-09-07",
      subtotalMinorUnits: "32000",
      missingCount: 2,
      positions: [
        {
          subjectId: ANNA,
          subjectLabel: "Anna Bergmann",
          kind: "employee",
          amountMinorUnits: "32000",
          missing: false,
        },
        {
          subjectId: ERIK,
          subjectLabel: "Erik Sommer",
          kind: "employee",
          amountMinorUnits: null,
          missing: true,
        },
        {
          subjectId: SEIL,
          subjectLabel: "Seilklettersatz B",
          kind: "resource",
          amountMinorUnits: null,
          missing: true,
        },
      ],
    },
    {
      date: "2026-09-08",
      subtotalMinorUnits: "32000",
      missingCount: 2,
      positions: [
        {
          subjectId: ANNA,
          subjectLabel: "Anna Bergmann",
          kind: "employee",
          amountMinorUnits: "32000",
          missing: false,
        },
        {
          subjectId: ERIK,
          subjectLabel: "Erik Sommer",
          kind: "employee",
          amountMinorUnits: null,
          missing: true,
        },
        {
          subjectId: SEIL,
          subjectLabel: "Seilklettersatz B",
          kind: "resource",
          amountMinorUnits: null,
          missing: true,
        },
      ],
    },
  ],
  byEmployee: [
    {
      subjectId: ANNA,
      subjectLabel: "Anna Bergmann",
      totalMinorUnits: "64000",
      missingCount: 0,
    },
    { subjectId: ERIK, subjectLabel: "Erik Sommer", totalMinorUnits: "0", missingCount: 2 },
  ],
  byResource: [
    { subjectId: SEIL, subjectLabel: "Seilklettersatz B", totalMinorUnits: "0", missingCount: 2 },
  ],
};

function zeichnen(uebersicht: CostOverviewDto = UEBERSICHT) {
  apiGet.mockResolvedValue(uebersicht);

  return render(
    <CostDrawer
      engagementId={EINSATZ}
      engagementTitle="Baumpflege Herbstschnitt"
      onClose={() => {}}
    />,
  );
}

describe("CostDrawer", () => {
  it("bietet genau drei Reiter an", async () => {
    zeichnen();

    const reiter = await screen.findAllByRole("tab");

    expect(reiter.map((r) => r.textContent)).toEqual([
      "Nach Tag",
      "Nach Mitarbeiter",
      "Nach Ressource",
    ]);
  });

  /*
   * Der zentrale Negativtest (FR-020, H-03): eine fehlende Kostengrundlage
   * MUSS als "fehlt" erscheinen. Wird daraus "0,00", ist die Summe falsch und
   * niemand sieht es. Deshalb wird hier ausdruecklich auf die Abwesenheit von
   * "0,00" in genau diesen Zellen geprueft.
   */
  it("zeigt fehlende Grundlagen als fehlt und niemals als 0,00", async () => {
    zeichnen();

    const zellen = await screen.findAllByTestId("betrag-fehlt");

    expect(zellen).toHaveLength(4);

    for (const zelle of zellen) {
      expect(zelle).toHaveTextContent("fehlt");
      expect(zelle.textContent).not.toContain("0,00");
      // Symbol UND Text - Farbe oder Icon allein waeren kein Statustext.
      expect(within(zelle).getByTestId("warnsymbol")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("nennt im Kopf die Zahl der fehlenden Grundlagen", async () => {
    zeichnen();

    expect(await screen.findByTestId("kostenkopf")).toHaveTextContent(
      "unvollstaendig - 4 Grundlagen fehlen",
    );
  });

  it("zeigt eine Summe, die der Summe der angezeigten Positionen entspricht", async () => {
    zeichnen();

    const summe = await screen.findByTestId("kostensumme");

    expect(summe).toHaveTextContent("640,00 €");

    const zwischensummen = screen.getAllByTestId("tageszwischensumme").map((z) => z.textContent);

    expect(zwischensummen).toEqual(["320,00 €", "320,00 €"]);
  });

  it("nennt die Regelversion und den Prototyp-Charakter in der Fussnote", async () => {
    zeichnen();

    const fussnote = await screen.findByTestId("kostenfussnote");

    expect(fussnote).toHaveTextContent("prototype-daily-rate-v1");
    expect(fussnote).toHaveTextContent("Demo-Tagessaetze");
    expect(fussnote).toHaveTextContent("keine Lohn- oder Buchhaltungsdaten");
  });

  /*
   * Die Umbruchstelle im Kopf "Zwischensumme" (TASK-049) darf die Beschriftung
   * NICHT veraendern: <wbr> ist eine Umbruchgelegenheit, kein Zeichen. Geprueft
   * wird der zugaengliche Name - haette die Reparatur gekuerzt, abgekuerzt oder
   * ein weiches Trennzeichen eingefuegt, stuende hier ein anderer String.
   */
  it("beschriftet die Spalten der Tagestabelle unveraendert", async () => {
    zeichnen();

    const koepfe = await screen.findAllByRole("columnheader");

    expect(koepfe.map((kopf) => kopf.textContent)).toEqual([
      "Datum",
      "Position",
      "Betrag",
      "Zwischensumme",
    ]);
    expect(koepfe[3]).toHaveAccessibleName("Zwischensumme");
  });

  it("legt jede Tabelle in einen horizontal scrollbaren Container", async () => {
    const nutzer = userEvent.setup();

    zeichnen();

    await screen.findAllByRole("tab");

    for (const reiter of ["Nach Tag", "Nach Mitarbeiter", "Nach Ressource"]) {
      await nutzer.click(screen.getByRole("tab", { name: reiter }));

      const tabelle = await screen.findByRole("table");

      expect(tabelle.parentElement).toHaveClass("overflow-x-auto");
    }
  });
});
