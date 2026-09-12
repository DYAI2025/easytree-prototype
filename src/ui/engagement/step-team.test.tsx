import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Employee } from "../../contracts/employee";
import type { Resource } from "../../contracts/resource";
import { ApiProblemError } from "../../lib/api-client";
import { StepTeam, type EngagementEntwurf } from "./step-team";

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock("../../lib/api-client", async () => {
  const echt = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");

  return { ...echt, apiPost };
});

afterEach(cleanup);
beforeEach(() => {
  apiPost.mockReset();
});

const mitarbeiter = (id: string, name: string, rolle: string): Employee => ({
  id,
  displayName: name,
  roleLabel: rolle,
  active: true,
  dailyCostMinorUnits: null,
  costNote: null,
});

const ressource = (id: string, name: string): Resource => ({
  id,
  kind: "vehicle",
  name,
  identifier: null,
  active: true,
  dailyCostMinorUnits: null,
  costNote: null,
});

const MITARBEITENDE = [
  mitarbeiter("11111111-1111-4111-8111-111111111111", "Anna Berger", "Baumpflegerin"),
  mitarbeiter("22222222-2222-4222-8222-222222222222", "Bernd Claus", "Kletterer"),
  mitarbeiter("33333333-3333-4333-8333-333333333333", "Carla Diehl", "Fahrerin"),
];

const RESSOURCEN = [
  ressource("aaaaaaaa-1111-4111-8111-111111111111", "Hubsteiger 18m"),
  ressource("aaaaaaaa-2222-4222-8222-222222222222", "Haecksler"),
];

const SCHLUESSEL = "5f7a9c1e-0000-4000-8000-000000000001";

const ENTWURF: EngagementEntwurf = {
  worksiteId: "bbbbbbbb-1111-4111-8111-111111111111",
  worksiteName: "Nordring 12",
  title: "Baumpflege Herbstschnitt",
  startDate: "2026-09-07",
  endDate: "2026-09-18",
  colourKey: "moos",
  addedDays: [],
  removedDays: [],
  localDates: [
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
  ],
};

function aufbau(ueberschreibung: Partial<Parameters<typeof StepTeam>[0]> = {}) {
  return (
    <StepTeam
      entwurf={ENTWURF}
      employees={MITARBEITENDE}
      resources={RESSOURCEN}
      idempotencyKey={SCHLUESSEL}
      onCreated={() => {}}
      {...ueberschreibung}
    />
  );
}

describe("StepTeam", () => {
  it("filtert die Mitarbeitendenliste ueber die Suche", async () => {
    const nutzer = userEvent.setup();

    render(aufbau());

    const liste = screen.getByTestId("mitarbeitende");

    expect(within(liste).getAllByRole("checkbox")).toHaveLength(3);

    await nutzer.type(screen.getByLabelText("Mitarbeitende suchen"), "berg");

    const gefiltert = within(screen.getByTestId("mitarbeitende")).getAllByRole("checkbox");

    expect(gefiltert).toHaveLength(1);
    expect(gefiltert[0]!.getAttribute("aria-label")).toContain("Anna Berger");
  });

  it("zaehlt die Auswahl mit", async () => {
    const nutzer = userEvent.setup();

    render(aufbau());

    expect(screen.getByTestId("auswahlzaehler").textContent).toContain("0 Personen");

    const liste = screen.getByTestId("mitarbeitende");

    await nutzer.click(within(liste).getByRole("checkbox", { name: /Anna Berger/ }));
    await nutzer.click(within(liste).getByRole("checkbox", { name: /Carla Diehl/ }));

    expect(screen.getByTestId("auswahlzaehler").textContent).toContain("2 Personen");

    await nutzer.click(
      within(screen.getByTestId("ressourcen")).getByRole("checkbox", {
        name: /Haecksler/,
      }),
    );

    expect(screen.getByTestId("auswahlzaehler").textContent).toContain("1 Ressource");
  });

  it("zeigt in der Uebersicht Baustelle, Zeitraum, Tageszahl, Team, Ressourcen und Farbnamen", async () => {
    const nutzer = userEvent.setup();

    render(aufbau());

    await nutzer.click(
      within(screen.getByTestId("mitarbeitende")).getByRole("checkbox", { name: /Bernd Claus/ }),
    );
    await nutzer.click(
      within(screen.getByTestId("ressourcen")).getByRole("checkbox", { name: /Hubsteiger/ }),
    );

    const uebersicht = screen.getByTestId("uebersicht").textContent ?? "";

    expect(uebersicht).toContain("Nordring 12");
    expect(uebersicht).toContain("07.09.2026");
    expect(uebersicht).toContain("18.09.2026");
    expect(uebersicht).toContain("10 Arbeitstage");
    expect(uebersicht).toContain("Bernd Claus");
    expect(uebersicht).toContain("Hubsteiger 18m");
    // Farbname, nicht Farbschluessel: "moos" ist kein Wort fuer den Nutzer.
    expect(uebersicht).toContain("Moos");
    expect(uebersicht).not.toContain("moos");
  });

  it("sendet EINEN Idempotency-Key und erzeugt bei Doppelklick keinen zweiten Einsatz", async () => {
    const nutzer = userEvent.setup();
    let aufloesen: ((wert: unknown) => void) | undefined;

    apiPost.mockImplementation(
      () =>
        new Promise((loese) => {
          aufloesen = loese;
        }),
    );

    render(aufbau());

    const knopf = screen.getByRole("button", { name: "Einsatz anlegen" });

    await nutzer.click(knopf);
    await nutzer.click(knopf);

    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost.mock.calls[0]![0]).toBe("/api/einsaetze");
    expect(apiPost.mock.calls[0]![2]).toEqual({ "Idempotency-Key": SCHLUESSEL });

    aufloesen!({
      engagementId: "cccccccc-1111-4111-8111-111111111111",
      worksiteDayIds: [],
      localDates: ENTWURF.localDates,
    });

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1);
    });
  });

  it("zeigt bei 409 die konfliktbehafteten Tage im Banner", async () => {
    const nutzer = userEvent.setup();

    apiPost.mockRejectedValue(
      new ApiProblemError({
        type: "urn:easytree-prototype:problem:WORKSITE_DAY_ALREADY_PLANNED",
        title: "Tage bereits verplant",
        status: 409,
        detail: "An dieser Baustelle sind folgende Tage bereits verplant.",
        correlationId: "test-korrelation",
        meta: { conflictingDates: ["2026-09-09", "2026-09-10"] },
      }),
    );

    render(aufbau());
    await nutzer.click(screen.getByRole("button", { name: "Einsatz anlegen" }));

    const banner = await screen.findByRole("alert");

    expect(banner.textContent).toContain("09.09.2026");
    expect(banner.textContent).toContain("10.09.2026");
  });
});
