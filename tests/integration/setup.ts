import { resolveTestDatabaseUrl } from "./env";

// Nur Env-Aufloesung je Testdatei. Das Schema richtet global-setup.ts ein.
process.env.DATABASE_URL_TEST = resolveTestDatabaseUrl();
