import { z } from "zod";

import { COLOUR_KEYS } from "../domain/colour-palette";
import { LocalDateSchema, LocalTimeSchema } from "./common";
import { nonBlankText, optionalText } from "./customer";

/**
 * Vertraege fuer die Einsatz-Anlage (FR-004, FR-005).
 *
 * `endDate` ist optional; bei offenem Ende ist `planningHorizonDate` Pflicht.
 * Die Regel steht in der Domaene (validateEngagementPeriod), im Vertrag und
 * als CHECK in der Datenbank - drei Instanzen, keine davon allein tragend.
 *
 * Geplante Uhrzeiten sind optional (Human-PO-Vertrag D-004 superseded); die
 * Vorbelegung 08:00-18:00 ist eine UI-Entscheidung, keine Pflicht im Modell.
 */
export const CreateEngagementCommand = z.object({
  worksiteId: z.uuid(),
  title: nonBlankText(200),
  description: optionalText(),
  startDate: LocalDateSchema,
  endDate: LocalDateSchema.optional(),
  planningHorizonDate: LocalDateSchema.optional(),
  colourKey: z.enum(COLOUR_KEYS),
  plannedStartTime: LocalTimeSchema.optional(),
  plannedEndTime: LocalTimeSchema.optional(),
  employeeIds: z.array(z.uuid()).default([]),
  resourceIds: z.array(z.uuid()).default([]),
  /** Optionale Tagesauswahl: Wochenenden zuwaehlen, Werktage abwaehlen. */
  addedDays: z.array(LocalDateSchema).default([]),
  removedDays: z.array(LocalDateSchema).default([]),
});

export const EngagementCreatedSchema = z.object({
  engagementId: z.uuid(),
  worksiteDayIds: z.array(z.uuid()),
  localDates: z.array(LocalDateSchema),
});

export type EngagementCreated = z.infer<typeof EngagementCreatedSchema>;
