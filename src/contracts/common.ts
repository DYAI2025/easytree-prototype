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
