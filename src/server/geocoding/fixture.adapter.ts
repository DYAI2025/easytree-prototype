import type { GeocodeCandidateDto } from "../../contracts/geocoding";
import type { GeocoderPort } from "./geocoder.port";

/**
 * PROTOTYPE_ONLY. Feste Kandidaten fuer Tests, Seed und E2E - niemals fuer
 * echte Nutzung. Die Freigabe laeuft ueber das ausdrueckliche Flag
 * GEOCODER_ALLOW_FIXTURE, nicht ueber NODE_ENV.
 */
const FIXTURES: Record<string, GeocodeCandidateDto> = {
  nordring: {
    label: "Nordring 12, 14467 Potsdam",
    addressLine: "Nordring 12",
    postalCode: "14467",
    city: "Potsdam",
    country: "DE",
    lat: 52.4009,
    lng: 13.0591,
    source: "fixture",
  },
  zeppelinstrasse: {
    label: "Zeppelinstrasse 140, 14471 Potsdam",
    addressLine: "Zeppelinstrasse 140",
    postalCode: "14471",
    city: "Potsdam",
    country: "DE",
    lat: 52.3906,
    lng: 13.0335,
    source: "fixture",
  },
  suedhang: {
    label: "Suedhang 7, 14478 Potsdam",
    addressLine: "Suedhang 7",
    postalCode: "14478",
    city: "Potsdam",
    country: "DE",
    lat: 52.3762,
    lng: 13.1055,
    source: "fixture",
  },
};

export function createFixtureGeocoder(): GeocoderPort {
  return {
    provider: "fixture",
    search: async (query) => {
      const schluessel = query.toLowerCase();

      return Object.entries(FIXTURES)
        .filter(([name]) => schluessel.includes(name))
        .map(([, kandidat]) => kandidat);
    },
  };
}
