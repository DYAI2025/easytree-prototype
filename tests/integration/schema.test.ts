import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "../../src/server/db/client";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 4 });
const sql = handle.sql;

const ORG = "a0000000-0000-4000-8000-000000000001";
const CUSTOMER = "a0000000-0000-4000-8000-000000000002";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await sql`truncate table organizations restart identity cascade`;
  await sql`insert into organizations (id, name, time_zone) values (${ORG}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;
  await sql`insert into customers (id, org_id, name) values (${CUSTOMER}, ${ORG}, 'Arboscus Demo')`;
});

/** Gibt den PostgreSQL-SQLSTATE der erwarteten Verletzung zurueck. */
async function sqlstateOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as { code?: string }).code ?? "KEIN_CODE";
  }

  throw new Error("Erwartet wurde eine Constraint-Verletzung, es gab aber keine.");
}

describe("schema", () => {
  it("legt die Stammdatentabellen an", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name
    `;
    const names = rows.map((row) => row.table_name);

    expect(names).toEqual(
      expect.arrayContaining(["organizations", "customers", "worksites", "employees", "resources"]),
    );
  });

  it("weist eine Baustelle mit lat ohne lng ab", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into worksites (org_id, customer_id, name, address_line, lat)
        values (${ORG}, ${CUSTOMER}, 'Halbe Koordinate', 'Musterweg 1', 52.52)
      `,
    );

    expect(code).toBe("23514");
  });

  it("weist eine Baustelle mit lng ohne lat ab", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into worksites (org_id, customer_id, name, address_line, lng)
        values (${ORG}, ${CUSTOMER}, 'Halbe Koordinate', 'Musterweg 1', 13.405)
      `,
    );

    expect(code).toBe("23514");
  });

  it("akzeptiert eine Baustelle mit vollstaendigem Koordinatenpaar", async () => {
    const rows = await sql<{ id: string }[]>`
      insert into worksites (org_id, customer_id, name, address_line, lat, lng, geocode_source)
      values (${ORG}, ${CUSTOMER}, 'Ganze Koordinate', 'Musterweg 2', 52.52, 13.405, 'manual')
      returning id
    `;

    expect(rows).toHaveLength(1);
  });

  it("weist einen negativen Tagessatz bei Mitarbeitenden ab", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into employees (org_id, display_name, daily_cost_minor_units)
        values (${ORG}, 'Negativ', -1)
      `,
    );

    expect(code).toBe("23514");
  });

  it("weist einen negativen Tagessatz bei Ressourcen ab", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into resources (org_id, kind, name, daily_cost_minor_units)
        values (${ORG}, 'vehicle', 'Negativ', -1)
      `,
    );

    expect(code).toBe("23514");
  });

  it("weist einen unbekannten Ressourcentyp ab", async () => {
    const code = await sqlstateOf(
      () =>
        sql`insert into resources (org_id, kind, name) values (${ORG}, 'raumschiff', 'Falscher Typ')`,
    );

    expect(code).toBe("23514");
  });

  it("weist einen leeren Auftraggebernamen ab", async () => {
    const code = await sqlstateOf(
      () => sql`insert into customers (org_id, name) values (${ORG}, '   ')`,
    );

    expect(code).toBe("23514");
  });

  it("laesst einen fehlenden Tagessatz ausdruecklich zu (NULL = fehlt, nicht 0)", async () => {
    const rows = await sql<{ daily_cost_minor_units: string | null }[]>`
      insert into employees (org_id, display_name) values (${ORG}, 'Ohne Satz')
      returning daily_cost_minor_units
    `;

    expect(rows[0]?.daily_cost_minor_units).toBeNull();
  });
});
