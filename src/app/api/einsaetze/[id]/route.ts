import {
  EngagementDetailSchema,
  EngagementUpdatedSchema,
  UpdateEngagementCommand,
} from "../../../../contracts/engagement";
import { updateEngagement } from "../../../../server/commands/update-engagement";
import { defineRoute } from "../../../../server/http/handler";
import { routeDeps } from "../../../../server/http/route-deps";
import { engagementDetail } from "../../../../server/queries/engagement-detail";

export const GET = defineRoute({
  handler: async (ctx) =>
    EngagementDetailSchema.parse(
      await engagementDetail(routeDeps(ctx.correlationId), ctx.params.id),
    ),
});

/**
 * Bearbeitung eines bestehenden Einsatzes (Confluence 49119274 D-007).
 *
 * Bewusst OHNE Idempotency-Key, anders als die Anlage: hier schuetzt die
 * Vorbedingung `expectedUpdatedAt`. Ein wiederholter Klick traegt denselben
 * Token, und der zweite Versuch endet mit 409 statt mit einer zweiten
 * Verlaengerung.
 */
export const PATCH = defineRoute({
  bodySchema: UpdateEngagementCommand.omit({ id: true }),
  handler: async (ctx) =>
    EngagementUpdatedSchema.parse(
      await updateEngagement(routeDeps(ctx.correlationId), { ...ctx.body, id: ctx.params.id }),
    ),
});
