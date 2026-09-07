import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { DomainRuleError } from "../../domain/workday-derivation";
import type { Transaction } from "../db/client";
import { idempotencyRecords } from "../db/schema";

export interface IdempotencyKeyRef {
  readonly orgId: string;
  readonly operation: string;
  readonly key: string;
  readonly fingerprint: string;
}

export interface StoredResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Kanonisiert einen Wert, damit derselbe fachliche Inhalt denselben Fingerprint
 * ergibt - unabhaengig von der Schluesselreihenfolge im JSON.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  // bigint ist nicht JSON-serialisierbar; als Dezimalstring ist es eindeutig.
  return typeof value === "bigint" ? value.toString() : value;
}

/** SHA-256 ueber den kanonisierten Payload. */
export function fingerprintOf(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

/**
 * Serialisiert gleichzeitige Zugriffe auf denselben Idempotenz-Key.
 *
 * `pg_advisory_xact_lock` haelt bis zum Ende der Transaktion und wird
 * automatisch freigegeben - anders als eine Zeilensperre braucht es dafuer
 * keine bereits existierende Zeile. `hashtextextended` nimmt Text und Seed und
 * liefert bigint, was die Sperrfunktion direkt annimmt.
 */
export async function lockIdempotencyKey(
  tx: Transaction,
  operation: string,
  key: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${operation}:${key}`}, 0))`,
  );
}

/**
 * Sucht die gespeicherte Erstantwort.
 *
 * Gleicher Key mit gleichem Fingerprint -> gespeicherte Antwort (Replay ohne
 * Doppelwirkung). Gleicher Key mit anderem Fingerprint -> Konflikt: derselbe
 * Schluessel darf nicht fuer eine andere Anfrage stehen.
 */
export async function findIdempotencyRecord(
  tx: Transaction,
  ref: IdempotencyKeyRef,
): Promise<StoredResponse | null> {
  const rows = await tx
    .select({
      fingerprint: idempotencyRecords.requestFingerprint,
      status: idempotencyRecords.responseStatus,
      body: idempotencyRecords.responseBody,
    })
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.orgId, ref.orgId),
        eq(idempotencyRecords.operation, ref.operation),
        eq(idempotencyRecords.idempotencyKey, ref.key),
      ),
    )
    .limit(1);

  const row = rows[0];

  if (row === undefined) {
    return null;
  }

  if (row.fingerprint !== ref.fingerprint) {
    throw new DomainRuleError(
      "IDEMPOTENCY_KEY_REUSED",
      `Der Idempotency-Key "${ref.key}" wurde bereits fuer eine andere Anfrage verwendet.`,
    );
  }

  return { status: row.status, body: row.body };
}

export async function rememberIdempotencyRecord(
  tx: Transaction,
  input: IdempotencyKeyRef & { status: number; body: unknown },
): Promise<void> {
  await tx.insert(idempotencyRecords).values({
    orgId: input.orgId,
    operation: input.operation,
    idempotencyKey: input.key,
    requestFingerprint: input.fingerprint,
    responseStatus: input.status,
    responseBody: input.body,
  });
}
