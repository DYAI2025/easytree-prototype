import { and, eq } from "drizzle-orm";

import { fromWire } from "../../contracts/common";
import { UpsertResourceCommand, type Resource, type ResourceKind } from "../../contracts/resource";
import { recordAudit } from "../audit/audit-log";
import { withTransaction } from "../db/client";
import { resources } from "../db/schema";
import { notFound, parseInput, type CommandDeps } from "./command-deps";

const COLUMNS = {
  id: resources.id,
  kind: resources.kind,
  name: resources.name,
  identifier: resources.identifier,
  active: resources.active,
  dailyCostMinorUnits: resources.dailyCostMinorUnits,
  costNote: resources.costNote,
};

function toDto(row: {
  id: string;
  kind: string;
  name: string;
  identifier: string | null;
  active: boolean;
  dailyCostMinorUnits: bigint | null;
  costNote: string | null;
}): Resource {
  return {
    id: row.id,
    kind: row.kind as ResourceKind,
    name: row.name,
    identifier: row.identifier,
    active: row.active,
    dailyCostMinorUnits:
      row.dailyCostMinorUnits === null ? null : row.dailyCostMinorUnits.toString(),
    costNote: row.costNote,
  };
}

export async function upsertResource(deps: CommandDeps, input: unknown): Promise<Resource> {
  const command = parseInput(UpsertResourceCommand, input);

  return withTransaction(deps.db, async (tx) => {
    const werte = {
      kind: command.kind,
      name: command.name,
      identifier: command.identifier ?? null,
      dailyCostMinorUnits:
        command.dailyCostMinorUnits === undefined ? null : fromWire(command.dailyCostMinorUnits),
      costNote: command.costNote ?? null,
      ...(command.active === undefined ? {} : { active: command.active }),
    };

    if (command.id === undefined) {
      const [row] = await tx
        .insert(resources)
        .values({ orgId: deps.tenant.orgId, ...werte })
        .returning(COLUMNS);

      await recordAudit(tx, {
        orgId: deps.tenant.orgId,
        actor: deps.tenant.actor,
        operation: "create_resource",
        subjectId: row!.id,
        payload: { name: command.name, kind: command.kind },
        correlationId: deps.correlationId,
      });

      return toDto(row!);
    }

    const [row] = await tx
      .update(resources)
      .set(werte)
      .where(and(eq(resources.id, command.id), eq(resources.orgId, deps.tenant.orgId)))
      .returning(COLUMNS);

    if (row === undefined) {
      throw notFound("Ressource", command.id);
    }

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: "update_resource",
      subjectId: row.id,
      payload: { name: command.name, kind: command.kind },
      correlationId: deps.correlationId,
    });

    return toDto(row);
  });
}
