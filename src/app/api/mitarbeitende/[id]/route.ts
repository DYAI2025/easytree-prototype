import { UpsertEmployeeCommand } from "../../../../contracts/employee";
import { upsertEmployee } from "../../../../server/commands/upsert-employee";
import { defineRoute } from "../../../../server/http/handler";
import { routeDeps } from "../../../../server/http/route-deps";

export const PATCH = defineRoute({
  bodySchema: UpsertEmployeeCommand.omit({ id: true }),
  handler: async (ctx) =>
    upsertEmployee(routeDeps(ctx.correlationId), { ...ctx.body, id: ctx.params.id }),
});
