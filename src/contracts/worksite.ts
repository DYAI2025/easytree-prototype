import { z } from "zod";

import { nonBlankText, optionalText } from "./customer";

/**
 * Vertraege fuer Baustellen (FR-003).
 *
 * Koordinaten sind nur als PAAR gueltig. Eine halbe Koordinate ist schlimmer
 * als gar keine: sie sieht aus wie ein Ort. Dieselbe Regel steht zusaetzlich
 * als CHECK in der Datenbank (worksites_lat_lng_paired) - die Validierung hier
 * liefert nur die bessere Fehlermeldung, sie ist nicht die einzige Instanz.
 */
export const GEOCODE_SOURCES = ["manual", "nominatim", "fixture"] as const;

export const WorksiteSchema = z.object({
  id: z.uuid(),
  customerId: z.uuid(),
  name: z.string(),
  addressLine: z.string(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  geocodeSource: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
});

export type Worksite = z.infer<typeof WorksiteSchema>;

const coordinatePair = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).refine(
    (value) => {
      const record = value as { lat?: number; lng?: number };
      return (record.lat === undefined) === (record.lng === undefined);
    },
    {
      message: "Breiten- und Laengengrad nur gemeinsam angeben",
      path: ["lat"],
    },
  );

export const CreateWorksiteCommand = coordinatePair({
  customerId: z.uuid(),
  name: nonBlankText(),
  addressLine: nonBlankText(300),
  postalCode: optionalText(20),
  city: optionalText(120),
  country: z.string().trim().length(2).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  geocodeSource: z.enum(GEOCODE_SOURCES).optional(),
  notes: optionalText(),
});

export const UpdateWorksiteCommand = coordinatePair({
  id: z.uuid(),
  name: nonBlankText().optional(),
  addressLine: nonBlankText(300).optional(),
  postalCode: optionalText(20),
  city: optionalText(120),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  geocodeSource: z.enum(GEOCODE_SOURCES).optional(),
  notes: optionalText(),
  active: z.boolean().optional(),
});
