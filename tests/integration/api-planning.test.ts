import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST as createCustomerRoute } from "../../src/app/api/auftraggeber/route";
import { POST as createWorksiteRoute } from "../../src/app/api/baustellen/route";
import { POST as applyChangeRoute } from "../../src/app/api/baustellentage/[id]/aenderungen/route";
import { POST as previewRoute } from "../../src/app/api/baustellentage/[id]/aenderungen/vorschau/route";
import { GET as dayDetailRoute } from "../../src/app/api/baustellentage/[id]/route";
import { POST as createEngagementRoute } from "../../src/app/api/einsaetze/route";
import { POST as createEmployeeRoute } from "../../src/app/api/mitarbeitende/route";
import { GET as monthRoute } from "../../src/app/api/planung/monat/route";
import {
  MonthPlanningViewSchema,
  SeriesPreviewSchema,
  WorksiteDayDetailSchema,
} from "../../src/contracts/worksite-days";
import { createDb } from "../../src/server/db/client";
import { setDbForTests } from "../../src/server/db/connection";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
setDbForTests(handle);
const tenant = resolveTenant();

let anna = "";
let bernd = "";
let tage: string[] = [];
let daten: string[] = [];

afterAll(async () => {
  setDbForTests(undefined);
  delete process.env.EASYTREE_FIXED_TODAY;
  await handle.close();
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });

beforeEach(async () => {
  process.env.EASYTREE_FIXED_TODAY = "2026-09-07";

  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;

  const kunde = await (
    await createCustomerRoute(post("http://localhost/api/auftraggeber", { name: "Stadtwerke" }))
  ).json();
  const baustelle = await (
    await createWorksiteRoute(
      post("http://localhost/api/baustellen", {
        customerId: kunde.id,
        name: "Parkanlage Nordring",
        addressLine: "Nordring 12",
      }),
    )
  ).json();
  anna = (
    await (
      await createEmployeeRoute(post("http://localhost/api/mitarbeitende", { displayName: "Anna" }))
    ).json()
  ).id;
  bernd = (
    await (
      await createEmployeeRoute(
        post("http://localhost/api/mitarbeitende", { displayName: "Bernd" }),
      )
    ).json()
  ).id;

  const einsatz = await (
    await createEngagementRoute(
      post(
        "http://localhost/api/einsaetze",
        {
          worksiteId: baustelle.id,
          title: "Baumpflege Herbstschnitt",
          startDate: "2026-09-07",
          endDate: "2026-09-18",
          colourKey: "moos",
          employeeIds: [anna],
          resourceIds: [],
        },
        { "Idempotency-Key": "planning-key" },
      ),
    )
  ).json();

  tage = einsatz.worksiteDayIds;
  daten = einsatz.localDates;
});

const tagVom = (datum: string): string => tage[daten.indexOf(datum)]!;

describe("api-planning", () => {
  it("liefert eine schemakonforme Monatsansicht", async () => {
    const response = await monthRoute(
      new Request("http://localhost/api/planung/monat?monat=2026-09"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // Der Vertrag ist die Pruefung, nicht eine Handvoll Stichproben.
    expect(() => MonthPlanningViewSchema.parse(body)).not.toThrow();
    expect(body.month).toBe("2026-09");
    expect(body.today).toBe("2026-09-07");
    expect(body.cards).toHaveLength(10);
    expect(body.weeks).toHaveLength(5);
  });

  it("weist einen unmoeglichen Monat mit 400 ab", async () => {
    const response = await monthRoute(
      new Request("http://localhost/api/planung/monat?monat=2026-13"),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("liefert das Tagesdetail schemakonform", async () => {
    const response = await dayDetailRoute(
      new Request(`http://localhost/api/baustellentage/${tagVom("2026-09-10")}`),
      { params: Promise.resolve({ id: tagVom("2026-09-10") }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(() => WorksiteDayDetailSchema.parse(body)).not.toThrow();
    expect(body.localDate).toBe("2026-09-10");
    expect(body.revisionNo).toBe(1);
  });

  it("meldet 409 bei veralteter Revision", async () => {
    const ziel = tagVom("2026-09-10");

    const response = await applyChangeRoute(
      post(`http://localhost/api/baustellentage/${ziel}/aenderungen`, {
        scope: "ONLY_THIS_DAY",
        expectedRevisionNo: 7,
        changes: { note: "Veraltet" },
      }),
      { params: Promise.resolve({ id: ziel }) },
    );

    expect(response.status).toBe(409);
    expect((await response.json()).type).toBe("urn:easytree-prototype:problem:STALE_REVISION");
  });

  it("liefert die Serienvorschau mit Zieltagen und Status", async () => {
    const ziel = tagVom("2026-09-10");

    const response = await previewRoute(
      post(`http://localhost/api/baustellentage/${ziel}/aenderungen/vorschau`, {
        includeAdjustedDayIds: [],
      }),
      { params: Promise.resolve({ id: ziel }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(() => SeriesPreviewSchema.parse(body)).not.toThrow();
    expect(body.rows).toHaveLength(7);
    expect(body.targetIds).toHaveLength(7);
    expect(body.rows.every((r: { status: string }) => r.status === "unchanged")).toBe(true);
  });

  it("wendet eine Serienaenderung an und liefert updatedDayIds", async () => {
    const ziel = tagVom("2026-09-10");

    const response = await applyChangeRoute(
      post(`http://localhost/api/baustellentage/${ziel}/aenderungen`, {
        scope: "THIS_AND_FOLLOWING",
        expectedRevisionNo: 1,
        changes: { employeeIds: [anna, bernd], note: "Serie" },
        includeAdjustedDayIds: [],
      }),
      { params: Promise.resolve({ id: ziel }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.updatedDayIds).toHaveLength(7);
    expect(body.newRevisions.every((r: { revisionNo: number }) => r.revisionNo === 2)).toBe(true);

    // Servertruth: die Aenderung ist wirklich persistiert.
    const rows = await handle.sql<{ count: string }[]>`
      select count(*)::text as count from worksite_day_configurations
      where origin = 'series_edit' and superseded_at is null
    `;
    expect(rows[0]?.count).toBe("7");
  });

  it("aendert per ONLY_THIS_DAY genau einen Tag", async () => {
    const ziel = tagVom("2026-09-10");

    const response = await applyChangeRoute(
      post(`http://localhost/api/baustellentage/${ziel}/aenderungen`, {
        scope: "ONLY_THIS_DAY",
        expectedRevisionNo: 1,
        changes: { note: "Nur heute" },
      }),
      { params: Promise.resolve({ id: ziel }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.updatedDayIds).toEqual([ziel]);

    const rows = await handle.sql<{ count: string }[]>`
      select count(*)::text as count from worksite_day_configurations where origin = 'day_edit'
    `;
    expect(rows[0]?.count).toBe("1");
  });
});
