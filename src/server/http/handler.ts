import type { z } from "zod";

import { DomainRuleError } from "../../domain/workday-derivation";
import { CORRELATION_HEADER, resolveCorrelationId } from "./correlation";
import { buildProblem, problemResponse } from "./problem";

export type RouteParams = Record<string, string>;

export interface RouteContext<TBody> {
  readonly request: Request;
  readonly params: RouteParams;
  readonly body: TBody;
  readonly correlationId: string;
}

/**
 * Next 16 reicht Routenparameter als Promise herein (seit Next 15 asynchron).
 * `defineRoute` awaitet sie EINMAL und gibt ein einfaches Objekt weiter - damit
 * steht diese Signatur an genau einer Stelle im Repo.
 */
export interface NextRouteContext {
  readonly params: Promise<RouteParams>;
}

export interface RouteConfig<TSchema extends z.ZodType | undefined> {
  readonly bodySchema?: TSchema;
  readonly status?: number;
  readonly handler: (
    ctx: RouteContext<TSchema extends z.ZodType ? z.output<TSchema> : undefined>,
  ) => Promise<unknown>;
}

/**
 * Einheitlicher Rahmen jeder Route: Correlation-ID, Body-Validierung,
 * Fehlerabbildung auf Problem-JSON und JSON-Antwort.
 *
 * Unerwartete Ausnahmen werden zu einem generischen 500. Ihre Meldung wird
 * NICHT ausgeliefert und NICHT protokolliert - sie kann Nutzereingaben wie eine
 * vollstaendige Adresse enthalten. Protokolliert werden nur Code und
 * Correlation-ID; der Rest ist ueber die Correlation-ID nachvollziehbar.
 */
export function defineRoute<TSchema extends z.ZodType | undefined = undefined>(
  config: RouteConfig<TSchema>,
) {
  return async function route(request: Request, nextContext?: NextRouteContext): Promise<Response> {
    const correlationId = resolveCorrelationId(request.headers);
    const responseHeaders = { [CORRELATION_HEADER]: correlationId };

    try {
      const params: RouteParams = (await nextContext?.params) ?? {};
      let body: unknown = undefined;

      if (config.bodySchema !== undefined) {
        const roh = await readJson(request, correlationId);
        const result = config.bodySchema.safeParse(roh);

        if (!result.success) {
          return problemResponse(
            buildProblem("VALIDATION_FAILED", correlationId, "Die Eingabe ist ungueltig.", {
              issues: result.error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
              })),
            }),
            responseHeaders,
          );
        }

        body = result.data;
      }

      const ergebnis = await config.handler({
        request,
        params,
        body: body as never,
        correlationId,
      });

      return new Response(JSON.stringify(ergebnis ?? null), {
        status: config.status ?? 200,
        headers: { "content-type": "application/json", ...responseHeaders },
      });
    } catch (error) {
      if (error instanceof DomainRuleError) {
        return problemResponse(
          buildProblem(error.code, correlationId, error.message, error.meta),
          responseHeaders,
        );
      }

      // Bewusst ohne Fehlermeldung und ohne Stacktrace.
      console.error({ correlationId, code: "UNEXPECTED_ERROR" });

      return problemResponse(
        buildProblem("UNEXPECTED_ERROR", correlationId, undefined),
        responseHeaders,
      );
    }
  };
}

async function readJson(request: Request, correlationId: string): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DomainRuleError(
      "VALIDATION_FAILED",
      `Der Body ist kein gueltiges JSON (${correlationId}).`,
    );
  }
}
