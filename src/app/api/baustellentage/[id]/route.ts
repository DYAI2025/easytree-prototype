import { WorksiteDayDetailSchema } from "../../../../contracts/worksite-days";
import { defineRoute } from "../../../../server/http/handler";
import { routeDeps } from "../../../../server/http/route-deps";
import { worksiteDayDetail } from "../../../../server/queries/worksite-day-detail";

export const GET = defineRoute({
  handler: async (ctx) => {
    const detail = await worksiteDayDetail(routeDeps(ctx.correlationId), ctx.params.id);

    return WorksiteDayDetailSchema.parse(detail);
  },
});
