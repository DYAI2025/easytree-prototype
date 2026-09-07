import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "../../src/server/db/client";
import { createCustomer } from "../../src/server/commands/create-customer";
import { updateCustomer } from "../../src/server/commands/update-customer";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
const tenant = resolveTenant();
const deps = { db: handle.db, tenant, correlationId: "corr-test" };

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;
});

describe("master-data", () => {
  it("legt einen Auftraggeber an und bindet ihn an den Mandanten", async () => {
    const created = await createCustomer(deps, { name: "Arboscus Demo", contact: "Frau Mueller" });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.name).toBe("Arboscus Demo");
    expect(created.active).toBe(true);

    const rows = await handle.sql<
      { org_id: string }[]
    >`select org_id from customers where id = ${created.id}`;
    expect(rows[0]?.org_id).toBe(tenant.orgId);
  });

  it("schreibt einen Audit-Eintrag beim Anlegen", async () => {
    const created = await createCustomer(deps, { name: "Mit Audit" });

    const rows = await handle.sql<
      { operation: string; subject_id: string; correlation_id: string }[]
    >`
      select operation, subject_id, correlation_id from audit_events
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.operation).toBe("create_customer");
    expect(rows[0]?.subject_id).toBe(created.id);
    expect(rows[0]?.correlation_id).toBe("corr-test");
  });

  it("weist einen leeren Namen mit VALIDATION_FAILED ab", async () => {
    await expect(createCustomer(deps, { name: "   " })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    const rows = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from customers`;
    expect(rows[0]?.count).toBe("0");
  });

  it("nimmt kein orgId aus der Eingabe entgegen", async () => {
    const fremd = "b0000000-0000-4000-8000-00000000ffff";

    // Das Feld existiert im Schema nicht; Zod verwirft unbekannte Schluessel
    // still, der Mandant kommt ausschliesslich aus resolveTenant().
    const created = await createCustomer(deps, {
      name: "Fremdversuch",
      orgId: fremd,
    } as Parameters<typeof createCustomer>[1]);

    const rows = await handle.sql<
      { org_id: string }[]
    >`select org_id from customers where id = ${created.id}`;
    expect(rows[0]?.org_id).toBe(tenant.orgId);
    expect(rows[0]?.org_id).not.toBe(fremd);
  });

  it("aendert einen Auftraggeber und laesst nicht genannte Felder unberuehrt", async () => {
    const created = await createCustomer(deps, { name: "Alt", contact: "Herr Schmidt" });

    const updated = await updateCustomer(deps, { id: created.id, name: "Neu" });

    expect(updated.name).toBe("Neu");
    expect(updated.contact).toBe("Herr Schmidt");
  });

  it("meldet NOT_FOUND fuer einen unbekannten Auftraggeber", async () => {
    await expect(
      updateCustomer(deps, { id: "b0000000-0000-4000-8000-00000000dead", name: "X" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
