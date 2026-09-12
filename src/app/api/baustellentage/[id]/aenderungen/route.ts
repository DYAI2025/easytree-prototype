import { DayChangeCommand, DayChangeResultSchema } from "../../../../../contracts/day-change";
import { applySeriesChange } from "../../../../../server/commands/apply-series-change";
import { updateWorksiteDay } from "../../../../../server/commands/update-worksite-day";
import { defineRoute } from "../../../../../server/http/handler";
import { routeDeps } from "../../../../../server/http/route-deps";

/**
 * Tages- und Serienaenderung ueber einen Endpunkt; der Scope entscheidet.
 * Es gibt genau zwei Scopes - eine dritte Option "gesamter Einsatz" ist
 * HUMAN_INPUT_REQUIRED (H-02) und im Vertrag bewusst nicht vorgesehen.
 */
export const POST = defineRoute({
  bodySchema: DayChangeCommand.omit({ worksiteDayId: true }),
  handler: async (ctx) => {
    const deps = routeDeps(ctx.correlationId);
    const command = { ...ctx.body, worksiteDayId: ctx.params.id };

    const result =
      command.scope === "THIS_AND_FOLLOWING"
        ? await applySeriesChange(deps, command)
        : await updateWorksiteDay(deps, command);

    return DayChangeResultSchema.parse(result);
  },
});
