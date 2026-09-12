import { z } from "zod";

export const GEOCODER_PROVIDERS = ["manual", "nominatim", "fixture"] as const;

export type GeocoderProvider = (typeof GEOCODER_PROVIDERS)[number];

/** Leere Env-Werte (`FOO=`) sollen wie "nicht gesetzt" wirken. */
const emptyAsUndefined = (value: unknown): unknown =>
  value === "" || value === undefined ? undefined : value;

const optionalText = z.preprocess(emptyAsUndefined, z.string().min(1).optional());

const serverConfigSchema = z.object({
  DATABASE_URL: z.preprocess(
    emptyAsUndefined,
    z.string({ error: "DATABASE_URL fehlt" }).url("DATABASE_URL muss eine URL sein"),
  ),
  DATABASE_URL_TEST: z.preprocess(emptyAsUndefined, z.string().url().optional()),
  GEOCODER_PROVIDER: z.preprocess(emptyAsUndefined, z.enum(GEOCODER_PROVIDERS).default("manual")),
  GEOCODER_BASE_URL: z.preprocess(emptyAsUndefined, z.string().url().optional()),
  GEOCODER_USER_AGENT: optionalText,
  GEOCODER_ALLOW_FIXTURE: optionalText,
  EASYTREE_FIXED_TODAY: optionalText,
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

/**
 * Liest und validiert die Serverkonfiguration. Wirft mit einer Meldung, die
 * jeden fehlerhaften Variablennamen nennt.
 */
export function loadServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const result = serverConfigSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Serverkonfiguration ungültig — ${details}`);
  }

  return result.data;
}
