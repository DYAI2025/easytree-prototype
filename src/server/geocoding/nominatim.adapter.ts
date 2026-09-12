import type { GeocodeCandidateDto } from "../../contracts/geocoding";
import { DomainRuleError } from "../../domain/workday-derivation";
import type { GeocoderPort } from "./geocoder.port";

export interface NominatimOptions {
  readonly baseUrl: string;
  readonly userAgent: string;
  readonly fetchImpl?: typeof fetch;
  /** Usage-Policy der oeffentlichen Instanz: hoechstens eine Anfrage je Sekunde. */
  readonly throttleMs?: number;
  readonly timeoutMs?: number;
}

interface NominatimRow {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
}

/**
 * Entwicklungsadapter fuer OSM Nominatim (A-04, keine Produktentscheidung).
 *
 * Drei Pflichten der Usage-Policy sind hier verdrahtet: ein aussagekraeftiger
 * User-Agent, hoechstens eine Anfrage je Sekunde und kein Autocomplete je
 * Tastendruck (die Suche wird nur auf Knopfdruck ausgeloest, siehe UI).
 *
 * Protokolliert wird NIE die Adresse, sondern nur Provider, Zeichenlaenge und
 * Status - eine Adresse ist ein personenbezogener Hinweis.
 */
export function createNominatimGeocoder(options: NominatimOptions): GeocoderPort {
  const fetchImpl = options.fetchImpl ?? fetch;
  const throttleMs = options.throttleMs ?? 1000;
  let zuletzt = 0;

  async function drossle(): Promise<void> {
    if (throttleMs <= 0) {
      return;
    }

    const wartezeit = zuletzt + throttleMs - Date.now();

    if (wartezeit > 0) {
      await new Promise((resolve) => setTimeout(resolve, wartezeit));
    }

    zuletzt = Date.now();
  }

  return {
    provider: "nominatim",
    search: async (query, signal) => {
      await drossle();

      const url = new URL("/search", options.baseUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "5");
      url.searchParams.set("countrycodes", "de");

      let response: Response;

      try {
        response = await fetchImpl(url.toString(), {
          signal,
          headers: { "User-Agent": options.userAgent, Accept: "application/json" },
        });
      } catch (error) {
        console.warn({ provider: "nominatim", queryLength: query.length, reason: "network" });
        throw new DomainRuleError(
          "GEOCODER_UNAVAILABLE",
          "Der Geocoding-Dienst ist derzeit nicht erreichbar.",
          { cause: (error as Error).name },
        );
      }

      if (!response.ok) {
        console.warn({ provider: "nominatim", queryLength: query.length, status: response.status });
        throw new DomainRuleError(
          "GEOCODER_UNAVAILABLE",
          "Der Geocoding-Dienst hat die Anfrage abgelehnt.",
          { status: response.status },
        );
      }

      const rows = (await response.json()) as NominatimRow[];

      return rows.map(normalise).filter((row): row is GeocodeCandidateDto => row !== null);
    },
  };
}

function normalise(row: NominatimRow): GeocodeCandidateDto | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const address = row.address ?? {};
  const strasse = [address.road, address.house_number].filter(Boolean).join(" ");

  return {
    label: row.display_name ?? strasse,
    addressLine: strasse === "" ? (row.display_name ?? "") : strasse,
    postalCode: address.postcode ?? null,
    city: address.city ?? address.town ?? address.village ?? null,
    country: (address.country_code ?? "de").toUpperCase(),
    lat,
    lng,
    source: "nominatim",
  };
}
