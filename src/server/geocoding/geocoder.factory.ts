import { createFixtureGeocoder } from "./fixture.adapter";
import type { GeocoderPort } from "./geocoder.port";
import { createManualGeocoder } from "./manual.adapter";
import { createNominatimGeocoder } from "./nominatim.adapter";

/**
 * Waehlt den Adapter aus der Umgebung. Default ist `manual`: ohne bewusste
 * Konfiguration verlaesst keine Adresse den Rechner.
 */
export function createGeocoder(env: Record<string, string | undefined>): GeocoderPort {
  const provider = env.GEOCODER_PROVIDER?.trim() || "manual";

  if (provider === "manual") {
    return createManualGeocoder();
  }

  if (provider === "fixture") {
    // Ausdrueckliches Flag, NICHT NODE_ENV: `next start` erzwingt
    // NODE_ENV=production, und der E2E-Lauf gegen den Produktionsbuild braucht
    // den Fixture-Adapter. Eine NODE_ENV-Pruefung waere hier falsch.
    if (env.GEOCODER_ALLOW_FIXTURE !== "1") {
      throw new Error(
        "GEOCODER_PROVIDER=fixture ist nur mit GEOCODER_ALLOW_FIXTURE=1 erlaubt. " +
          "Der Fixture-Adapter ist PROTOTYPE_ONLY und liefert erfundene Koordinaten.",
      );
    }

    return createFixtureGeocoder();
  }

  if (provider === "nominatim") {
    const userAgent = env.GEOCODER_USER_AGENT?.trim();

    if (userAgent === undefined || userAgent === "") {
      throw new Error(
        "GEOCODER_PROVIDER=nominatim verlangt GEOCODER_USER_AGENT. " +
          "Die Usage-Policy der oeffentlichen Instanz fordert eine erreichbare Kennung.",
      );
    }

    return createNominatimGeocoder({
      baseUrl: env.GEOCODER_BASE_URL?.trim() || "https://nominatim.openstreetmap.org",
      userAgent,
    });
  }

  throw new Error(`Unbekannter GEOCODER_PROVIDER: ${provider}`);
}
