import { z } from "zod";

import { COLOUR_KEYS } from "../domain/colour-palette";
import { LocalDateSchema, LocalTimeSchema } from "./common";
import { nonBlankText, optionalText } from "./customer";

/**
 * Vertraege fuer die Einsatz-Anlage (FR-004, FR-005).
 *
 * `endDate` ist optional; bei offenem Ende ist `planningHorizonDate` Pflicht.
 * Diese Kreuzregel steht BEWUSST NICHT hier, sondern in der Domaene
 * (validateEngagementPeriod) und als CHECK in der Datenbank. Wuerde das Schema
 * sie erzwingen, antwortete die API mit dem unspezifischen 400
 * VALIDATION_FAILED statt mit dem genauen 422 PLANNING_HORIZON_REQUIRED, und
 * der Domaenenpfad waere ueber HTTP nicht mehr erreichbar.
 *
 * Geplante Uhrzeiten sind optional (Human-PO-Vertrag D-004 superseded); die
 * Vorbelegung 08:00-18:00 ist eine UI-Entscheidung, keine Pflicht im Modell.
 */
export const CreateEngagementCommand = z.object({
  worksiteId: z.uuid(),
  title: nonBlankText(200),
  description: optionalText(),
  startDate: LocalDateSchema,
  /**
   * `null` und Weglassen bedeuten beide "offenes Ende". Beides wird auf
   * `undefined` normalisiert, damit die Command-Schicht nur EINEN Fall kennt.
   */
  endDate: LocalDateSchema.nullish().transform((value) => value ?? undefined),
  planningHorizonDate: LocalDateSchema.nullish().transform((value) => value ?? undefined),
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
