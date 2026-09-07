import { existsSync } from "node:fs";

const ENV_FILE = ".env.local";

/**
 * Loest die Verbindung fuer Integrationstests auf und stellt sicher, dass sie
 * auf eine Testdatenbank zeigt.
 *
 * Sicherheitsriegel: das Setup verwirft das komplette Schema. Es darf
 * ausschliesslich gegen eine Datenbank laufen, deren Name auf `_test` endet -
 * sonst loeschte ein falsch gesetztes DATABASE_URL_TEST die Entwicklungsdaten.
 */
export function resolveTestDatabaseUrl(): string {
  if (existsSync(ENV_FILE)) {
    process.loadEnvFile(ENV_FILE);
  }

  const connectionString = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

  if (connectionString === undefined || connectionString === "") {
    throw new Error(
      "Integrationstests brauchen DATABASE_URL_TEST oder DATABASE_URL. " +
        "Runbook: cp .env.example .env.local && docker compose up -d db",
    );
  }

  const databaseName = new URL(connectionString).pathname.replace(/^\//, "");

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Integrationstests laufen nur gegen eine Datenbank auf "_test", nicht gegen "${databaseName}". ` +
        "Setze DATABASE_URL_TEST auf easytree_prototype_test.",
    );
  }

  return connectionString;
}
