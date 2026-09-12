import { loadServerConfig } from "../config";
import { createDb, type DbHandle } from "./client";

/**
 * App-weite Verbindung.
 *
 * Next haelt Modulzustand ueber Requests hinweg; ein Pool je Request wuerde die
 * Verbindungen der Datenbank erschoepfen. Deshalb genau ein Handle, lazy
 * erzeugt, damit der Import ohne gesetzte DATABASE_URL nicht schon beim Laden
 * scheitert (Tests importieren Routen ohne Datenbank).
 */
let handle: DbHandle | undefined;

export function getDb(): DbHandle {
  if (handle === undefined) {
    handle = createDb(loadServerConfig().DATABASE_URL, { max: 10 });
  }

  return handle;
}

/** Nur fuer Tests: erlaubt das Einsetzen einer eigenen Verbindung. */
export function setDbForTests(replacement: DbHandle | undefined): void {
  handle = replacement;
}
