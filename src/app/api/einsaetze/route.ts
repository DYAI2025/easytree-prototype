import { CreateEngagementCommand } from "../../../contracts/engagement";
import { DomainRuleError } from "../../../domain/workday-derivation";
import { createEngagement } from "../../../server/commands/create-engagement";
import { defineRoute } from "../../../server/http/handler";
import { routeDeps } from "../../../server/http/route-deps";

export const IDEMPOTENCY_HEADER = "idempotency-key";

/**
 * Einsatzanlage ueber HTTP (REQ-F-007, REQ-A-004).
 *
 * Der Idempotency-Key ist PFLICHT: die Anlage materialisiert zehn und mehr
 * Baustellentage, und ein wiederholter Klick oder ein Netzwerk-Retry darf das
 * nicht ein zweites Mal tun. Ohne Key wird die Anfrage abgelehnt, statt sie
 * stillschweigend ohne Schutz auszufuehren.
 */
export const POST = defineRoute({
  status: 201,
  bodySchema: CreateEngagementCommand,
  handler: async (ctx) => {
    const idempotencyKey = ctx.request.headers.get(IDEMPOTENCY_HEADER)?.trim() ?? "";

    if (idempotencyKey === "") {
      throw new DomainRuleError(
        "MISSING_IDEMPOTENCY_KEY",
        "Der Header Idempotency-Key ist bei der Einsatzanlage erforderlich.",
      );
    }

    return createEngagement(routeDeps(ctx.correlationId), ctx.body, { idempotencyKey });
  },
});
