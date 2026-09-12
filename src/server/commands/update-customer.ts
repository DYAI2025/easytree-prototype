import { and, eq } from "drizzle-orm";

import { UpdateCustomerCommand, type Customer } from "../../contracts/customer";
import { recordAudit } from "../audit/audit-log";
import { withTransaction } from "../db/client";
import { customers } from "../db/schema";
import { notFound, parseInput, type CommandDeps } from "./command-deps";

export async function updateCustomer(deps: CommandDeps, input: unknown): Promise<Customer> {
  const command = parseInput(UpdateCustomerCommand, input);

  return withTransaction(deps.db, async (tx) => {
    // Nur genannte Felder aendern; ein weggelassenes Feld bleibt unberuehrt.
    const changes: Record<string, unknown> = {};
    if (command.name !== undefined) changes.name = command.name;
    if (command.contact !== undefined) changes.contact = command.contact;
    if (command.notes !== undefined) changes.notes = command.notes;
    if (command.active !== undefined) changes.active = command.active;

    const where = and(eq(customers.id, command.id), eq(customers.orgId, deps.tenant.orgId));

    const rows =
      Object.keys(changes).length === 0
        ? await tx
            .select({
              id: customers.id,
              name: customers.name,
              contact: customers.contact,
              notes: customers.notes,
              active: customers.active,
            })
            .from(customers)
            .where(where)
        : await tx.update(customers).set(changes).where(where).returning({
            id: customers.id,
            name: customers.name,
            contact: customers.contact,
            notes: customers.notes,
            active: customers.active,
          });

    const row = rows[0];

    if (row === undefined) {
      throw notFound("Auftraggeber", command.id);
    }

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: "update_customer",
      subjectId: row.id,
      payload: changes,
      correlationId: deps.correlationId,
    });

    return row;
  });
}
