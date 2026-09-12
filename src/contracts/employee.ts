import { z } from "zod";

import { MinorUnitsSchema } from "./common";
import { nonBlankText, optionalText } from "./customer";

/**
 * Vertraege fuer Mitarbeitende (FR-007).
 *
 * `roleLabel` ist Freitext und PROTOTYPE_ONLY - es gibt keine Rollenverwaltung.
 * `dailyCostMinorUnits` ist eine Demo-Kostengrundlage, KEINE Verguetung; fehlt
 * sie, wird NULL gespeichert und spaeter als "fehlt" angezeigt, nie als 0.
 */
export const EmployeeSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  roleLabel: z.string().nullable(),
  active: z.boolean(),
  dailyCostMinorUnits: z.string().nullable(),
  costNote: z.string().nullable(),
});

export type Employee = z.infer<typeof EmployeeSchema>;

export const UpsertEmployeeCommand = z.object({
  /** Fehlt beim Anlegen, gesetzt beim Aendern. */
  id: z.uuid().optional(),
  displayName: nonBlankText(160),
  roleLabel: optionalText(120),
  active: z.boolean().optional(),
  dailyCostMinorUnits: MinorUnitsSchema.optional(),
  costNote: optionalText(300),
});
