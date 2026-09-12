import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "../../src/server/db/client";
import { listEmployees, listResources } from "../../src/server/queries/master-data";
import { resolveTenant } from "../../src/server/tenant/tenant-context";
import { employees } from "../../src/server/db/schema";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 2 });
const ORG = "a0000000-0000-4000-8000-000000000001";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${ORG}, 'Demo', 'Europe/Berlin')`;
});

describe("money-typing", () => {
  it("liefert die Geldspalte als bigint, nicht als number", async () => {
    // REQ-D-004: der Drizzle-Default waere number und verloere ab 2^53 still
    // an Genauigkeit. Dieser Test haelt fest, was tatsaechlich ankommt.
    await handle.sql`insert into employees (org_id, display_name, daily_cost_minor_units) values (${ORG}, 'Anna', 32000)`;

    const rows = await handle.db
      .select({ wert: employees.dailyCostMinorUnits })
      .from(employees)
      .where(eq(employees.orgId, ORG));

    expect(typeof rows[0]?.wert).toBe("bigint");
    expect(rows[0]?.wert).toBe(32_000n);
  });

  it("haelt Werte oberhalb von 2^53 exakt", async () => {
    const gross = "9007199254740993"; // 2^53 + 1
    await handle.sql`insert into employees (org_id, display_name, daily_cost_minor_units) values (${ORG}, 'Gross', ${gross})`;

    const rows = await handle.db
      .select({ wert: employees.dailyCostMinorUnits })
      .from(employees)
      .where(eq(employees.orgId, ORG));

    expect(rows[0]?.wert?.toString()).toBe(gross);
  });

  it("wirft, wenn ein bigint ungewandelt in JSON geraet", async () => {
    await handle.sql`insert into employees (org_id, display_name, daily_cost_minor_units) values (${ORG}, 'Anna', 32000)`;

    const rows = await handle.db
      .select({ wert: employees.dailyCostMinorUnits })
      .from(employees)
      .where(eq(employees.orgId, ORG));

    // Genau deshalb konvertieren die Queries an der Grenze zu Dezimalstrings.
    expect(() => JSON.stringify(rows[0])).toThrow(TypeError);
  });

  it("gibt die Geldspalte aus den Listenabfragen als Dezimalstring heraus", async () => {
    // Die Grenze konvertiert: sonst waere die Antwort nicht JSON-serialisierbar.
    await handle.sql`insert into employees (org_id, display_name, daily_cost_minor_units) values (${ORG}, 'Anna', 32000)`;
    await handle.sql`insert into resources (org_id, kind, name, daily_cost_minor_units) values (${ORG}, 'machine', 'Hebebuehne', 45000)`;

    const deps = { db: handle.db, tenant: resolveTenant() };
    const personen = await listEmployees(deps);
    const geraete = await listResources(deps);

    expect(typeof personen[0]?.dailyCostMinorUnits).toBe("string");
    expect(personen[0]?.dailyCostMinorUnits).toBe("32000");
    expect(typeof geraete[0]?.dailyCostMinorUnits).toBe("string");

    // Und damit ist die Antwort serialisierbar.
    expect(() => JSON.stringify({ items: personen })).not.toThrow();
  });
});
