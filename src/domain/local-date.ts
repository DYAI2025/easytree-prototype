/**
 * Lokales Geschäftsdatum ohne Zeitanteil und ohne Zeitzone (`YYYY-MM-DD`).
 * Vollständige Datumsarithmetik folgt in TASK-006.
 */
export type LocalDate = string & { readonly __localDate: unique symbol };

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Prüft Format und Kalenderrichtigkeit. Wirft bei ungültiger Eingabe.
 */
export function parseLocalDate(value: string): LocalDate {
  const match = LOCAL_DATE_PATTERN.exec(value);

  if (match === null) {
    throw new Error(`Ungültiges lokales Datum: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const roundtrip = new Date(Date.UTC(year, month - 1, day));

  if (
    roundtrip.getUTCFullYear() !== year ||
    roundtrip.getUTCMonth() !== month - 1 ||
    roundtrip.getUTCDate() !== day
  ) {
    throw new Error(`Ungültiges lokales Datum: ${value}`);
  }

  return value as LocalDate;
}
