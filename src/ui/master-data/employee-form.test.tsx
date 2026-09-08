import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmployeeForm } from "./employee-form";

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiPost };
});

afterEach(cleanup);
beforeEach(() => {
  apiPost.mockReset();
  apiPost.mockResolvedValue({
    id: "a0000000-0000-4000-8000-000000000001",
    displayName: "Anna Bergmann",
    roleLabel: null,
    active: true,
    dailyCostMinorUnits: null,
    costNote: null,
  });
});

/** Der zuletzt gesendete Anfragekoerper - die Wahrheit ueber das Wire-Format. */
function letzterKoerper(): Record<string, unknown> {
  expect(apiPost).toHaveBeenCalledTimes(1);

  return apiPost.mock.calls[0]![1] as Record<string, unknown>;
}

describe("EmployeeForm", () => {
  it("meldet einen leeren Namen inline und sendet nichts", async () => {
    const nutzer = userEvent.setup();

    render(<EmployeeForm onSaved={() => {}} />);

    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Pflichtfeld");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("nimmt den Tagessatz 250,00 an und sendet 25000 Minor Units", async () => {
    const nutzer = userEvent.setup();

    render(<EmployeeForm onSaved={() => {}} />);

    await nutzer.type(screen.getByLabelText("Name"), "Anna Bergmann");
    await nutzer.type(screen.getByLabelText(/Demo-Tagessatz/), "250,00");
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    expect(letzterKoerper().dailyCostMinorUnits).toBe("25000");
  });

  /*
   * Der Plan formuliert "leerer Tagessatz sendet null (nicht 0)". Gemessen am
   * echten Vertrag (UpsertEmployeeCommand.safeParse) wird ein literales `null`
   * mit "Invalid input" ABGELEHNT - `MinorUnitsSchema.optional()` laesst nur
   * `undefined` zu. Das serverseitig belegte Wire-Format fuer "kein Satz" ist
   * deshalb das FEHLENDE Feld; die Datenbank speichert daraufhin NULL
   * (tests/integration/api-master-data.test.ts: Erik Sommer ohne Satz -> null).
   * Die Regel selbst - niemals 0 - wird hier unveraendert geprueft.
   */
  it("sendet ohne Tagessatz kein Feld und niemals eine 0", async () => {
    const nutzer = userEvent.setup();

    render(<EmployeeForm onSaved={() => {}} />);

    await nutzer.type(screen.getByLabelText("Name"), "Erik Sommer");
    await nutzer.click(screen.getByRole("button", { name: "Speichern" }));

    const koerper = letzterKoerper();

    expect("dailyCostMinorUnits" in koerper).toBe(false);
    expect(Object.values(koerper)).not.toContain(0);
    expect(Object.values(koerper)).not.toContain("0");
  });

  it("beschriftet das Satzfeld als Demo-Tagessatz (Prototyp)", () => {
    render(<EmployeeForm onSaved={() => {}} />);

    expect(screen.getByLabelText(/^Demo-Tagessatz \(Prototyp\)/)).toBeInTheDocument();
  });
});
