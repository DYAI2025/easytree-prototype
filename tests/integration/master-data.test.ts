import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "../../src/server/db/client";
import { createCustomer } from "../../src/server/commands/create-customer";
import { createWorksite } from "../../src/server/commands/create-worksite";
import { updateWorksite } from "../../src/server/commands/update-worksite";
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

describe("master-data: Baustelle", () => {
  it("legt eine Baustelle unter einem Auftraggeber an", async () => {
    const customer = await createCustomer(deps, { name: "Arboscus Demo" });

    const worksite = await createWorksite(deps, {
      customerId: customer.id,
      name: "Parkanlage Nord",
      addressLine: "Musterweg 1",
      postalCode: "10115",
      city: "Berlin",
    });

    expect(worksite.name).toBe("Parkanlage Nord");
    expect(worksite.customerId).toBe(customer.id);
    expect(worksite.lat).toBeNull();

    const rows = await handle.sql<
      { org_id: string }[]
    >`select org_id from worksites where id = ${worksite.id}`;
    expect(rows[0]?.org_id).toBe(tenant.orgId);
  });

  it("meldet NOT_FOUND fuer einen unbekannten Auftraggeber", async () => {
    await expect(
      createWorksite(deps, {
        customerId: "b0000000-0000-4000-8000-00000000dead",
        name: "Ins Leere",
        addressLine: "Musterweg 1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const rows = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from worksites`;
    expect(rows[0]?.count).toBe("0");
  });

  it("weist eine halbe Koordinate mit VALIDATION_FAILED ab", async () => {
    const customer = await createCustomer(deps, { name: "Arboscus Demo" });

    await expect(
      createWorksite(deps, {
        customerId: customer.id,
        name: "Halbe Koordinate",
        addressLine: "Musterweg 1",
        lat: 52.52,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await expect(
      createWorksite(deps, {
        customerId: customer.id,
        name: "Halbe Koordinate",
        addressLine: "Musterweg 1",
        lng: 13.405,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("nimmt ein vollstaendiges Koordinatenpaar mit Quelle an", async () => {
    const customer = await createCustomer(deps, { name: "Arboscus Demo" });

    const worksite = await createWorksite(deps, {
      customerId: customer.id,
      name: "Mit Koordinaten",
      addressLine: "Musterweg 2",
      lat: 52.52,
      lng: 13.405,
      geocodeSource: "manual",
    });

    expect(worksite.lat).toBe(52.52);
    expect(worksite.lng).toBe(13.405);
    expect(worksite.geocodeSource).toBe("manual");
  });

  it("aendert eine Baustelle und laesst nicht genannte Felder unberuehrt", async () => {
    const customer = await createCustomer(deps, { name: "Arboscus Demo" });
    const worksite = await createWorksite(deps, {
      customerId: customer.id,
      name: "Alt",
      addressLine: "Musterweg 1",
      city: "Berlin",
    });

    const updated = await updateWorksite(deps, { id: worksite.id, name: "Neu" });

    expect(updated.name).toBe("Neu");
    expect(updated.city).toBe("Berlin");
  });

  it("haengt keine Baustelle an einen Auftraggeber eines FREMDEN Mandanten", async () => {
    // Zweiter Mandant mit eigenem Auftraggeber. Die ID ist gueltig und
    // existiert - sie gehoert nur nicht uns.
    const fremdeOrg = "b0000000-0000-4000-8000-0000000000aa";
    const fremderKunde = "b0000000-0000-4000-8000-0000000000bb";
    await handle.sql`insert into organizations (id, name, time_zone) values (${fremdeOrg}, 'Fremdbetrieb', 'Europe/Berlin')`;
    await handle.sql`insert into customers (id, org_id, name) values (${fremderKunde}, ${fremdeOrg}, 'Fremdkunde')`;

    await expect(
      createWorksite(deps, {
        customerId: fremderKunde,
        name: "Uebergriff",
        addressLine: "Musterweg 1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const rows = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from worksites`;
    expect(rows[0]?.count).toBe("0");
  });

  it("nimmt kein orgId aus der Eingabe entgegen", async () => {
    const customer = await createCustomer(deps, { name: "Arboscus Demo" });
    const fremd = "b0000000-0000-4000-8000-00000000ffff";

    const worksite = await createWorksite(deps, {
      customerId: customer.id,
      name: "Fremdversuch",
      addressLine: "Musterweg 1",
      orgId: fremd,
    } as Parameters<typeof createWorksite>[1]);

    const rows = await handle.sql<
      { org_id: string }[]
    >`select org_id from worksites where id = ${worksite.id}`;
    expect(rows[0]?.org_id).toBe(tenant.orgId);
  });
});
