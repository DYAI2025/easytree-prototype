import { existsSync } from "node:fs";

const ENV_FILE = ".env.local";

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

process.env.DATABASE_URL_TEST = connectionString;
