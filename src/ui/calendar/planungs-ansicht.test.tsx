import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanungsAnsicht } from "./planungs-ansicht";
import type { MonthPlanningViewDto } from "../../contracts/worksite-days";
import { buildMonthGrid } from "../../domain/month-grid";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const grid = buildMonthGrid("2026-09");

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

describe("PlanungsAnsicht", () => {
  it("zeigt einen Leerzustand mit klarer Aktion, wenn der Monat leer ist", () => {
    render(<PlanungsAnsicht view={view()} />);

    expect(screen.getByText("Keine Einsaetze in diesem Monat")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Einsatz anlegen" }).length).toBeGreaterThan(0);
  });

  it("zeigt keinen Leerzustand, sobald Karten vorhanden sind", () => {
    render(
      <PlanungsAnsicht
        view={view([
          {
            worksiteDayId: "a0000000-0000-4000-8000-000000000001",
            date: "2026-09-10",
            engagementId: "a0000000-0000-4000-8000-000000000002",
            title: "Baumpflege",
            colourKey: "moos",
            worksiteName: "Park",
            employeeCount: 3,
            resourceCount: 1,
            revisionNo: 1,
            origin: "materialized",
          },
        ])}
      />,
    );

    expect(screen.queryByText("Keine Einsaetze in diesem Monat")).toBeNull();
    expect(screen.getAllByTestId("tageskarte")).toHaveLength(1);
    expect(screen.getByTestId("tageskarte").textContent).toContain("3 Personen");
  });
});
