import { z } from "zod";

import { MinorUnitsSchema } from "./common";
import { nonBlankText, optionalText } from "./customer";

/**
 * Vertraege fuer Ressourcen (FR-008).
 *
 * Die Typen und Felder sind A-08 und damit PROTOTYPE_ONLY; weitere
 * Typattribute sind HUMAN_INPUT_REQUIRED (H-05, OQ-006) und werden hier
 * bewusst NICHT erfunden. `identifier` ist Freitext fuer Kennzeichen oder
 * Inventarnummer.
 */
export const RESOURCE_KINDS = ["vehicle", "machine", "equipment"] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const ResourceSchema = z.object({
  id: z.uuid(),
  kind: z.enum(RESOURCE_KINDS),
  name: z.string(),
  identifier: z.string().nullable(),
  active: z.boolean(),
  dailyCostMinorUnits: z.string().nullable(),
  costNote: z.string().nullable(),
});

export type Resource = z.infer<typeof ResourceSchema>;

export const UpsertResourceCommand = z.object({
  id: z.uuid().optional(),
  kind: z.enum(RESOURCE_KINDS),
  name: nonBlankText(160),
  identifier: optionalText(120),
  active: z.boolean().optional(),
  dailyCostMinorUnits: MinorUnitsSchema.optional(),
  costNote: optionalText(300),
});
