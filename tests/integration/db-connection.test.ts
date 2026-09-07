import { afterAll, describe, expect, it } from "vitest";

import { createDb } from "../../src/server/db/client";

const handle = createDb(process.env.DATABASE_URL_TEST as string);

afterAll(async () => {
  await handle.close();
});

describe("db-connection", () => {
  it("beantwortet select 1", async () => {
    const rows = await handle.sql`select 1 as eins`;

    expect(rows[0]?.eins).toBe(1);
  });
});
