import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { resolveTestDatabaseUrl } from "./env";

/**
 * Laeuft GENAU EINMAL pro Testlauf (nicht je Datei).
 *
 * Setzt das Schema zurueck und wendet alle Migrationen an. Damit ist der
 * Ausgangszustand deterministisch, und ein neu erzeugtes 0000_initial.sql
 * kollidiert nicht mit dem Hash eines frueheren Laufs. In `setupFiles` waere
 * das falsch: dort liefe es je Testdatei, und parallele Worker kollidierten
 * beim Anlegen des drizzle-Schemas (23505 auf pg_namespace).
 */
export default async function globalSetup(): Promise<void> {
  const client = postgres(resolveTestDatabaseUrl(), { max: 1 });

  try {
    await client.unsafe(
      'drop schema if exists public cascade; drop schema if exists "drizzle" cascade; create schema public;',
    );
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}
