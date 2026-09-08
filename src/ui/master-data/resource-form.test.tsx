import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Resource } from "../../contracts/resource";
import { ResourceAdmin, ResourceForm } from "./resource-form";

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiPost };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);
beforeEach(() => {
  apiPost.mockReset();
});

const mittel = (
  id: string,
  kind: Resource["kind"],
  name: string,
  dailyCostMinorUnits: string | null = null,
): Resource => ({
  id,
  kind,
  name,
  identifier: null,
  active: true,
  dailyCostMinorUnits,
  costNote: null,
});

const RESSOURCEN: readonly Resource[] = [
  mittel("a0000000-0000-4000-8000-000000000001", "machine", "Hebebuehne HB-18", "45000"),
  mittel("a0000000-0000-4000-8000-000000000002", "vehicle", "Pritschenwagen P-BM 214", "12000"),
  mittel("a0000000-0000-4000-8000-000000000003", "equipment", "Seilklettersatz B"),
  mittel("a0000000-0000-4000-8000-000000000004", "machine", "Haecksler HX-9", "18000"),
];

describe("ResourceForm", () => {
  it("bietet genau drei Typen mit deutschen Beschriftungen an", () => {
    render(<ResourceForm onSaved={() => {}} />);

    const auswahl = screen.getByLabelText("Typ");
    const optionen = within(auswahl).getAllByRole("option");

    expect(optionen.map((o) => o.textContent)).toEqual(["Fahrzeug", "Maschine", "Geraet"]);
    expect(optionen.map((o) => (o as HTMLOptionElement).value)).toEqual([
      "vehicle",
      "machine",
      "equipment",
    ]);
  });

  it("nennt OQ-006 als offene Produktfrage zu weiteren Typattributen", () => {
    render(<ResourceForm onSaved={() => {}} />);

    expect(
      screen.getByText("Weitere Typattribute sind fachlich noch nicht definiert (OQ-006)."),
    ).toBeInTheDocument();
  });
});

describe("ResourceAdmin", () => {
  it("gruppiert die Liste nach Typ", () => {
    render(<ResourceAdmin resources={RESSOURCEN} />);

    const gruppen = screen.getAllByRole("group");

    expect(gruppen.map((g) => within(g).getByRole("heading", { level: 2 }).textContent)).toEqual([
      "Fahrzeuge",
      "Maschinen",
      "Geraete",
    ]);

    expect(
      gruppen.map((g) =>
        within(g)
          .getAllByTestId("ressourcenname")
          .map((n) => n.textContent),
      ),
    ).toEqual([
      ["Pritschenwagen P-BM 214"],
      // Innerhalb der Gruppe bleibt die Reihenfolge der Eingabe erhalten. Die
      // Sortierung ist Servertruth: listResources ordert nach name aufsteigend.
      // Das Fixture ist absichtlich unsortiert, damit der Test die GRUPPIERUNG
      // belegt und nicht versehentlich eine Sortierung behauptet, die die
      // Komponente gar nicht vornimmt.
      ["Hebebuehne HB-18", "Haecksler HX-9"],
      ["Seilklettersatz B"],
    ]);
  });
});
