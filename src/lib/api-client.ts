import type { ProblemDocument } from "../server/http/problem";

/**
 * Typisierter Fetch-Client fuer Client Components.
 *
 * Client Components sprechen ausschliesslich ueber `/api/*` mit dem Server -
 * nie direkt mit der Datenbank und nie mit einem fremden Dienst. Fehler kommen
 * als Problem-JSON zurueck und werden hier zu einer Ausnahme mit `code`, damit
 * Formulare sie auf Felder abbilden koennen.
 */
export class ApiProblemError extends Error {
  readonly code: string;
  /**
   * Der Satz fuer den Nutzer. Die Eigenschaft message traegt detail, und das
   * ist im Zweifel eine Entwicklermeldung mit rohem Fehlercode - gemessen:
   * "Der Zeitraum ist nicht gueltig: ENGAGEMENT_START_IN_PAST."
   */
  readonly title: string;
  readonly status: number;
  readonly meta?: Record<string, unknown>;

  constructor(problem: ProblemDocument) {
    super(problem.detail ?? problem.title);
    this.name = "ApiProblemError";
    this.title = problem.title;
    this.code = problem.type.replace("urn:easytree-prototype:problem:", "");
    this.status = problem.status;
    this.meta = problem.meta;
  }
}

async function auswerten<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new ApiProblemError(body as ProblemDocument);
  }

  return body as T;
}

export async function apiGet<T>(pfad: string): Promise<T> {
  return auswerten<T>(await fetch(pfad, { headers: { accept: "application/json" } }));
}

export async function apiPost<T>(
  pfad: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  return auswerten<T>(
    await fetch(pfad, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

export async function apiPatch<T>(pfad: string, body: unknown): Promise<T> {
  return auswerten<T>(
    await fetch(pfad, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}
