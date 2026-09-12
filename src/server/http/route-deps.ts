import { serverClock, type Clock } from "../clock/clock";
import { getDb } from "../db/connection";
import { resolveTenant, type TenantContext } from "../tenant/tenant-context";

/**
 * Baut die Abhaengigkeiten eines Commands aus dem Serverkontext.
 *
 * Mandant und Uhr kommen ausschliesslich von hier - nie aus der Anfrage. Die
 * Correlation-ID reicht defineRoute durch.
 */
export interface RouteDeps {
  readonly db: ReturnType<typeof getDb>["db"];
  readonly tenant: TenantContext;
  readonly clock: Clock;
  readonly correlationId: string;
}

export function routeDeps(correlationId: string): RouteDeps {
  return {
    db: getDb().db,
    tenant: resolveTenant(),
    clock: serverClock(),
    correlationId,
  };
}
