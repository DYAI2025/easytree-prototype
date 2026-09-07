import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Setzt die Datenbank auf den Migrationsstand zurueck. Der Prototyp hat keine
 * Produktionsdaten; ein Reset ist der schnellste Weg zu einem definierten
 * Ausgangszustand.
 */
const connectionString = process.env.DATABASE_URL;

if (connectionString === undefined || connectionString === "") {
  throw new Error("DATABASE_URL fehlt. Runbook: cp .env.example .env.local");
}

const client = postgres(connectionString, { max: 1 });

try {
  await client.unsafe(
    'drop schema if exists public cascade; drop schema if exists "drizzle" cascade; create schema public;',
  );
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Datenbank zurueckgesetzt und migriert.");
} finally {
  await client.end();
}
