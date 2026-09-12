import { UpdateWorksiteBody } from "../../../../contracts/worksite";
import { updateWorksite } from "../../../../server/commands/update-worksite";
import { defineRoute } from "../../../../server/http/handler";
import { routeDeps } from "../../../../server/http/route-deps";

export const PATCH = defineRoute({
  bodySchema: UpdateWorksiteBody,
  handler: async (ctx) =>
    updateWorksite(routeDeps(ctx.correlationId), { ...ctx.body, id: ctx.params.id }),
});
