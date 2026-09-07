import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as listCustomersRoute,
  POST as createCustomerRoute,
} from "../../src/app/api/auftraggeber/route";
import { PATCH as patchCustomerRoute } from "../../src/app/api/auftraggeber/[id]/route";
import { createDb } from "../../src/server/db/client";
import { setDbForTests } from "../../src/server/db/connection";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 4 });
setDbForTests(handle);
const tenant = resolveTenant();

afterAll(async () => {
  setDbForTests(undefined);
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;
});

const post = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const patch = (url: string, body: unknown) =>
  new Request(url, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("api-master-data: Auftraggeber", () => {
  it("legt per POST an und liefert 201 mit ID", async () => {
    const response = await createCustomerRoute(
      post("http://localhost/api/auftraggeber", { name: "Stadtwerke Musterstadt" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.name).toBe("Stadtwerke Musterstadt");
  });

  it("listet die angelegte Entitaet per GET", async () => {
    await createCustomerRoute(post("http://localhost/api/auftraggeber", { name: "Stadtwerke" }));

    const response = await listCustomersRoute(new Request("http://localhost/api/auftraggeber"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe("Stadtwerke");
  });

  it("aendert per PATCH", async () => {
    const angelegt = await (
      await createCustomerRoute(post("http://localhost/api/auftraggeber", { name: "Alt" }))
    ).json();

    const response = await patchCustomerRoute(
      patch(`http://localhost/api/auftraggeber/${angelegt.id}`, { name: "Neu" }),
      { params: Promise.resolve({ id: angelegt.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.name).toBe("Neu");
  });

  it("weist einen ungueltigen Body mit 400 und Problem-JSON ab", async () => {
    const response = await createCustomerRoute(
      post("http://localhost/api/auftraggeber", { name: "  " }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(body.type).toBe("urn:easytree-prototype:problem:VALIDATION_FAILED");
    expect(body.meta.issues[0].field).toBe("name");
  });

  it("meldet 404 fuer eine unbekannte ID", async () => {
    const response = await patchCustomerRoute(
      patch("http://localhost/api/auftraggeber/b0000000-0000-4000-8000-00000000dead", {
        name: "X",
      }),
      { params: Promise.resolve({ id: "b0000000-0000-4000-8000-00000000dead" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.type).toBe("urn:easytree-prototype:problem:NOT_FOUND");
  });
});
