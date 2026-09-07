import { httpStatusForProblem, type ProblemCode } from "../../domain/problem-codes";

/**
 * Fehlerdokument nach RFC 7807 (Plan 5.12).
 *
 * Es enthaelt bewusst KEINEN Stacktrace und keine rohe Fehlermeldung aus einer
 * unerwarteten Ausnahme: beides koennte interne Zustaende oder Nutzereingaben
 * nach aussen tragen. Nur bekannte Domaenenfehler duerfen ihr `detail` zeigen.
 */
export interface ProblemDocument {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly correlationId: string;
  readonly meta?: Record<string, unknown>;
}

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

const TITLES: Partial<Record<ProblemCode, string>> = {
  VALIDATION_FAILED: "Die Eingabe ist unvollstaendig oder ungueltig.",
  NOT_FOUND: "Der angeforderte Datensatz existiert nicht.",
  ENGAGEMENT_START_IN_PAST: "Ein Einsatz kann nicht in der Vergangenheit beginnen.",
  ENGAGEMENT_END_BEFORE_START: "Das Ende liegt vor dem Start.",
  PLANNING_HORIZON_REQUIRED: "Bei offenem Ende wird ein Planungshorizont gebraucht.",
  PLANNING_HORIZON_BEFORE_START: "Der Planungshorizont liegt vor dem Start.",
  TOO_MANY_DAYS: "Der Zeitraum ueberschreitet die Obergrenze.",
  NO_EFFECTIVE_DAYS: "Im Zeitraum liegt kein einziger geplanter Tag.",
  DAY_OUTSIDE_PERIOD: "Ein zugewaehlter Tag liegt ausserhalb des Zeitraums.",
  WORKSITE_DAY_ALREADY_PLANNED: "An dieser Baustelle sind Tage bereits verplant.",
  STALE_REVISION: "Der Tag wurde zwischenzeitlich geaendert.",
  IDEMPOTENCY_KEY_REUSED: "Der Idempotency-Key steht bereits fuer eine andere Anfrage.",
  MISSING_IDEMPOTENCY_KEY: "Der Header Idempotency-Key fehlt.",
  DAY_IN_PAST_LOCKED: "Dieser Tag liegt vor dem heutigen Datum.",
  GEOCODER_UNAVAILABLE: "Der Geocoding-Dienst ist nicht erreichbar.",
  GEOCODER_NOT_CONFIGURED: "Es ist kein Geocoding-Provider konfiguriert.",
};

export function problemTypeFor(code: string): string {
  return `urn:easytree-prototype:problem:${code}`;
}

export function buildProblem(
  code: string,
  correlationId: string,
  detail?: string,
  meta?: Record<string, unknown>,
): ProblemDocument {
  return {
    type: problemTypeFor(code),
    title: TITLES[code as ProblemCode] ?? "Die Anfrage konnte nicht verarbeitet werden.",
    status: httpStatusForProblem(code),
    ...(detail === undefined ? {} : { detail }),
    correlationId,
    ...(meta === undefined ? {} : { meta }),
  };
}

export function problemResponse(
  problem: ProblemDocument,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { "content-type": PROBLEM_CONTENT_TYPE, ...headers },
  });
}
