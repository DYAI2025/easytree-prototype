import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Die Logik steht in einer async-Funktion statt auf Modulebene: tsx uebersetzt
 * .ts-Dateien ohne "type": "module" nach CJS, und dort ist Top-Level-await
 * nicht erlaubt ("Top-level await is currently not supported with the cjs
 * output format"). Der Fehler faellt nur beim echten Ausfuehren des Skripts auf.
 */
async function main(): Promise<void> {
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
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
