import { describe, expect, it } from "vitest";

import {
  KEIN_DRAWER,
  planungsUrl,
  resolvePlanungsViewState,
  type PlanungsViewState,
} from "./planning-view-state";
import type { MonthPlanningViewDto } from "../../contracts/worksite-days";
import { buildMonthGrid } from "../../domain/month-grid";

const grid = buildMonthGrid("2026-09");

const TAG_ID = "a0000000-0000-4000-8000-000000000001";
const EINSATZ_ID = "a0000000-0000-4000-8000-000000000002";
const UNBEKANNT = "a0000000-0000-4000-8000-00000000ffff";

const view: MonthPlanningViewDto = {
  month: "2026-09",
  today: "2026-09-08",
  weeks: grid.weeks.map((woche) => ({
    isoWeek: woche.isoWeek,
    days: woche.days.map((tag) => ({ date: tag.date as string, inMonth: tag.inMonth })),
  })),
  cards: [
    {
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
    },
  ],
  spans: [],
};

describe("planungsUrl", () => {
  it("schreibt monat, tag, drawer und id in fester Reihenfolge", () => {
    expect(planungsUrl({ monat: "2026-09", tag: "2026-09-10", drawer: "tag", id: TAG_ID })).toBe(
      `/planung?monat=2026-09&tag=2026-09-10&drawer=tag&id=${TAG_ID}`,
    );
  });

  it("laesst den Monat als einzigen Zustand stehen, wenn kein Drawer offen ist", () => {
    expect(planungsUrl({ monat: "2026-09" })).toBe("/planung?monat=2026-09");
  });

  it("laesst id weg, wenn der Drawer keine braucht", () => {
    expect(planungsUrl({ monat: "2026-09", drawer: "neu" })).toBe(
      "/planung?monat=2026-09&drawer=neu",
    );
  });
});

describe("resolvePlanungsViewState", () => {
  it("ohne drawer-Parameter bleibt der Kalender", () => {
    expect(resolvePlanungsViewState(view, { monat: "2026-09" })).toEqual(KEIN_DRAWER);
  });

  it("oeffnet den Tagesdrawer und nimmt das Datum aus dem Lesemodell", () => {
    const zustand = resolvePlanungsViewState(view, {
      drawer: "tag",
      id: TAG_ID,
      tag: "2026-09-01",
    });

    // Bewusst ein widersprechender tag-Parameter: das Lesemodell gewinnt.
    expect(zustand).toEqual<PlanungsViewState>({
      drawer: "tag",
      worksiteDayId: TAG_ID,
      tag: "2026-09-10",
    });
  });

  it("oeffnet den Kosten-Drawer mit dem Titel aus dem Lesemodell", () => {
    expect(
      resolvePlanungsViewState(view, { drawer: "kosten", id: EINSATZ_ID }),
    ).toEqual<PlanungsViewState>({
      drawer: "kosten",
      engagementId: EINSATZ_ID,
      engagementTitle: "Baumpflege",
      tag: null,
    });
  });

  it("haelt den Tageskontext am Kosten-Drawer fest, wenn er im Raster liegt", () => {
    const zustand = resolvePlanungsViewState(view, {
      drawer: "kosten",
      id: EINSATZ_ID,
      tag: "2026-09-10",
    });

    expect(zustand).toMatchObject({ drawer: "kosten", tag: "2026-09-10" });
  });

  it("oeffnet die Einsatzanlage auch ohne id", () => {
    expect(
      resolvePlanungsViewState(view, { drawer: "neu", tag: "2026-09-10" }),
    ).toEqual<PlanungsViewState>({ drawer: "neu", tag: "2026-09-10" });
  });

  it.each([
    ["unbekannter Drawer", { drawer: "quatsch" }],
    ["tag ohne id", { drawer: "tag" }],
    ["tag mit unbekannter id", { drawer: "tag", id: UNBEKANNT }],
    ["kosten ohne id", { drawer: "kosten" }],
    ["kosten mit unbekannter id", { drawer: "kosten", id: UNBEKANNT }],
    ["mehrfach gesetzter Drawer", { drawer: ["tag", "kosten"], id: TAG_ID }],
  ])("faellt bei %s auf den Kalender zurueck", (_name, params) => {
    expect(resolvePlanungsViewState(view, params)).toEqual(KEIN_DRAWER);
  });

  it("verwirft einen Tag ausserhalb des gezeichneten Rasters", () => {
    expect(
      resolvePlanungsViewState(view, { drawer: "neu", tag: "2026-12-24" }),
    ).toEqual<PlanungsViewState>({ drawer: "neu", tag: null });
  });

  it("nimmt auch einen Nachbarmonatstag an, der im Raster steht", () => {
    expect(
      resolvePlanungsViewState(view, { drawer: "neu", tag: "2026-08-31" }),
    ).toEqual<PlanungsViewState>({ drawer: "neu", tag: "2026-08-31" });
  });
});
