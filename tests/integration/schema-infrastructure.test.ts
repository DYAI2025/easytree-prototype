import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "../../src/server/db/client";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 4 });
const sql = handle.sql;

const ORG = "a0000000-0000-4000-8000-000000000001";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await sql`truncate table organizations restart identity cascade`;
  await sql`insert into organizations (id, name, time_zone) values (${ORG}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;
});

async function sqlstateOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as { code?: string }).code ?? "KEIN_CODE";
  }

  throw new Error("Erwartet wurde eine Constraint-Verletzung, es gab aber keine.");
}

describe("schema-infrastructure", () => {
  it("legt die Infrastrukturtabellen an", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public'
    `;

    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining(["idempotency_records", "audit_events"]),
    );
  });

  it("laesst denselben Idempotency-Key je Operation nur einmal zu", async () => {
    await sql`
      insert into idempotency_records (org_id, operation, idempotency_key, request_fingerprint, response_status, response_body)
      values (${ORG}, 'create_engagement', 'key-1', 'fp-a', 201, '{"engagementId":"x"}'::jsonb)
    `;

    const code = await sqlstateOf(
      () => sql`
        insert into idempotency_records (org_id, operation, idempotency_key, request_fingerprint, response_status, response_body)
        values (${ORG}, 'create_engagement', 'key-1', 'fp-b', 201, '{}'::jsonb)
      `,
    );

    expect(code).toBe("23505");
  });

  it("erlaubt denselben Key bei einer ANDEREN Operation", async () => {
    await sql`
      insert into idempotency_records (org_id, operation, idempotency_key, request_fingerprint, response_status, response_body)
      values (${ORG}, 'create_engagement', 'key-1', 'fp-a', 201, '{}'::jsonb)
    `;
    await sql`
      insert into idempotency_records (org_id, operation, idempotency_key, request_fingerprint, response_status, response_body)
      values (${ORG}, 'update_worksite_day', 'key-1', 'fp-a', 200, '{}'::jsonb)
    `;

    const rows = await sql<
      { count: string }[]
    >`select count(*)::text as count from idempotency_records`;
    expect(rows[0]?.count).toBe("2");
  });

  it("weist einen unplausiblen HTTP-Status im Idempotenz-Eintrag ab", async () => {
    const code = await sqlstateOf(
      () => sql`
        insert into idempotency_records (org_id, operation, idempotency_key, request_fingerprint, response_status, response_body)
        values (${ORG}, 'create_engagement', 'key-2', 'fp-a', 99, '{}'::jsonb)
      `,
    );

    expect(code).toBe("23514");
  });

  it("schreibt Audit-Ereignisse mit Akteur, Operation und Correlation-ID", async () => {
    const rows = await sql<{ actor: string; occurred_at: string }[]>`
      insert into audit_events (org_id, actor, operation, subject_id, payload, correlation_id)
      values (${ORG}, 'demo-admin', 'create_engagement', ${ORG}, '{"days":12}'::jsonb, 'corr-1')
      returning actor, occurred_at
    `;

    expect(rows[0]?.actor).toBe("demo-admin");
    // postgres.js liefert timestamptz hier als String, nicht als Date-Objekt.
    expect(Number.isNaN(Date.parse(rows[0]?.occurred_at ?? ""))).toBe(false);
  });

  it("verlangt einen Akteur und eine Operation im Audit-Log", async () => {
    const ohneAkteur = await sqlstateOf(
      () => sql`insert into audit_events (org_id, operation) values (${ORG}, 'x')`,
    );
    expect(ohneAkteur).toBe("23502");

    const ohneOperation = await sqlstateOf(
      () => sql`insert into audit_events (org_id, actor) values (${ORG}, 'demo-admin')`,
    );
    expect(ohneOperation).toBe("23502");
  });

  it("haelt genau eine Migrationsdatei vor", async () => {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync("drizzle").filter((name) => name.endsWith(".sql"));

    expect(files).toEqual(["0000_initial.sql"]);
  });
});
