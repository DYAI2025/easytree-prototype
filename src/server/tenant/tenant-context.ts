/**
 * Mandantenkontext.
 *
 * PROTOTYPE_ONLY: ein Mandant, keine Authentifizierung (A-02). Der Kontext
 * wird ausschliesslich serverseitig bestimmt - er darf niemals aus einer
 * eingehenden Anfrage stammen, sonst waere die Mandantengrenze von aussen
 * steuerbar. Ein Test haelt das per Grep-Assertion fest.
 *
 * Die Struktur bleibt bewusst dieselbe wie bei echter Mandantentrennung:
 * jede Tabelle traegt org_id, jede Abfrage filtert darauf.
 */
export const DEMO_ORG_ID = "a0000000-0000-4000-8000-000000000001";

export const DEMO_ACTOR = "demo-admin";

export interface TenantContext {
  readonly orgId: string;
  readonly timeZone: string;
  /** Akteur fuer das Audit-Log; ohne Anmeldung immer der Demo-Admin. */
  readonly actor: string;
}

export function resolveTenant(): TenantContext {
  return { orgId: DEMO_ORG_ID, timeZone: "Europe/Berlin", actor: DEMO_ACTOR };
}
