import { CostOverviewSchema } from "../../../../../contracts/costs";
import { defineRoute } from "../../../../../server/http/handler";
import { routeDeps } from "../../../../../server/http/route-deps";
import { costOverview } from "../../../../../server/queries/cost-overview";

/**
 * Plan-Kosten eines Einsatzes (REQ-F-019).
 *
 * Diese Route steht in KEINEM Task des Plans. Sie ist trotzdem noetig: der
 * Kosten-Drawer ist eine Client-Komponente mit Reitern, die von einer
 * Tageskarte aus geoeffnet wird, und Client-Komponenten sprechen
 * ausschliesslich ueber /api/* mit dem Server (REQ-A-002). Siehe PA-09.
 *
 * Die Antwort geht durch CostOverviewSchema: fehlende Kostengrundlagen bleiben
 * dadurch nachweislich `null` und werden nie zu 0.
 */
export const GET = defineRoute({
  handler: async (ctx) =>
    CostOverviewSchema.parse(await costOverview(routeDeps(ctx.correlationId), ctx.params.id)),
});
