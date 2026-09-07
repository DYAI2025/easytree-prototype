import { UpsertResourceCommand } from "../../../contracts/resource";
import { upsertResource } from "../../../server/commands/upsert-resource";
import { defineRoute } from "../../../server/http/handler";
import { routeDeps } from "../../../server/http/route-deps";
import { listResources } from "../../../server/queries/master-data";

export const GET = defineRoute({
  handler: async (ctx) => ({ items: await listResources(routeDeps(ctx.correlationId)) }),
});

export const POST = defineRoute({
  status: 201,
  bodySchema: UpsertResourceCommand.omit({ id: true }),
  handler: async (ctx) => upsertResource(routeDeps(ctx.correlationId), ctx.body),
});
