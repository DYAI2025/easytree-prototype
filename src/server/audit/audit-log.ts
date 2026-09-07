import type { Transaction } from "../db/client";
import { auditEvents } from "../db/schema";

/**
 * Append-only Audit-Log (REQ-D-005, NFR-007).
 *
 * Dieses Modul exportiert bewusst NUR das Schreiben. Es gibt keinen Update-
 * und keinen Delete-Pfad; die Unveraenderlichkeit der Historie ist damit nicht
 * nur eine Absprache, sondern fehlt schlicht als Moeglichkeit. Zwei Tests
 * halten das fest: einer prueft die Exportliste, einer sucht anwendungsweit
 * nach update(auditEvents) und delete(auditEvents).
 *
 * Der Eintrag laeuft in derselben Transaktion wie der Command - schlaegt der
 * Command fehl, existiert auch kein Audit-Eintrag, der etwas behauptet, das
 * nie passiert ist.
 */
export interface AuditEntry {
  readonly orgId: string;
  /** PROTOTYPE_ONLY: ohne Anmeldung immer "demo-admin". */
  readonly actor: string;
  readonly operation: string;
  readonly subjectId?: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

export async function recordAudit(tx: Transaction, entry: AuditEntry): Promise<void> {
  await tx.insert(auditEvents).values({
    orgId: entry.orgId,
    actor: entry.actor,
    operation: entry.operation,
    subjectId: entry.subjectId ?? null,
    payload: entry.payload ?? null,
    correlationId: entry.correlationId ?? null,
  });
}
