import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { GET as engagementDetailRoute } from "../../src/app/api/einsaetze/[id]/route";
import { POST as createEngagementRoute } from "../../src/app/api/einsaetze/route";
import { POST as createCustomerRoute } from "../../src/app/api/auftraggeber/route";
import { POST as createWorksiteRoute } from "../../src/app/api/baustellen/route";
import { POST as createEmployeeRoute } from "../../src/app/api/mitarbeitende/route";
import { createDb } from "../../src/server/db/client";
import { setDbForTests } from "../../src/server/db/connection";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
setDbForTests(handle);
const tenant = resolveTenant();

let worksiteA = "";
let worksiteB = "";
let anna = "";

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
  // Die Routen bauen ihre Uhr aus der Env; ohne Anker liefe der Zeitraum
  // 2026-09 irgendwann in ENGAGEMENT_START_IN_PAST.
  process.env.EASYTREE_FIXED_TODAY = "2026-09-07";

  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;

  const kunde = await (
    await createCustomerRoute(post("http://localhost/api/auftraggeber", { name: "Stadtwerke" }))
  ).json();
  worksiteA = (
    await (
      await createWorksiteRoute(
        post("http://localhost/api/baustellen", {
          customerId: kunde.id,
          name: "Parkanlage Nordring",
          addressLine: "Nordring 12",
        }),
      )
    ).json()
  ).id;
  worksiteB = (
    await (
      await createWorksiteRoute(
        post("http://localhost/api/baustellen", {
          customerId: kunde.id,
          name: "Allee am Wasserwerk",
          addressLine: "Zeppelinstrasse 140",
        }),
      )
    ).json()
  ).id;
  anna = (
    await (
      await createEmployeeRoute(
        post("http://localhost/api/mitarbeitende", { displayName: "Anna Bergmann" }),
      )
    ).json()
  ).id;
});

const einsatz = (overrides: Record<string, unknown> = {}) => ({
  worksiteId: worksiteA,
  title: "Baumpflege Herbstschnitt",
  startDate: "2026-09-07",
  endDate: "2026-09-18",
  colourKey: "moos",
  employeeIds: [anna],
  resourceIds: [],
  ...overrides,
});

const zaehle = async (tabelle: "engagements" | "worksite_days") =>
  (
    await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from ${handle.sql(tabelle)}`
  )[0]?.count;

describe("api-engagements", () => {
  it("weist eine Anfrage ohne Idempotency-Key mit 400 ab", async () => {
    const response = await createEngagementRoute(post("http://localhost/api/einsaetze", einsatz()));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.type).toBe("urn:easytree-prototype:problem:MISSING_IDEMPOTENCY_KEY");
    expect(await zaehle("engagements")).toBe("0");
  });

  it("legt mit Key an und liefert 201 mit engagementId und worksiteDayIds", async () => {
    const response = await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz(), { "Idempotency-Key": "key-1" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.engagementId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.worksiteDayIds).toHaveLength(10);
    expect(await zaehle("worksite_days")).toBe("10");
  });

  it("liefert bei Wiederholung denselben Body ohne zweite Mutation", async () => {
    const erste = await (
      await createEngagementRoute(
        post("http://localhost/api/einsaetze", einsatz(), { "Idempotency-Key": "key-1" }),
      )
    ).json();

    const zweiteResponse = await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz(), { "Idempotency-Key": "key-1" }),
    );
    const zweite = await zweiteResponse.json();

    expect(zweiteResponse.status).toBe(201);
    expect(zweite).toEqual(erste);
    expect(await zaehle("engagements")).toBe("1");
    expect(await zaehle("worksite_days")).toBe("10");
  });

  it("meldet 409, wenn derselbe Key mit anderem Payload kommt", async () => {
    await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz(), { "Idempotency-Key": "key-1" }),
    );

    const response = await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz({ title: "Anderer Titel" }), {
        "Idempotency-Key": "key-1",
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).type).toBe(
      "urn:easytree-prototype:problem:IDEMPOTENCY_KEY_REUSED",
    );
    expect(await zaehle("engagements")).toBe("1");
  });

  it("meldet 422 fuer ein Startdatum in der Vergangenheit", async () => {
    const response = await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz({ startDate: "2026-09-06" }), {
        "Idempotency-Key": "key-past",
      }),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).type).toBe(
      "urn:easytree-prototype:problem:ENGAGEMENT_START_IN_PAST",
    );
    expect(await zaehle("engagements")).toBe("0");
  });

  it("meldet 409 mit meta.conflictingDates bei einer Baustellentag-Kollision", async () => {
    await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz(), { "Idempotency-Key": "key-1" }),
    );

    const response = await createEngagementRoute(
      post(
        "http://localhost/api/einsaetze",
        einsatz({ title: "Zweiter", startDate: "2026-09-16", endDate: "2026-09-25" }),
        { "Idempotency-Key": "key-2" },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.type).toBe("urn:easytree-prototype:problem:WORKSITE_DAY_ALREADY_PLANNED");
    expect(body.meta.conflictingDates).toEqual(["2026-09-16", "2026-09-17", "2026-09-18"]);
    expect(await zaehle("engagements")).toBe("1");
  });

  it("erlaubt denselben Tag an einer anderen Baustelle", async () => {
    await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz(), { "Idempotency-Key": "key-1" }),
    );

    const response = await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz({ worksiteId: worksiteB }), {
        "Idempotency-Key": "key-2",
      }),
    );

    expect(response.status).toBe(201);
    expect(await zaehle("worksite_days")).toBe("20");
  });

  it("liefert das Einsatzdetail per GET", async () => {
    const angelegt = await (
      await createEngagementRoute(
        post("http://localhost/api/einsaetze", einsatz(), { "Idempotency-Key": "key-1" }),
      )
    ).json();

    const response = await engagementDetailRoute(
      new Request(`http://localhost/api/einsaetze/${angelegt.engagementId}`),
      { params: Promise.resolve({ id: angelegt.engagementId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.title).toBe("Baumpflege Herbstschnitt");
    expect(body.days).toHaveLength(10);
  });
});
