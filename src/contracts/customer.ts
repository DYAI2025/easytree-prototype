import { z } from "zod";

/**
 * Vertraege fuer Auftraggeber (FR-002). Client und Server nutzen dasselbe
 * Schema; der Server bleibt die Quelle der Wahrheit.
 *
 * Bewusst KEIN `orgId` in den Command-Schemas: der Mandant kommt ausschliesslich
 * serverseitig aus resolveTenant(). Waere er Eingabe, koennte ein Aufrufer die
 * Mandantengrenze ueberschreiten.
 */
export const nonBlankText = (max = 200) => z.string().trim().min(1, "Pflichtfeld").max(max);

export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

export const CustomerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  contact: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
});

export type Customer = z.infer<typeof CustomerSchema>;

export const CreateCustomerCommand = z.object({
  name: nonBlankText(),
  contact: optionalText(200),
  notes: optionalText(),
});

export type CreateCustomerInput = z.input<typeof CreateCustomerCommand>;

export const UpdateCustomerCommand = z.object({
  id: z.uuid(),
  name: nonBlankText().optional(),
  contact: optionalText(200),
  notes: optionalText(),
  active: z.boolean().optional(),
});

export type UpdateCustomerInput = z.input<typeof UpdateCustomerCommand>;
