import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (connectionString === undefined || connectionString === "") {
  throw new Error("DATABASE_URL fehlt. Runbook: cp .env.example .env.local");
}

// Drizzle verlangt fuer Migrationen eine dedizierte Verbindung. Ein Pool kann
// die Tabelle __drizzle_migrations inkonsistent hinterlassen.
const client = postgres(connectionString, { max: 1 });

try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrationen angewendet.");
} finally {
  await client.end();
}
