import { and, eq } from "drizzle-orm";

import { UpdateWorksiteCommand, type Worksite } from "../../contracts/worksite";
import { recordAudit } from "../audit/audit-log";
import { withTransaction } from "../db/client";
import { worksites } from "../db/schema";
import { WORKSITE_COLUMNS } from "./create-worksite";
import { notFound, parseInput, type CommandDeps } from "./command-deps";

export async function updateWorksite(deps: CommandDeps, input: unknown): Promise<Worksite> {
  const command = parseInput(UpdateWorksiteCommand, input);

  return withTransaction(deps.db, async (tx) => {
    const changes: Record<string, unknown> = {};
    if (command.name !== undefined) changes.name = command.name;
    if (command.addressLine !== undefined) changes.addressLine = command.addressLine;
    if (command.postalCode !== undefined) changes.postalCode = command.postalCode;
    if (command.city !== undefined) changes.city = command.city;
    if (command.notes !== undefined) changes.notes = command.notes;
    if (command.active !== undefined) changes.active = command.active;
    if (command.lat !== undefined) changes.lat = command.lat;
    if (command.lng !== undefined) changes.lng = command.lng;
    if (command.geocodeSource !== undefined) {
      changes.geocodeSource = command.geocodeSource;
      changes.geocodeResolvedAt = new Date();
    }

    const where = and(eq(worksites.id, command.id), eq(worksites.orgId, deps.tenant.orgId));

    const rows =
      Object.keys(changes).length === 0
        ? await tx.select(WORKSITE_COLUMNS).from(worksites).where(where)
        : await tx.update(worksites).set(changes).where(where).returning(WORKSITE_COLUMNS);

    const row = rows[0];

    if (row === undefined) {
      throw notFound("Baustelle", command.id);
    }

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: "update_worksite",
      subjectId: row.id,
      payload: changes,
      correlationId: deps.correlationId,
    });

    return row;
  });
}
