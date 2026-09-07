import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { seed } from "./seed-data";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL fehlt. Runbook: cp .env.example .env.local");
  }

  const client = postgres(connectionString, { max: 1 });

  try {
    await seed(drizzle(client));
    console.log("Demo-Daten eingespielt (PROTOTYPE_ONLY).");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
