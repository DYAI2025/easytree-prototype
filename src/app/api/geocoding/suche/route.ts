import { GeocodeQuerySchema, GeocodeResultSchema } from "../../../../contracts/geocoding";
import { loadServerConfig } from "../../../../server/config";
import { createGeocoder } from "../../../../server/geocoding/geocoder.factory";
import { defineRoute } from "../../../../server/http/handler";

const TIMEOUT_MS = 5000;

/**
 * Adresssuche - ausschliesslich serverseitig (REQ-A-006, REQ-S-002).
 *
 * Der Browser ruft nie einen Geocoding-Provider direkt: die Nutzungsbedingungen
 * sind serverseitige Pflichten, und die Adresse des Kunden soll nicht vom
 * Endgeraet aus an einen Dritten gehen.
 */
export const POST = defineRoute({
  bodySchema: GeocodeQuerySchema,
  handler: async (ctx) => {
    // Die Konfiguration wird je Anfrage gelesen; ein Providerwechsel braucht
    // damit keinen Neustart und die Startfehler bleiben sichtbar.
    loadServerConfig();
    const geocoder = createGeocoder(process.env);

    const candidates = await geocoder.search(ctx.body.query, AbortSignal.timeout(TIMEOUT_MS));

    return GeocodeResultSchema.parse({ provider: geocoder.provider, candidates });
  },
});
