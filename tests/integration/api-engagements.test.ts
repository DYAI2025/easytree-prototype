import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  GET as engagementDetailRoute,
  PATCH as engagementPatchRoute,
} from "../../src/app/api/einsaetze/[id]/route";
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

/* ------------------------------------------------------------------ *
 * PATCH /api/einsaetze/[id] - Einsatzbearbeitung ueber HTTP
 * ------------------------------------------------------------------ */

const patch = (url: string, body: unknown) =>
  new Request(url, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

/** Legt den Einsatz an und liefert Id und aktuellen Versionstoken. */
async function angelegtMitToken(): Promise<{ id: string; token: string }> {
  const angelegt = await (
    await createEngagementRoute(
      post("http://localhost/api/einsaetze", einsatz(), { "Idempotency-Key": "key-patch" }),
    )
  ).json();

  const detail = await (
    await engagementDetailRoute(
      new Request(`http://localhost/api/einsaetze/${angelegt.engagementId}`),
      { params: Promise.resolve({ id: angelegt.engagementId }) },
    )
  ).json();

  return { id: angelegt.engagementId, token: detail.updatedAt };
}

const sendePatch = (id: string, body: unknown) =>
  engagementPatchRoute(patch(`http://localhost/api/einsaetze/${id}`, body), {
    params: Promise.resolve({ id }),
  });

describe("api-engagements: PATCH", () => {
  it("liefert im Detail einen mikrosekundengenauen Versionstoken", async () => {
    const { token } = await angelegtMitToken();

    // Die Millisekundenform waere fuer die Vorbedingung zu grob (REQ-E04).
    expect(token).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  });

  it("aendert Titel und Farbe und liefert den neuen Token", async () => {
    const { id, token } = await angelegtMitToken();

    const response = await sendePatch(id, {
      expectedUpdatedAt: token,
      title: "Herbstschnitt verschoben",
      colourKey: "ocker",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.engagementId).toBe(id);
    expect(body.addedWorksiteDayIds).toEqual([]);
    expect(body.updatedAt).not.toBe(token);

    const detail = await (
      await engagementDetailRoute(new Request(`http://localhost/api/einsaetze/${id}`), {
        params: Promise.resolve({ id }),
      })
    ).json();

    expect(detail.title).toBe("Herbstschnitt verschoben");
    expect(detail.colourKey).toBe("ocker");
    expect(detail.updatedAt).toBe(body.updatedAt);
  });

  it("verlaengert nach vorn und ergaenzt nur die neuen Werktage", async () => {
    const { id, token } = await angelegtMitToken();

    const response = await sendePatch(id, {
      expectedUpdatedAt: token,
      endDate: "2026-09-25",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    // 19./20.09. sind Wochenende, 21.-25.09. sind die fuenf neuen Werktage.
    expect(body.addedLocalDates).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
    expect(await zaehle("worksite_days")).toBe("15");
    expect(await zaehle("engagements")).toBe("1");
  });

  it("meldet 409 bei veraltetem Stand und schreibt nichts", async () => {
    const { id, token } = await angelegtMitToken();

    await sendePatch(id, { expectedUpdatedAt: token, title: "Erster" });

    const response = await sendePatch(id, { expectedUpdatedAt: token, title: "Zweiter" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.type).toBe("urn:easytree-prototype:problem:ENGAGEMENT_VERSION_CONFLICT");

    const detail = await (
      await engagementDetailRoute(new Request(`http://localhost/api/einsaetze/${id}`), {
        params: Promise.resolve({ id }),
      })
    ).json();

    expect(detail.title).toBe("Erster");
  });

  it("meldet 422 bei einer Verkuerzung und laesst alle Tage stehen", async () => {
    const { id, token } = await angelegtMitToken();

    const response = await sendePatch(id, { expectedUpdatedAt: token, endDate: "2026-09-11" });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.type).toBe("urn:easytree-prototype:problem:ENGAGEMENT_SHRINK_NOT_ALLOWED");
    expect(await zaehle("worksite_days")).toBe("10");
  });

  it("meldet 422, wenn ein Planungshorizont am Einsatz MIT Ende gesetzt wird", async () => {
    const { id, token } = await angelegtMitToken();

    const response = await sendePatch(id, {
      expectedUpdatedAt: token,
      planningHorizonDate: "2026-09-25",
    });

    expect(response.status).toBe(422);
    expect((await response.json()).type).toBe(
      "urn:easytree-prototype:problem:ENGAGEMENT_PERIOD_MODE_MISMATCH",
    );
  });

  it("meldet 400, wenn die Vorbedingung ganz fehlt", async () => {
    const { id } = await angelegtMitToken();

    const response = await sendePatch(id, { title: "Ohne Vorbedingung" });

    expect(response.status).toBe(400);
    expect((await response.json()).type).toBe("urn:easytree-prototype:problem:VALIDATION_FAILED");
  });

  it("meldet 404 fuer einen unbekannten Einsatz", async () => {
    const response = await sendePatch("b0000000-0000-4000-8000-00000000dead", {
      expectedUpdatedAt: "2026-09-07T00:00:00.000000Z",
      title: "Ins Leere",
    });

    expect(response.status).toBe(404);
  });
});
