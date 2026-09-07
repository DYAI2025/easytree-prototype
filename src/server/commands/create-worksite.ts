import { and, eq } from "drizzle-orm";

import { CreateWorksiteCommand, type Worksite } from "../../contracts/worksite";
import { recordAudit } from "../audit/audit-log";
import { withTransaction } from "../db/client";
import { customers, worksites } from "../db/schema";
import { notFound, parseInput, type CommandDeps } from "./command-deps";

const RETURNING = {
  id: worksites.id,
  customerId: worksites.customerId,
  name: worksites.name,
  addressLine: worksites.addressLine,
  postalCode: worksites.postalCode,
  city: worksites.city,
  country: worksites.country,
  lat: worksites.lat,
  lng: worksites.lng,
  geocodeSource: worksites.geocodeSource,
  notes: worksites.notes,
  active: worksites.active,
};

export async function createWorksite(deps: CommandDeps, input: unknown): Promise<Worksite> {
  const command = parseInput(CreateWorksiteCommand, input);

  return withTransaction(deps.db, async (tx) => {
    // Der Auftraggeber muss zum selben Mandanten gehoeren; sonst waere die
    // Baustelle ueber eine fremde ID an einen anderen Mandanten haengbar.
    const parent = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, command.customerId), eq(customers.orgId, deps.tenant.orgId)))
      .limit(1);

    if (parent[0] === undefined) {
      throw notFound("Auftraggeber", command.customerId);
    }

    const [row] = await tx
      .insert(worksites)
      .values({
        orgId: deps.tenant.orgId,
        customerId: command.customerId,
        name: command.name,
        addressLine: command.addressLine,
        postalCode: command.postalCode ?? null,
        city: command.city ?? null,
        country: command.country ?? "DE",
        lat: command.lat ?? null,
        lng: command.lng ?? null,
        geocodeSource: command.geocodeSource ?? null,
        geocodeResolvedAt: command.geocodeSource === undefined ? null : new Date(),
        notes: command.notes ?? null,
      })
      .returning(RETURNING);

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: "create_worksite",
      subjectId: row!.id,
      payload: { name: command.name, customerId: command.customerId },
      correlationId: deps.correlationId,
    });

    return row!;
  });
}

export { RETURNING as WORKSITE_COLUMNS };
