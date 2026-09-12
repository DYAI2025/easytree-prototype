/**
 * Correlation-ID je Request (REQ-O-001): entweder aus dem eingehenden Header
 * uebernommen oder neu erzeugt, und in der Antwort gespiegelt.
 */
export const CORRELATION_HEADER = "x-correlation-id";

const MAX_LENGTH = 128;

export interface HeaderLike {
  get(name: string): string | null;
}

export function resolveCorrelationId(headers: HeaderLike): string {
  const incoming = headers.get(CORRELATION_HEADER)?.trim() ?? "";

  // Fremde Eingaben werden nicht ungeprueft ins Log uebernommen: leere oder
  // uebermaessig lange Werte werden ersetzt statt weitergereicht.
  if (incoming === "" || incoming.length > MAX_LENGTH) {
    return crypto.randomUUID();
  }

  return incoming;
}
