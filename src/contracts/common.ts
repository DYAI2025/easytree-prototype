import { z } from "zod";

/**
 * Geldbetraege sind EUR-Minor-Units. Die Domaene rechnet mit `bigint`, das
 * Wire-Format ist ein Dezimalstring: JSON.stringify wirft bei bigint, und
 * `number` verloere ab 2^53 still an Genauigkeit.
 */
export const MinorUnitsSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Nur nicht-negative ganze Minor Units")
  .max(19);

export function toWire(value: bigint): string {
  return value.toString();
}

export function fromWire(value: string): bigint {
  return BigInt(value);
}

/**
 * Lokales Geschaeftsdatum als `YYYY-MM-DD`, inklusive Kalenderpruefung -
 * ein Regex allein liesse den 31. Februar durch.
 */
export const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number) as [number, number, number];
    const probe = new Date(Date.UTC(year, month - 1, day));
    return (
      probe.getUTCFullYear() === year &&
      probe.getUTCMonth() === month - 1 &&
      probe.getUTCDate() === day
    );
  }, "Kein gueltiges Kalenderdatum");

/** Uhrzeit `HH:MM` oder `HH:MM:SS`. */
export const LocalTimeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Format HH:MM");
