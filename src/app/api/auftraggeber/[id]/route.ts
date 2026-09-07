import { UpdateCustomerCommand } from "../../../../contracts/customer";
import { updateCustomer } from "../../../../server/commands/update-customer";
import { defineRoute } from "../../../../server/http/handler";
import { routeDeps } from "../../../../server/http/route-deps";

export const PATCH = defineRoute({
  bodySchema: UpdateCustomerCommand.omit({ id: true }),
  handler: async (ctx) =>
    updateCustomer(routeDeps(ctx.correlationId), { ...ctx.body, id: ctx.params.id }),
});
