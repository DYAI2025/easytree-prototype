import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "../../src/server/clock/clock";
import { createCustomer } from "../../src/server/commands/create-customer";
import { createEngagement } from "../../src/server/commands/create-engagement";
import { createWorksite } from "../../src/server/commands/create-worksite";
import { upsertEmployee } from "../../src/server/commands/upsert-employee";
import { upsertResource } from "../../src/server/commands/upsert-resource";
import { createDb } from "../../src/server/db/client";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
const tenant = resolveTenant();
/** Fester Zeitanker: 2026-09-07 ist ein Montag. */
const clock = fixedClock("2026-09-07T08:00:00Z");
const deps = { db: handle.db, tenant, clock, correlationId: "corr-eng" };

let worksiteA = "";
let worksiteB = "";
let anna = "";
let hebebuehne = "";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;

  const kunde = await createCustomer(deps, { name: "Arboscus Demo" });
  worksiteA = (
    await createWorksite(deps, {
      customerId: kunde.id,
      name: "Parkanlage Nord",
      addressLine: "Musterweg 1",
    })
  ).id;
  worksiteB = (
    await createWorksite(deps, {
      customerId: kunde.id,
      name: "Allee Sued",
      addressLine: "Musterweg 2",
    })
  ).id;
  anna = (await upsertEmployee(deps, { displayName: "Anna" })).id;
  hebebuehne = (await upsertResource(deps, { kind: "machine", name: "Hebebuehne" })).id;
});

const basis = () => ({
  worksiteId: worksiteA,
  title: "Rueckschnitt",
  startDate: "2026-09-07",
  endDate: "2026-09-18",
  colourKey: "moos" as const,
  employeeIds: [anna],
  resourceIds: [hebebuehne],
});

describe("create-engagement", () => {
  it("materialisiert zehn Werktage mit je einer Revision 1", async () => {
    const result = await createEngagement(deps, basis());

    expect(result.worksiteDayIds).toHaveLength(10);
    expect(result.localDates).toEqual([
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
    ]);

    const konfigurationen = await handle.sql<
      { revision_no: number; origin: string; superseded_at: string | null }[]
    >`
      select revision_no, origin, superseded_at
      from worksite_day_configurations order by revision_no
    `;

    expect(konfigurationen).toHaveLength(10);
    expect(konfigurationen.every((k) => k.revision_no === 1)).toBe(true);
    expect(konfigurationen.every((k) => k.origin === "materialized")).toBe(true);
    expect(konfigurationen.every((k) => k.superseded_at === null)).toBe(true);
  });

  it("materialisiert Team und Ressourcen der Ausgangskonfiguration je Tag", async () => {
    await createEngagement(deps, basis());

    const team = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from day_team_members`;
    const ressourcen = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from day_resource_allocations`;

    expect(team[0]?.count).toBe("10");
    expect(ressourcen[0]?.count).toBe("10");

    const zuordnung = await handle.sql<
      { employee_id: string }[]
    >`select distinct employee_id from day_team_members`;
    expect(zuordnung.map((z) => z.employee_id)).toEqual([anna]);
  });

  it("nimmt einen zugewaehlten Samstag als elften Tag auf", async () => {
    const result = await createEngagement(deps, { ...basis(), addedDays: ["2026-09-12"] });

    expect(result.worksiteDayIds).toHaveLength(11);
    expect(result.localDates).toContain("2026-09-12");
  });

  it("materialisiert bei offenem Ende bis zum Planungshorizont und laesst end_date null", async () => {
    const result = await createEngagement(deps, {
      ...basis(),
      endDate: undefined,
      planningHorizonDate: "2026-09-30",
    });

    expect(result.localDates.at(-1)).toBe("2026-09-30");
    expect(result.localDates).toHaveLength(18);

    const rows = await handle.sql<{ end_date: string | null; planning_horizon_date: string }[]>`
      select end_date, planning_horizon_date from engagements
    `;
    expect(rows[0]?.end_date).toBeNull();
    expect(rows[0]?.planning_horizon_date).toBe("2026-09-30");
  });

  it("speichert die Ausgangskonfiguration am Einsatz", async () => {
    await createEngagement(deps, basis());

    const rows = await handle.sql<
      { initial_configuration: { employeeIds: string[]; resourceIds: string[] } }[]
    >`
      select initial_configuration from engagements
    `;

    expect(rows[0]?.initial_configuration.employeeIds).toEqual([anna]);
    expect(rows[0]?.initial_configuration.resourceIds).toEqual([hebebuehne]);
  });

  it("schreibt einen Audit-Eintrag mit der Tageszahl", async () => {
    const result = await createEngagement(deps, basis());

    const rows = await handle.sql<{ operation: string; payload: { dayCount: number } }[]>`
      select operation, payload from audit_events where operation = 'create_engagement'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload.dayCount).toBe(10);
    expect(result.worksiteDayIds).toHaveLength(10);
  });

  it("lehnt einen Start in der Vergangenheit ab und legt KEINE Zeile an", async () => {
    // Uhr steht auf 2026-09-07; der 06.09. liegt davor.
    await expect(
      createEngagement(deps, { ...basis(), startDate: "2026-09-06" }),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_START_IN_PAST" });

    const engagements = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from engagements`;
    const tage = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from worksite_days`;
    expect(engagements[0]?.count).toBe("0");
    expect(tage[0]?.count).toBe("0");
  });

  it("erlaubt einen Start am heutigen Tag", async () => {
    const result = await createEngagement(deps, { ...basis(), startDate: "2026-09-07" });
    expect(result.localDates[0]).toBe("2026-09-07");
  });

  it("rollt bei einem Fehler NACH dem Tageseinfuegen alles zurueck", async () => {
    await expect(
      createEngagement(deps, basis(), {
        afterDaysInserted: async () => {
          throw new Error("Fehlerinjektion nach dem Tageseinfuegen");
        },
      }),
    ).rejects.toThrow("Fehlerinjektion nach dem Tageseinfuegen");

    // Der eigentliche Beweis: KEINE Teilwirkung in irgendeiner der drei Tabellen.
    const zeilen = await handle.sql<
      { engagements: string; tage: string; konfigurationen: string; team: string }[]
    >`
      select
        (select count(*) from engagements)::text as engagements,
        (select count(*) from worksite_days)::text as tage,
        (select count(*) from worksite_day_configurations)::text as konfigurationen,
        (select count(*) from day_team_members)::text as team
    `;

    expect(zeilen[0]).toEqual({ engagements: "0", tage: "0", konfigurationen: "0", team: "0" });
  });

  it("laesst nach einem gescheiterten Versuch einen erneuten Anlauf zu", async () => {
    await expect(
      createEngagement(deps, basis(), {
        afterDaysInserted: async () => {
          throw new Error("Abbruch");
        },
      }),
    ).rejects.toThrow("Abbruch");

    const result = await createEngagement(deps, basis());

    expect(result.worksiteDayIds).toHaveLength(10);
    const zeilen = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from engagements`;
    expect(zeilen[0]?.count).toBe("1");
  });

  it("verhindert einen zweiten Einsatz mit ueberlappendem Tag an DERSELBEN Baustelle", async () => {
    const erster = await createEngagement(deps, basis());

    await expect(
      createEngagement(deps, {
        ...basis(),
        title: "Zweiter Versuch",
        startDate: "2026-09-16",
        endDate: "2026-09-25",
      }),
    ).rejects.toMatchObject({ code: "WORKSITE_DAY_ALREADY_PLANNED" });

    // Der erste Einsatz bleibt vollstaendig und unveraendert.
    const tage = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from worksite_days`;
    const eins = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from engagements`;
    expect(tage[0]?.count).toBe("10");
    expect(eins[0]?.count).toBe("1");
    expect(erster.worksiteDayIds).toHaveLength(10);
  });

  it("nennt die Konflikttage in der Fehlermeldung", async () => {
    await createEngagement(deps, basis());

    let fehler: { code?: string; message?: string } = {};

    try {
      await createEngagement(deps, {
        ...basis(),
        title: "Zweiter Versuch",
        startDate: "2026-09-16",
        endDate: "2026-09-25",
      });
      throw new Error("Erwartet wurde ein Konflikt, es gab aber keinen.");
    } catch (error) {
      fehler = error as { code?: string; message?: string };
    }

    expect(fehler.code).toBe("WORKSITE_DAY_ALREADY_PLANNED");
    // 16., 17. und 18.09. sind bereits belegt, der 21.09. nicht mehr.
    expect(fehler.message ?? "").toContain("2026-09-16");
    expect(fehler.message ?? "").toContain("2026-09-17");
    expect(fehler.message ?? "").toContain("2026-09-18");
    expect(fehler.message ?? "").not.toContain("2026-09-21");
  });

  it("erlaubt denselben Tag an einer ANDEREN Baustelle", async () => {
    await createEngagement(deps, basis());

    const zweiter = await createEngagement(deps, { ...basis(), worksiteId: worksiteB });

    expect(zweiter.worksiteDayIds).toHaveLength(10);

    const zeilen = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from worksite_days`;
    expect(zeilen[0]?.count).toBe("20");
  });
});
