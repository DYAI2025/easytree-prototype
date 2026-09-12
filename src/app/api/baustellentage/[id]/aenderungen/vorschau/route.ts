import { z } from "zod";

import { SeriesPreviewSchema } from "../../../../../../contracts/worksite-days";
import { previewSeriesChange } from "../../../../../../server/commands/preview-series-change";
import { defineRoute } from "../../../../../../server/http/handler";
import { routeDeps } from "../../../../../../server/http/route-deps";

const PreviewBody = z.object({
  includeAdjustedDayIds: z.array(z.uuid()).default([]),
});

/** Vorschau der Serienaenderung - reines Lesen, keine Reservierung. */
export const POST = defineRoute({
  bodySchema: PreviewBody,
  handler: async (ctx) => {
    const preview = await previewSeriesChange(routeDeps(ctx.correlationId), {
      worksiteDayId: ctx.params.id,
      includeAdjustedDayIds: ctx.body.includeAdjustedDayIds,
    });

    return SeriesPreviewSchema.parse(preview);
  },
});
