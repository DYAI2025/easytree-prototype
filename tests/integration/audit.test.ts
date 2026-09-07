import { execFileSync } from "node:child_process";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import * as auditModule from "../../src/server/audit/audit-log";
import { recordAudit } from "../../src/server/audit/audit-log";
import { createDb, withTransaction } from "../../src/server/db/client";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 4 });
const ORG = "a0000000-0000-4000-8000-000000000001";
const SUBJECT = "a0000000-0000-4000-8000-0000000000ff";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${ORG}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;
});

describe("audit", () => {
  it("schreibt einen Eintrag mit Akteur, Operation, Subjekt und Correlation-ID", async () => {
    await withTransaction(handle.db, (tx) =>
      recordAudit(tx, {
        orgId: ORG,
        actor: "demo-admin",
        operation: "create_engagement",
        subjectId: SUBJECT,
        payload: { worksiteDayIds: ["wd-1", "wd-2"] },
        correlationId: "corr-42",
      }),
    );

    const rows = await handle.sql<
      {
        actor: string;
        operation: string;
        subject_id: string;
        correlation_id: string;
        payload: unknown;
        occurred_at: string;
      }[]
    >`select actor, operation, subject_id, correlation_id, payload, occurred_at from audit_events`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor).toBe("demo-admin");
    expect(rows[0]?.operation).toBe("create_engagement");
    expect(rows[0]?.subject_id).toBe(SUBJECT);
    expect(rows[0]?.correlation_id).toBe("corr-42");
    expect(rows[0]?.payload).toEqual({ worksiteDayIds: ["wd-1", "wd-2"] });
    expect(Number.isNaN(Date.parse(rows[0]?.occurred_at ?? ""))).toBe(false);
  });

  it("rollt den Audit-Eintrag mit der Transaktion zurueck", async () => {
    await expect(
      withTransaction(handle.db, async (tx) => {
        await recordAudit(tx, {
          orgId: ORG,
          actor: "demo-admin",
          operation: "create_engagement",
          correlationId: "corr-rollback",
        });
        throw new Error("absichtlicher Abbruch");
      }),
    ).rejects.toThrow("absichtlicher Abbruch");

    const rows = await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from audit_events`;
    expect(rows[0]?.count).toBe("0");
  });

  it("bietet keinen Update- oder Delete-Pfad an", () => {
    const exportierteNamen = Object.keys(auditModule);

    expect(exportierteNamen).toEqual(["recordAudit"]);
    expect(exportierteNamen.some((name) => /update|delete|remove/i.test(name))).toBe(false);
  });

  it("kennt anwendungsweit kein update oder delete auf audit_events", () => {
    // git grep endet bei KEINEM Treffer mit Exit 1 - genau das wird erwartet.
    const suche = (muster: string): number => {
      try {
        execFileSync("git", ["grep", "-nE", muster, "--", "src"], { encoding: "utf8" });
        return 0;
      } catch (error) {
        return (error as { status?: number }).status ?? -1;
      }
    };

    expect(suche("update\\(auditEvents\\)")).toBe(1);
    expect(suche("delete\\(auditEvents\\)")).toBe(1);
  });
});
