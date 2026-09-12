import { sql } from "drizzle-orm";

import { getDb } from "../../../server/db/connection";
import { defineRoute } from "../../../server/http/handler";

/** Bereitschaftsprobe inklusive echtem Datenbank-Ping (REQ-O-001). */
export const GET = defineRoute({
  handler: async () => {
    await getDb().db.execute(sql`select 1`);

    return { status: "ok", db: "ok" };
  },
});
