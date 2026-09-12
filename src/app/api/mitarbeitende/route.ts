import { UpsertEmployeeCommand } from "../../../contracts/employee";
import { upsertEmployee } from "../../../server/commands/upsert-employee";
import { defineRoute } from "../../../server/http/handler";
import { routeDeps } from "../../../server/http/route-deps";
import { listEmployees } from "../../../server/queries/master-data";

export const GET = defineRoute({
  handler: async (ctx) => ({ items: await listEmployees(routeDeps(ctx.correlationId)) }),
});

export const POST = defineRoute({
  status: 201,
  bodySchema: UpsertEmployeeCommand.omit({ id: true }),
  handler: async (ctx) => upsertEmployee(routeDeps(ctx.correlationId), ctx.body),
});
