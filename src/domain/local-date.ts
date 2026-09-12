/**
 * Lokales Geschäftsdatum ohne Zeitanteil und ohne Zeitzone (`YYYY-MM-DD`).
 *
 * Alle Berechnungen laufen über `Date.UTC` auf Mitternacht UTC. Damit sind sie
 * von der Prozesszeitzone unabhängig und überstehen Sommerzeitwechsel: ein
 * lokaler Tag ist hier eine Kalenderposition, keine Zeitspanne. Die einzige
 * Stelle, die eine echte Zeitzone kennt, ist `localDateInZone`.
 */
export type LocalDate = string & { readonly __localDate: unique symbol };

/** Kalendermonat als `YYYY-MM`. */
export type LocalMonth = string & { readonly __localMonth: unique symbol };

/** ISO-8601-Wochentag: 1 = Montag … 7 = Sonntag. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

const MS_PER_DAY = 86_400_000;

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/** Prüft Format und Kalenderrichtigkeit. Wirft bei ungültiger Eingabe. */
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

export function parseLocalMonth(value: string): LocalMonth {
  const match = LOCAL_MONTH_PATTERN.exec(value);

  if (match === null || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error(`Ungültiger lokaler Monat: ${value}`);
  }

  return value as LocalMonth;
}

/** Baut ein lokales Datum aus seinen Bestandteilen. */
export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  return parseLocalDate(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
}

/** Millisekunden seit Epoch für Mitternacht UTC dieses Kalendertages. */
function toUtcMillis(date: LocalDate): number {
  const match = LOCAL_DATE_PATTERN.exec(date) as RegExpExecArray;

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtcMillis(millis: number): LocalDate {
  const value = new Date(millis);

  return formatLocalDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

/** Verschiebt um ganze Kalendertage; `amount` darf negativ sein. */
export function addDays(date: LocalDate, amount: number): LocalDate {
  return fromUtcMillis(toUtcMillis(date) + amount * MS_PER_DAY);
}

/** Anzahl ganzer Kalendertage von `from` bis `to` (negativ, wenn `to` früher ist). */
export function differenceInDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / MS_PER_DAY);
}

/** Chronologische Ordnung; als Comparator für `sort` verwendbar. */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function weekdayOf(date: LocalDate): IsoWeekday {
  const sundayBased = new Date(toUtcMillis(date)).getUTCDay();

  // getUTCDay(): 0 = Sonntag … 6 = Samstag -> ISO 1 = Montag … 7 = Sonntag
  return (((sundayBased + 6) % 7) + 1) as IsoWeekday;
}

export function isWeekend(date: LocalDate): boolean {
  return weekdayOf(date) >= 6;
}

/**
 * ISO-8601-Kalenderwoche. Maßgeblich ist der Donnerstag derselben Woche: das
 * Jahr dieses Donnerstags ist das ISO-Wochenjahr, und die Woche mit dem ersten
 * Donnerstag des Jahres ist Woche 1. Deshalb gehört z. B. der 31.12.2026
 * (Donnerstag) noch zu KW 53 des Jahres 2026.
 */
export function isoWeekOf(date: LocalDate): number {
  const thursdayMillis = toUtcMillis(date) + (4 - weekdayOf(date)) * MS_PER_DAY;
  const isoYear = new Date(thursdayMillis).getUTCFullYear();
  const firstOfIsoYear = Date.UTC(isoYear, 0, 1);

  return Math.floor((thursdayMillis - firstOfIsoYear) / (7 * MS_PER_DAY)) + 1;
}

/** Das ISO-Wochenjahr kann vom Kalenderjahr abweichen (Jahreswechsel). */
export function isoWeekYearOf(date: LocalDate): number {
  const thursdayMillis = toUtcMillis(date) + (4 - weekdayOf(date)) * MS_PER_DAY;

  return new Date(thursdayMillis).getUTCFullYear();
}

export function monthOf(date: LocalDate): LocalMonth {
  return date.slice(0, 7) as LocalMonth;
}

export function daysInMonth(month: LocalMonth | string): number {
  const value = parseLocalMonth(month);
  const year = Number(value.slice(0, 4));
  const monthNumber = Number(value.slice(5, 7));

  // Tag 0 des Folgemonats ist der letzte Tag des gesuchten Monats.
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function firstDayOfMonth(month: LocalMonth | string): LocalDate {
  const value = parseLocalMonth(month);

  return parseLocalDate(`${value}-01`);
}

export function lastDayOfMonth(month: LocalMonth | string): LocalDate {
  const value = parseLocalMonth(month);

  return parseLocalDate(`${value}-${pad(daysInMonth(value), 2)}`);
}

/**
 * Das lokale Kalenderdatum, das ein Zeitpunkt in einer Zeitzone hat.
 *
 * Bewusst über `Intl.DateTimeFormat` mit explizitem `timeZone`: nur so ist das
 * Ergebnis unabhängig von der Zeitzone des Node-Prozesses. `formatToParts`
 * statt `format`, damit das Trennzeichen nicht von der ICU-Version abhängt.
 */
export function localDateInZone(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return parseLocalDate(`${lookup("year")}-${lookup("month")}-${lookup("day")}`);
}
