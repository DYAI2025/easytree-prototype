import { z } from "zod";

import { LocalTimeSchema } from "./common";
import { optionalText } from "./customer";

/**
 * Vertraege fuer Tages- und Serienaenderung (FR-006).
 *
 * Es gibt genau ZWEI Scopes. Eine dritte Option "gesamter Einsatz" ist
 * HUMAN_INPUT_REQUIRED (H-02) und hier bewusst nicht vorgesehen.
 */
export const DAY_CHANGE_SCOPES = ["ONLY_THIS_DAY", "THIS_AND_FOLLOWING"] as const;

export const DayChangeSet = z.object({
  employeeIds: z.array(z.uuid()).optional(),
  resourceIds: z.array(z.uuid()).optional(),
  plannedStartTime: LocalTimeSchema.nullable().optional(),
  plannedEndTime: LocalTimeSchema.nullable().optional(),
  note: optionalText(1000),
});

export const DayChangeCommand = z.object({
  worksiteDayId: z.uuid(),
  scope: z.enum(DAY_CHANGE_SCOPES),
  /** Optimistische Sperre: die Revision, die der Aufrufer gesehen hat. */
  expectedRevisionNo: z.number().int().min(1),
  changes: DayChangeSet,
  /** Nur bei THIS_AND_FOLLOWING: ausdruecklich einbezogene angepasste Tage. */
  includeAdjustedDayIds: z.array(z.uuid()).default([]),
});

export const DayChangeResultSchema = z.object({
  updatedDayIds: z.array(z.uuid()),
  newRevisions: z.array(z.object({ worksiteDayId: z.uuid(), revisionNo: z.number().int() })),
});

export type DayChangeResult = z.infer<typeof DayChangeResultSchema>;
