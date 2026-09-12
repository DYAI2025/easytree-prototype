import { z } from "zod";

/** Vertraege der serverseitigen Adresssuche (FR-003, A-04). */
export const GeocodeQuerySchema = z.object({
  query: z.string().trim().min(3, "Mindestens drei Zeichen").max(200),
});

export const GeocodeCandidateSchema = z.object({
  label: z.string(),
  addressLine: z.string(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
  source: z.enum(["manual", "nominatim", "fixture"]),
});

export const GeocodeResultSchema = z.object({
  provider: z.enum(["manual", "nominatim", "fixture"]),
  candidates: z.array(GeocodeCandidateSchema),
});

export type GeocodeCandidateDto = z.infer<typeof GeocodeCandidateSchema>;
export type GeocodeResultDto = z.infer<typeof GeocodeResultSchema>;
