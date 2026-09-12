import { defineRoute } from "../../../../server/http/handler";
import { routeDeps } from "../../../../server/http/route-deps";
import { engagementDetail } from "../../../../server/queries/engagement-detail";

export const GET = defineRoute({
  handler: async (ctx) => engagementDetail(routeDeps(ctx.correlationId), ctx.params.id),
});
