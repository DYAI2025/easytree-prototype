import { z } from "zod";

import { LocalDateSchema, MinorUnitsWireSchema } from "./common";

/**
 * Kostenuebersicht im Wire-Format (FR-020).
 *
 * `amountMinorUnits` ist NULLABLE: eine fehlende Kostengrundlage geht als
 * `null` ueber die Grenze und wird als "fehlt" angezeigt - niemals als 0.
 * Genau das haelt der Typ hier fest.
 */
export const CostPositionSchema = z.object({
  subjectId: z.uuid(),
  subjectLabel: z.string(),
  kind: z.enum(["employee", "resource"]),
  amountMinorUnits: MinorUnitsWireSchema.nullable(),
  missing: z.boolean(),
});

export const CostDaySchema = z.object({
  date: LocalDateSchema,
  subtotalMinorUnits: MinorUnitsWireSchema,
  missingCount: z.number().int().min(0),
  positions: z.array(CostPositionSchema),
});

export const CostSubjectTotalSchema = z.object({
  subjectId: z.uuid(),
  subjectLabel: z.string(),
  totalMinorUnits: MinorUnitsWireSchema,
  missingCount: z.number().int().min(0),
});

export const CostOverviewSchema = z.object({
  engagementId: z.uuid(),
  currency: z.literal("EUR"),
  ruleVersion: z.literal("prototype-daily-rate-v1"),
  totalMinorUnits: MinorUnitsWireSchema,
  missingCount: z.number().int().min(0),
  complete: z.boolean(),
  days: z.array(CostDaySchema),
  byEmployee: z.array(CostSubjectTotalSchema),
  byResource: z.array(CostSubjectTotalSchema),
});

export type CostOverviewDto = z.infer<typeof CostOverviewSchema>;
