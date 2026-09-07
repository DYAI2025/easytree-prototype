import { UpsertResourceCommand } from "../../../../contracts/resource";
import { upsertResource } from "../../../../server/commands/upsert-resource";
import { defineRoute } from "../../../../server/http/handler";
import { routeDeps } from "../../../../server/http/route-deps";

export const PATCH = defineRoute({
  bodySchema: UpsertResourceCommand.omit({ id: true }),
  handler: async (ctx) =>
    upsertResource(routeDeps(ctx.correlationId), { ...ctx.body, id: ctx.params.id }),
});
