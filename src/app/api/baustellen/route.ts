import { CreateWorksiteCommand } from "../../../contracts/worksite";
import { createWorksite } from "../../../server/commands/create-worksite";
import { defineRoute } from "../../../server/http/handler";
import { routeDeps } from "../../../server/http/route-deps";
import { listWorksites } from "../../../server/queries/master-data";

export const GET = defineRoute({
  handler: async (ctx) => {
    const auftraggeberId = new URL(ctx.request.url).searchParams.get("auftraggeberId") ?? undefined;

    return { items: await listWorksites(routeDeps(ctx.correlationId), auftraggeberId) };
  },
});

export const POST = defineRoute({
  status: 201,
  bodySchema: CreateWorksiteCommand,
  handler: async (ctx) => createWorksite(routeDeps(ctx.correlationId), ctx.body),
});
