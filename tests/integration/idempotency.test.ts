import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDb, withTransaction } from "../../src/server/db/client";
import {
  fingerprintOf,
  findIdempotencyRecord,
  lockIdempotencyKey,
  rememberIdempotencyRecord,
} from "../../src/server/idempotency/idempotency-store";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
const ORG = "a0000000-0000-4000-8000-000000000001";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${ORG}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;
});

describe("idempotency", () => {
  it("bildet denselben Fingerprint unabhaengig von der Schluesselreihenfolge", () => {
    expect(fingerprintOf({ a: 1, b: [2, 3] })).toBe(fingerprintOf({ b: [2, 3], a: 1 }));
    expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }));
    expect(fingerprintOf({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("liefert die gespeicherte Erstantwort bei gleichem Key und Fingerprint zurueck", async () => {
    const fingerprint = fingerprintOf({ title: "Rueckschnitt" });

    await withTransaction(handle.db, async (tx) => {
      await rememberIdempotencyRecord(tx, {
        orgId: ORG,
        operation: "create_engagement",
        key: "key-1",
        fingerprint,
        status: 201,
        body: { engagementId: "eng-1", worksiteDayIds: ["wd-1"] },
      });
    });

    const found = await withTransaction(handle.db, (tx) =>
      findIdempotencyRecord(tx, {
        orgId: ORG,
        operation: "create_engagement",
        key: "key-1",
        fingerprint,
      }),
    );

    expect(found).toEqual({
      status: 201,
      body: { engagementId: "eng-1", worksiteDayIds: ["wd-1"] },
    });
  });

  it("meldet einen Konflikt, wenn derselbe Key mit anderem Fingerprint kommt", async () => {
    await withTransaction(handle.db, (tx) =>
      rememberIdempotencyRecord(tx, {
        orgId: ORG,
        operation: "create_engagement",
        key: "key-1",
        fingerprint: fingerprintOf({ title: "A" }),
        status: 201,
        body: {},
      }),
    );

    await expect(
      withTransaction(handle.db, (tx) =>
        findIdempotencyRecord(tx, {
          orgId: ORG,
          operation: "create_engagement",
          key: "key-1",
          fingerprint: fingerprintOf({ title: "B" }),
        }),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("laesst denselben Key bei einer anderen Operation unberuehrt", async () => {
    const fingerprint = fingerprintOf({ x: 1 });

    await withTransaction(handle.db, (tx) =>
      rememberIdempotencyRecord(tx, {
        orgId: ORG,
        operation: "create_engagement",
        key: "key-1",
        fingerprint,
        status: 201,
        body: { a: 1 },
      }),
    );

    const andereOperation = await withTransaction(handle.db, (tx) =>
      findIdempotencyRecord(tx, {
        orgId: ORG,
        operation: "update_worksite_day",
        key: "key-1",
        fingerprint,
      }),
    );

    expect(andereOperation).toBeNull();
  });

  it("serialisiert zwei gleichzeitige Zugriffe auf denselben Key", async () => {
    const reihenfolge: string[] = [];
    let ersteHatGesperrt: () => void = () => {};
    const ersteSperreSteht = new Promise<void>((resolve) => {
      ersteHatGesperrt = resolve;
    });

    const ersteTransaktion = withTransaction(handle.db, async (tx) => {
      await lockIdempotencyKey(tx, "create_engagement", "key-parallel");
      reihenfolge.push("A:gesperrt");
      ersteHatGesperrt();
      // Haelt die Sperre bewusst, bis die zweite Transaktion es versucht hat.
      await new Promise((resolve) => setTimeout(resolve, 300));
      reihenfolge.push("A:commit");
    });

    const zweiteTransaktion = (async () => {
      await ersteSperreSteht;
      await new Promise((resolve) => setTimeout(resolve, 50));
      reihenfolge.push("B:versucht");
      await withTransaction(handle.db, async (tx) => {
        await lockIdempotencyKey(tx, "create_engagement", "key-parallel");
        reihenfolge.push("B:gesperrt");
      });
    })();

    await Promise.all([ersteTransaktion, zweiteTransaktion]);

    // Der Beweis: B bekommt die Sperre erst NACH dem Commit von A.
    expect(reihenfolge).toEqual(["A:gesperrt", "B:versucht", "A:commit", "B:gesperrt"]);
  });

  it("blockiert unterschiedliche Keys NICHT gegeneinander", async () => {
    const reihenfolge: string[] = [];

    await Promise.all([
      withTransaction(handle.db, async (tx) => {
        await lockIdempotencyKey(tx, "create_engagement", "key-a");
        await new Promise((resolve) => setTimeout(resolve, 200));
        reihenfolge.push("A:commit");
      }),
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await withTransaction(handle.db, async (tx) => {
          await lockIdempotencyKey(tx, "create_engagement", "key-b");
          reihenfolge.push("B:gesperrt");
        });
      })(),
    ]);

    expect(reihenfolge).toEqual(["B:gesperrt", "A:commit"]);
  });
});
