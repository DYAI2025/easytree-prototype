import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "../../src/server/clock/clock";
import { createCustomer } from "../../src/server/commands/create-customer";
import { createEngagement } from "../../src/server/commands/create-engagement";
import { createWorksite } from "../../src/server/commands/create-worksite";
import { updateWorksiteDay } from "../../src/server/commands/update-worksite-day";
import { upsertEmployee } from "../../src/server/commands/upsert-employee";
import { upsertResource } from "../../src/server/commands/upsert-resource";
import { createDb } from "../../src/server/db/client";
import { costOverview } from "../../src/server/queries/cost-overview";
import { engagementDetail } from "../../src/server/queries/engagement-detail";
import { monthPlanningView } from "../../src/server/queries/month-planning-view";
import { worksiteDayDetail } from "../../src/server/queries/worksite-day-detail";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
const tenant = resolveTenant();
const clock = fixedClock("2026-09-07T08:00:00Z");
const deps = { db: handle.db, tenant, clock, correlationId: "corr-q" };

let worksiteA = "";
let worksiteB = "";
let anna = "";
let bernd = "";
let carla = "";
let hebebuehne = "";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;

  const kunde = await createCustomer(deps, { name: "Arboscus Demo" });
  worksiteA = (
    await createWorksite(deps, { customerId: kunde.id, name: "Park Nord", addressLine: "Weg 1" })
  ).id;
  worksiteB = (
    await createWorksite(deps, { customerId: kunde.id, name: "Allee Sued", addressLine: "Weg 2" })
  ).id;
  anna = (await upsertEmployee(deps, { displayName: "Anna", dailyCostMinorUnits: "25000" })).id;
  bernd = (await upsertEmployee(deps, { displayName: "Bernd", dailyCostMinorUnits: "20000" })).id;
  // Carla hat bewusst KEINE Kostengrundlage.
  carla = (await upsertEmployee(deps, { displayName: "Carla" })).id;
  hebebuehne = (
    await upsertResource(deps, {
      kind: "machine",
      name: "Hebebuehne",
      dailyCostMinorUnits: "12000",
    })
  ).id;
});

describe("queries", () => {
  it("erzeugt bei DREI Mitarbeitenden trotzdem GENAU EINE Karte je Tag", async () => {
    await createEngagement(deps, {
      worksiteId: worksiteA,
      title: "Rueckschnitt",
      startDate: "2026-09-07",
      endDate: "2026-09-11",
      colourKey: "moos",
      employeeIds: [anna, bernd, carla],
      resourceIds: [hebebuehne],
    });

    const view = await monthPlanningView(deps, "2026-09");

    // Die Kernentscheidung des Produkts: ein Baustellentag ist EINE Karte,
    // unabhaengig von der Teamgroesse.
    for (const datum of ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]) {
      const karten = view.cards.filter((card) => card.date === datum);
      expect(karten).toHaveLength(1);
      expect(karten[0]?.employeeCount).toBe(3);
      expect(karten[0]?.resourceCount).toBe(1);
    }

    expect(view.cards).toHaveLength(5);
  });

  it("zeigt zwei Einsaetze an verschiedenen Baustellen am selben Tag als zwei Karten mit eigener Farbe", async () => {
    await createEngagement(deps, {
      worksiteId: worksiteA,
      title: "Einsatz A",
      startDate: "2026-09-07",
      endDate: "2026-09-07",
      colourKey: "moos",
      employeeIds: [anna],
      resourceIds: [],
    });
    await createEngagement(deps, {
      worksiteId: worksiteB,
      title: "Einsatz B",
      startDate: "2026-09-07",
      endDate: "2026-09-07",
      colourKey: "petrol",
      employeeIds: [bernd],
      resourceIds: [],
    });

    const view = await monthPlanningView(deps, "2026-09");
    const karten = view.cards.filter((card) => card.date === "2026-09-07");

    expect(karten).toHaveLength(2);
    expect(new Set(karten.map((k) => k.colourKey))).toEqual(new Set(["moos", "petrol"]));
    expect(new Set(karten.map((k) => k.worksiteName))).toEqual(
      new Set(["Park Nord", "Allee Sued"]),
    );
  });

  it("enthaelt Nachbarmonatstage am Rasterrand mit inMonth false", async () => {
    const view = await monthPlanningView(deps, "2026-09");
    const alle = view.weeks.flatMap((w) => w.days);

    expect(alle[0]?.date).toBe("2026-08-31");
    expect(alle[0]?.inMonth).toBe(false);
    expect(alle.at(-1)?.date).toBe("2026-10-04");
    expect(alle.at(-1)?.inMonth).toBe(false);
    expect(alle.filter((d) => d.inMonth)).toHaveLength(30);
    expect(view.today).toBe("2026-09-07");
  });

  it("liefert Spans aus der Servertruth", async () => {
    await createEngagement(deps, {
      worksiteId: worksiteA,
      title: "Rueckschnitt",
      startDate: "2026-09-07",
      endDate: "2026-09-11",
      colourKey: "moos",
      employeeIds: [anna],
      resourceIds: [],
    });

    const view = await monthPlanningView(deps, "2026-09");

    expect(view.spans).toHaveLength(1);
    expect(view.spans[0]).toMatchObject({ rowIndex: 1, startCol: 1, endCol: 5 });
  });

  it("liefert im Tagesdetail NUR die aktuelle Revision", async () => {
    const einsatz = await createEngagement(deps, {
      worksiteId: worksiteA,
      title: "Rueckschnitt",
      startDate: "2026-09-07",
      endDate: "2026-09-11",
      colourKey: "moos",
      employeeIds: [anna],
      resourceIds: [],
    });
    const zielTag = einsatz.worksiteDayIds[3]!;

    await updateWorksiteDay(deps, {
      worksiteDayId: zielTag,
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: { employeeIds: [anna, bernd], note: "Zwei Personen" },
    });

    const detail = await worksiteDayDetail(deps, zielTag);

    expect(detail.revisionNo).toBe(2);
    expect(detail.origin).toBe("day_edit");
    expect(detail.note).toBe("Zwei Personen");
    expect(detail.employees.map((e) => e.id).sort()).toEqual([anna, bernd].sort());
    expect(detail.localDate).toBe("2026-09-10");
  });

  it("meldet in der Kostenuebersicht fehlende Grundlagen statt 0", async () => {
    const einsatz = await createEngagement(deps, {
      worksiteId: worksiteA,
      title: "Rueckschnitt",
      startDate: "2026-09-07",
      endDate: "2026-09-08",
      colourKey: "moos",
      employeeIds: [anna, carla],
      resourceIds: [hebebuehne],
    });

    const kosten = await costOverview(deps, einsatz.engagementId);

    expect(kosten.complete).toBe(false);
    expect(kosten.missingCount).toBe(2);
    // Zwei Tage x (Anna 25000 + Hebebuehne 12000); Carla faellt heraus.
    expect(kosten.totalMinorUnits).toBe("74000");
    expect(kosten.ruleVersion).toBe("prototype-daily-rate-v1");

    const carlaPositionen = kosten.days.flatMap((d) =>
      d.positions.filter((p) => p.subjectId === carla),
    );
    expect(carlaPositionen.every((p) => p.missing && p.amountMinorUnits === null)).toBe(true);
  });

  it("liefert das Einsatzdetail mit Tagen und Ausgangskonfiguration", async () => {
    const einsatz = await createEngagement(deps, {
      worksiteId: worksiteA,
      title: "Rueckschnitt",
      startDate: "2026-09-07",
      endDate: "2026-09-11",
      colourKey: "moos",
      employeeIds: [anna],
      resourceIds: [],
    });

    const detail = await engagementDetail(deps, einsatz.engagementId);

    expect(detail.title).toBe("Rueckschnitt");
    expect(detail.colourKey).toBe("moos");
    expect(detail.worksiteName).toBe("Park Nord");
    expect(detail.days).toHaveLength(5);
    expect(detail.days[0]?.revisionNo).toBe(1);
  });

  it("zeigt Karten von Nachbarmonatstagen am Rasterrand", async () => {
    // Uhr auf den 2026-08-28 stellen, damit ein Einsatz ab dem 31.08. zulaessig ist.
    const august = { ...deps, clock: fixedClock("2026-08-28T08:00:00Z") };

    await createEngagement(august, {
      worksiteId: worksiteA,
      title: "Ueber die Monatsgrenze",
      startDate: "2026-08-31",
      endDate: "2026-09-02",
      colourKey: "ocker",
      employeeIds: [anna],
      resourceIds: [],
    });

    const view = await monthPlanningView(deps, "2026-09");

    // 2026-08-31 ist die erste Rasterzelle des September-Rasters.
    const randKarte = view.cards.filter((card) => card.date === "2026-08-31");
    expect(randKarte).toHaveLength(1);
    expect(randKarte[0]?.title).toBe("Ueber die Monatsgrenze");

    const rasterTag = view.weeks[0]?.days[0];
    expect(rasterTag?.date).toBe("2026-08-31");
    expect(rasterTag?.inMonth).toBe(false);
  });
});
