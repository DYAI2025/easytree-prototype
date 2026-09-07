import { CreateCustomerCommand } from "../../../contracts/customer";
import { createCustomer } from "../../../server/commands/create-customer";
import { defineRoute } from "../../../server/http/handler";
import { routeDeps } from "../../../server/http/route-deps";
import { listCustomers } from "../../../server/queries/master-data";

export const GET = defineRoute({
  handler: async (ctx) => ({ items: await listCustomers(routeDeps(ctx.correlationId)) }),
});

export const POST = defineRoute({
  status: 201,
  bodySchema: CreateCustomerCommand,
  handler: async (ctx) => createCustomer(routeDeps(ctx.correlationId), ctx.body),
});
