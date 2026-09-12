import { afterAll, describe, expect, it } from "vitest";

import { GET } from "../../src/app/api/health/route";
import { createDb } from "../../src/server/db/client";
import { setDbForTests } from "../../src/server/db/connection";
import { CORRELATION_HEADER } from "../../src/server/http/correlation";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 2 });
setDbForTests(handle);

afterAll(async () => {
  setDbForTests(undefined);
  await handle.close();
});

describe("api-health", () => {
  it("meldet ok und pingt die Datenbank wirklich", async () => {
    const response = await GET(new Request("http://localhost/api/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("spiegelt die Correlation-ID", async () => {
    const response = await GET(
      new Request("http://localhost/api/health", {
        headers: { [CORRELATION_HEADER]: "corr-health" },
      }),
    );

    expect(response.headers.get(CORRELATION_HEADER)).toBe("corr-health");
  });
});
