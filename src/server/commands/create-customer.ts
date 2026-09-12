import { CreateCustomerCommand, type Customer } from "../../contracts/customer";
import { recordAudit } from "../audit/audit-log";
import { withTransaction } from "../db/client";
import { customers } from "../db/schema";
import { parseInput, type CommandDeps } from "./command-deps";

export async function createCustomer(deps: CommandDeps, input: unknown): Promise<Customer> {
  const command = parseInput(CreateCustomerCommand, input);

  return withTransaction(deps.db, async (tx) => {
    const [row] = await tx
      .insert(customers)
      .values({
        // Der Mandant kommt aus dem Kontext, nie aus der Eingabe.
        orgId: deps.tenant.orgId,
        name: command.name,
        contact: command.contact ?? null,
        notes: command.notes ?? null,
      })
      .returning({
        id: customers.id,
        name: customers.name,
        contact: customers.contact,
        notes: customers.notes,
        active: customers.active,
      });

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: "create_customer",
      subjectId: row!.id,
      payload: { name: command.name },
      correlationId: deps.correlationId,
    });

    return row!;
  });
}
