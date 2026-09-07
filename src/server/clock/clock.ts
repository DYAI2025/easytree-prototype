import { localDateInZone, parseLocalDate, type LocalDate } from "../../domain/local-date";

/** Zeitzone der Organisation; alle Geschaeftsdaten sind lokale Daten darin. */
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/**
 * Zeit-Port (REQ-A-005). Die Domaene liest nie selbst die Uhr; sie bekommt
 * `today` hereingereicht. Nur so sind die Zeitregeln ohne Zeitmocking testbar.
 */
export interface Clock {
  now(): Date;
  todayLocal(timeZone?: string): LocalDate;
}

export function systemClock(): Clock {
  return {
    now: () => new Date(),
    todayLocal: (timeZone = DEFAULT_TIME_ZONE) => localDateInZone(new Date(), timeZone),
  };
}

/** Feste Uhr fuer Tests und Seed. */
export function fixedClock(instant: string | Date): Clock {
  const frozen = typeof instant === "string" ? new Date(instant) : instant;

  if (Number.isNaN(frozen.getTime())) {
    throw new Error(`Ungültiger Zeitpunkt für fixedClock: ${String(instant)}`);
  }

  return {
    now: () => new Date(frozen.getTime()),
    todayLocal: (timeZone = DEFAULT_TIME_ZONE) => localDateInZone(frozen, timeZone),
  };
}

/**
 * Uhr fuer Server, Seed, Integration und E2E.
 *
 * `EASYTREE_FIXED_TODAY` verankert das "heute". Ohne Anker liefen die
 * Akzeptanzszenarien nach wenigen Tagen in ENGAGEMENT_START_IN_PAST bzw.
 * DAY_IN_PAST_LOCKED.
 *
 * Der Anker ist ein Testwerkzeug. In einer Produktionsumgebung
 * (`NODE_ENV=production`) ist er deshalb nur mit dem ausdruecklichen Flag
 * `EASYTREE_PROTOTYPE=1` erlaubt - `next start` erzwingt NODE_ENV=production,
 * und der E2E-Lauf gegen den Produktionsbuild setzt das Flag bewusst.
 */
export function serverClock(env: Record<string, string | undefined> = process.env): Clock {
  const anchor = env.EASYTREE_FIXED_TODAY;

  if (anchor === undefined || anchor.trim() === "") {
    return systemClock();
  }

  if (env.NODE_ENV === "production" && env.EASYTREE_PROTOTYPE !== "1") {
    throw new Error(
      "EASYTREE_FIXED_TODAY ist bei NODE_ENV=production nur mit EASYTREE_PROTOTYPE=1 erlaubt. " +
        "Ein fester Zeitanker in einer Produktionsumgebung waere eine stille Falschaussage.",
    );
  }

  // Formatpruefung gehoert hierher: die Env-Validierung laesst jeden nicht
  // leeren String durch, ein Tippfehler wie 2026-13-45 wuerde sonst erst
  // irgendwo in der Datumsarithmetik auffallen.
  const today = parseLocalDate(anchor.trim());

  return {
    now: () => new Date(`${today}T12:00:00Z`),
    todayLocal: () => today,
  };
}
