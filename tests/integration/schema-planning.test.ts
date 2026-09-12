import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "../../src/server/db/client";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 4 });
const sql = handle.sql;

const ORG = "a0000000-0000-4000-8000-000000000001";
const CUSTOMER = "a0000000-0000-4000-8000-000000000002";
const WORKSITE = "a0000000-0000-4000-8000-000000000003";
const WORKSITE_B = "a0000000-0000-4000-8000-000000000004";
const EMPLOYEE = "a0000000-0000-4000-8000-000000000005";
const RESOURCE = "a0000000-0000-4000-8000-000000000006";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await sql`truncate table organizations restart identity cascade`;
  await sql`insert into organizations (id, name, time_zone) values (${ORG}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;
  await sql`insert into customers (id, org_id, name) values (${CUSTOMER}, ${ORG}, 'Arboscus Demo')`;
  await sql`insert into worksites (id, org_id, customer_id, name, address_line) values (${WORKSITE}, ${ORG}, ${CUSTOMER}, 'Baustelle A', 'Musterweg 1')`;
  await sql`insert into worksites (id, org_id, customer_id, name, address_line) values (${WORKSITE_B}, ${ORG}, ${CUSTOMER}, 'Baustelle B', 'Musterweg 2')`;
  await sql`insert into employees (id, org_id, display_name) values (${EMPLOYEE}, ${ORG}, 'Anna')`;
  await sql`insert into resources (id, org_id, kind, name) values (${RESOURCE}, ${ORG}, 'machine', 'Hebebuehne')`;
});

async function sqlstateOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as { code?: string }).code ?? "KEIN_CODE";
  }

  throw new Error("Erwartet wurde eine Constraint-Verletzung, es gab aber keine.");
}

async function insertEngagement(id: string, worksiteId = WORKSITE): Promise<string> {
  await sql`
    insert into engagements (id, org_id, worksite_id, title, start_date, end_date, colour_key, initial_configuration)
    values (${id}, ${ORG}, ${worksiteId}, 'Rueckschnitt', '2026-09-07', '2026-09-18', 'moos', '{"employeeIds":[],"resourceIds":[]}'::jsonb)
  `;
  return id;
}

async function insertDay(id: string, engagementId: string, date: string, worksiteId = WORKSITE) {
  await sql`
    insert into worksite_days (id, org_id, worksite_id, engagement_id, local_date)
    values (${id}, ${ORG}, ${worksiteId}, ${engagementId}, ${date})
  `;
}

async function insertConfiguration(
  id: string,
  dayId: string,
  revision: number,
  superseded: boolean,
) {
  await sql`
    insert into worksite_day_configurations (id, org_id, worksite_day_id, revision_no, origin, superseded_at)
    values (${id}, ${ORG}, ${dayId}, ${revision}, 'materialized', ${superseded ? sql`now()` : null})
  `;
}

describe("schema-planning", () => {
  it("legt die Planungstabellen an", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public'
    `;

    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        "engagements",
        "worksite_days",
        "worksite_day_configurations",
        "day_team_members",
        "day_resource_allocations",
      ]),
    );
  });

  it("laesst pro Baustelle und lokalem Tag nur einen Baustellentag zu", async () => {
    const a = await insertEngagement("b0000000-0000-4000-8000-000000000001");
    const b = await insertEngagement("b0000000-0000-4000-8000-000000000002");
    await insertDay("c0000000-0000-4000-8000-000000000001", a, "2026-09-07");

    const code = await sqlstateOf(() =>
      insertDay("c0000000-0000-4000-8000-000000000002", b, "2026-09-07"),
    );

    expect(code).toBe("23505");
  });

  it("erlaubt denselben Tag an einer ANDEREN Baustelle", async () => {
    const a = await insertEngagement("b0000000-0000-4000-8000-000000000001");
    const b = await insertEngagement("b0000000-0000-4000-8000-000000000002", WORKSITE_B);
    await insertDay("c0000000-0000-4000-8000-000000000001", a, "2026-09-07");
    await insertDay("c0000000-0000-4000-8000-000000000002", b, "2026-09-07", WORKSITE_B);

    const rows = await sql<{ count: string }[]>`select count(*)::text as count from worksite_days`;
    expect(rows[0]?.count).toBe("2");
  });

  it("laesst je Baustellentag nur EINE nicht abgeloeste Konfiguration zu", async () => {
    const engagement = await insertEngagement("b0000000-0000-4000-8000-000000000001");
    await insertDay("c0000000-0000-4000-8000-000000000001", engagement, "2026-09-07");
    await insertConfiguration(
      "d0000000-0000-4000-8000-000000000001",
      "c0000000-0000-4000-8000-000000000001",
      1,
      false,
    );

    const code = await sqlstateOf(() =>
      insertConfiguration(
        "d0000000-0000-4000-8000-000000000002",
        "c0000000-0000-4000-8000-000000000001",
        2,
        false,
      ),
    );

    expect(code).toBe("23505");
  });

  it("erlaubt eine neue Revision, sobald die alte abgeloest ist", async () => {
    const engagement = await insertEngagement("b0000000-0000-4000-8000-000000000001");
    await insertDay("c0000000-0000-4000-8000-000000000001", engagement, "2026-09-07");
    await insertConfiguration(
      "d0000000-0000-4000-8000-000000000001",
      "c0000000-0000-4000-8000-000000000001",
      1,
      true,
    );
    await insertConfiguration(
      "d0000000-0000-4000-8000-000000000002",
      "c0000000-0000-4000-8000-000000000001",
      2,
      false,
    );

    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from worksite_day_configurations where superseded_at is null
    `;
    expect(rows[0]?.count).toBe("1");
  });

  it("verbietet dieselbe Revisionsnummer zweimal je Tag", async () => {
    const engagement = await insertEngagement("b0000000-0000-4000-8000-000000000001");
    await insertDay("c0000000-0000-4000-8000-000000000001", engagement, "2026-09-07");
    await insertConfiguration(
      "d0000000-0000-4000-8000-000000000001",
      "c0000000-0000-4000-8000-000000000001",
      1,
      true,
    );

    const code = await sqlstateOf(() =>
      insertConfiguration(
        "d0000000-0000-4000-8000-000000000002",
        "c0000000-0000-4000-8000-000000000001",
        1,
        true,
      ),
    );

    expect(code).toBe("23505");
  });

  it("weist ein Ende vor dem Start ab", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into engagements (org_id, worksite_id, title, start_date, end_date, colour_key, initial_configuration)
        values (${ORG}, ${WORKSITE}, 'Rueckwaerts', '2026-09-18', '2026-09-07', 'moos', '{}'::jsonb)
      `,
    );

    expect(code).toBe("23514");
  });

  it("weist ein offenes Ende ohne Planungshorizont ab", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into engagements (org_id, worksite_id, title, start_date, colour_key, initial_configuration)
        values (${ORG}, ${WORKSITE}, 'Ohne Horizont', '2026-09-07', 'moos', '{}'::jsonb)
      `,
    );

    expect(code).toBe("23514");
  });

  it("akzeptiert ein offenes Ende MIT Planungshorizont", async () => {
    const rows = await sql<{ id: string }[]>`
      insert into engagements (org_id, worksite_id, title, start_date, planning_horizon_date, colour_key, initial_configuration)
      values (${ORG}, ${WORKSITE}, 'Mit Horizont', '2026-09-07', '2026-12-31', 'petrol', '{}'::jsonb)
      returning id
    `;

    expect(rows).toHaveLength(1);
  });

  it("weist einen unbekannten Farbschluessel ab", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into engagements (org_id, worksite_id, title, start_date, end_date, colour_key, initial_configuration)
        values (${ORG}, ${WORKSITE}, 'Falsche Farbe', '2026-09-07', '2026-09-18', 'neonpink', '{}'::jsonb)
      `,
    );

    expect(code).toBe("23514");
  });

  it("weist eine unbekannte Revisionsherkunft ab", async () => {
    const engagement = await insertEngagement("b0000000-0000-4000-8000-000000000001");
    await insertDay("c0000000-0000-4000-8000-000000000001", engagement, "2026-09-07");

    const code = await sqlstateOf(
      () => sql`
        insert into worksite_day_configurations (org_id, worksite_day_id, revision_no, origin)
        values (${ORG}, 'c0000000-0000-4000-8000-000000000001', 1, 'zauberei')
      `,
    );

    expect(code).toBe("23514");
  });

  it("verbietet doppelte Team- und Ressourcenzuordnungen je Konfiguration", async () => {
    const engagement = await insertEngagement("b0000000-0000-4000-8000-000000000001");
    await insertDay("c0000000-0000-4000-8000-000000000001", engagement, "2026-09-07");
    await insertConfiguration(
      "d0000000-0000-4000-8000-000000000001",
      "c0000000-0000-4000-8000-000000000001",
      1,
      false,
    );
    const config = "d0000000-0000-4000-8000-000000000001";

    await sql`insert into day_team_members (org_id, configuration_id, employee_id) values (${ORG}, ${config}, ${EMPLOYEE})`;
    const teamCode = await sqlstateOf(
      () =>
        sql`insert into day_team_members (org_id, configuration_id, employee_id) values (${ORG}, ${config}, ${EMPLOYEE})`,
    );
    expect(teamCode).toBe("23505");

    await sql`insert into day_resource_allocations (org_id, configuration_id, resource_id) values (${ORG}, ${config}, ${RESOURCE})`;
    const resourceCode = await sqlstateOf(
      () =>
        sql`insert into day_resource_allocations (org_id, configuration_id, resource_id) values (${ORG}, ${config}, ${RESOURCE})`,
    );
    expect(resourceCode).toBe("23505");
  });

  it("verlangt einen Einsatz-Elternkontext fuer jeden Baustellentag", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into worksite_days (org_id, worksite_id, local_date)
        values (${ORG}, ${WORKSITE}, '2026-09-07')
      `,
    );

    expect(code).toBe("23502");
  });
});
