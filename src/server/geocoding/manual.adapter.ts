import { DomainRuleError } from "../../domain/workday-derivation";
import type { GeocoderPort } from "./geocoder.port";

/**
 * Kein Provider konfiguriert - der Default.
 *
 * Der Manual-Pfad ist kein Fehlerzustand, sondern der bewusste Auslieferstand:
 * ohne Konfiguration verlaesst keine Adresse den Rechner. Die UI bietet
 * daraufhin die manuelle Eingabe an.
 */
export function createManualGeocoder(): GeocoderPort {
  return {
    provider: "manual",
    search: async () => {
      throw new DomainRuleError(
        "GEOCODER_NOT_CONFIGURED",
        "Es ist kein Geocoding-Provider konfiguriert. Adresse bitte manuell eingeben.",
      );
    },
  };
}
