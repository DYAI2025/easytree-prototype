import { z } from "zod";

import { DomainRuleError } from "../../domain/workday-derivation";
import type { Database } from "../db/client";
import type { TenantContext } from "../tenant/tenant-context";

/**
 * Gemeinsame Abhaengigkeiten jedes Commands. Sie werden hereingereicht statt
 * importiert, damit Tests Uhr, Mandant und Verbindung austauschen koennen.
 */
export interface CommandDeps {
  readonly db: Database;
  readonly tenant: TenantContext;
  readonly correlationId?: string;
}

/**
 * Parst die Eingabe gegen ihr Schema und wirft VALIDATION_FAILED mit den
 * betroffenen Feldern - nie einen rohen Zod-Fehler, den der HTTP-Layer dann
 * neu interpretieren muesste.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    throw new DomainRuleError(
      "VALIDATION_FAILED",
      issues.map((issue) => `${issue.field || "(root)"}: ${issue.message}`).join("; "),
    );
  }

  return result.data;
}

export function notFound(what: string, id: string): DomainRuleError {
  return new DomainRuleError("NOT_FOUND", `${what} ${id} wurde nicht gefunden.`);
}
