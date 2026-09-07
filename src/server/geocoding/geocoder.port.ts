import type { GeocodeCandidateDto } from "../../contracts/geocoding";

/**
 * Port der Adresssuche (REQ-A-006).
 *
 * Geocoding laeuft AUSSCHLIESSLICH serverseitig: der Provider soll austauschbar
 * bleiben, seine Nutzungsbedingungen (User-Agent, Rate Limit) sind
 * serverseitige Pflichten, und die Adresse des Kunden soll nicht vom Browser
 * aus an einen Dritten gehen. Ein Test belegt, dass "nominatim" in src/ui und
 * src/app nirgends vorkommt.
 */
export type GeocoderProviderName = "manual" | "nominatim" | "fixture";

export interface GeocoderPort {
  readonly provider: GeocoderProviderName;
  search(query: string, signal: AbortSignal): Promise<GeocodeCandidateDto[]>;
}
