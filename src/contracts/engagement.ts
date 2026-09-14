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

/**
 * Beschreibung in der BEARBEITUNG - drei unterscheidbare Zustaende.
 *
 * `optionalText()` taugt hier NICHT: es bildet den geleerten String auf
 * `undefined` ab, und `undefined` heisst in diesem Command "unveraendert".
 * Das Loeschen einer Beschreibung waere damit gar nicht ausdrueckbar - das
 * Speichern meldete Erfolg, und der Reload brachte den alten Text zurueck.
 *
 *   weggelassen -> undefined -> kein Schreibvorgang
 *   " Text "    -> "Text"    -> auf diesen Wert setzen
 *   "" / "   "  -> null      -> Beschreibung loeschen (Spalte NULL)
 *   null        -> null      -> Beschreibung loeschen (Spalte NULL)
 *
 * Die Ausgabe ist wieder gueltige Eingabe. Das ist keine Feinheit: auf dem
 * HTTP-Pfad parsen defineRoute UND der Command denselben Rumpf, und ein
 * `null` aus dem ersten Durchlauf muss den zweiten ueberstehen.
 */
const clearableText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value === null || value === "" ? null : value;
    });

/**
 * Bearbeitung eines BESTEHENDEN Einsatzes (Confluence 49119274 D-007).
 *
 * Was hier fehlt, ist die eigentliche Aussage des Vertrags: es gibt kein
 * `startDate` und kein `worksiteId`. Beides waere eine Aenderung an bereits
 * materialisierten Baustellentagen, und die ist ausgeschlossen (Invariante 12).
 * Die Regel steht damit nicht als Pruefung im Command, sondern als fehlende
 * Moeglichkeit im Vertrag - sie kann nicht vergessen werden.
 *
 * `endDate` und `planningHorizonDate` sind BEIDE optional, weil der Modus am
 * gespeicherten Einsatz haengt und nicht an der Eingabe: ein Einsatz mit
 * fachlichem Ende wird ueber `endDate` verlaengert, ein offener ueber einen
 * spaeteren `planningHorizonDate`. Den falschen Weg weist die Domaene mit
 * ENGAGEMENT_PERIOD_MODE_MISMATCH ab - im Schema waere die Kreuzregel nur ein
 * unspezifisches VALIDATION_FAILED (dieselbe Ueberlegung wie oben bei der
 * Anlage).
 *
 * Ein weggelassenes Feld bleibt unveraendert - wie bei `UpdateCustomerCommand`
 * und anders als beim vollstaendig ersetzenden `UpsertEmployeeCommand`.
 *
 * Davon zu trennen ist das LEEREN eines Feldes: `description` kennt beides,
 * weil sonst eine einmal gesetzte Beschreibung nie wieder wegginge (siehe
 * `clearableText`).
 */
export const UpdateEngagementCommand = z.object({
  id: z.uuid(),
  /**
   * Der Stand, den der Aufrufer gesehen hat - die optimistische Sperre
   * (REQ-E04). Undurchsichtiger Token aus dem Readback, kein Datum zum
   * Selberbauen: er kommt mikrosekundengenau aus `engagements.updated_at`.
   */
  expectedUpdatedAt: z.string().trim().min(1),
  title: nonBlankText(200).optional(),
  /** Drei Zustaende: weggelassen = unveraendert, Text = setzen, leer/null = loeschen. */
  description: clearableText(),
  colourKey: z.enum(COLOUR_KEYS).optional(),
  endDate: LocalDateSchema.optional(),
  planningHorizonDate: LocalDateSchema.optional(),
  /** Optionale Tagesauswahl - gilt AUSSCHLIESSLICH fuer die neuen Tage. */
  addedDays: z.array(LocalDateSchema).default([]),
  removedDays: z.array(LocalDateSchema).default([]),
});

export const EngagementUpdatedSchema = z.object({
  engagementId: z.uuid(),
  /** Der neue Versionstoken; der naechste Speichervorgang braucht ihn. */
  updatedAt: z.string(),
  /** Nur die ERGAENZTEN Tage - bestehende stehen hier nie drin. */
  addedWorksiteDayIds: z.array(z.uuid()),
  addedLocalDates: z.array(LocalDateSchema),
});

export type EngagementUpdated = z.infer<typeof EngagementUpdatedSchema>;

export const EngagementDetailSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: LocalDateSchema,
  endDate: LocalDateSchema.nullable(),
  planningHorizonDate: LocalDateSchema.nullable(),
  colourKey: z.string(),
  updatedAt: z.string(),
  worksiteId: z.uuid(),
  worksiteName: z.string(),
  customerName: z.string(),
  days: z.array(
    z.object({
      worksiteDayId: z.uuid(),
      localDate: LocalDateSchema,
      revisionNo: z.number().int().min(1),
      origin: z.enum(["materialized", "day_edit", "series_edit"]),
    }),
  ),
});

export type EngagementDetailDto = z.infer<typeof EngagementDetailSchema>;
