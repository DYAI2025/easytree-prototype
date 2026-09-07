import { and, eq } from "drizzle-orm";

import { fromWire } from "../../contracts/common";
import { UpsertEmployeeCommand, type Employee } from "../../contracts/employee";
import { recordAudit } from "../audit/audit-log";
import { withTransaction } from "../db/client";
import { employees } from "../db/schema";
import { notFound, parseInput, type CommandDeps } from "./command-deps";

const COLUMNS = {
  id: employees.id,
  displayName: employees.displayName,
  roleLabel: employees.roleLabel,
  active: employees.active,
  dailyCostMinorUnits: employees.dailyCostMinorUnits,
  costNote: employees.costNote,
};

/** Wandelt die Datenbankzeile ins Wire-Format (Minor Units als String). */
function toDto(row: {
  id: string;
  displayName: string;
  roleLabel: string | null;
  active: boolean;
  dailyCostMinorUnits: bigint | null;
  costNote: string | null;
}): Employee {
  return {
    id: row.id,
    displayName: row.displayName,
    roleLabel: row.roleLabel,
    active: row.active,
    dailyCostMinorUnits:
      row.dailyCostMinorUnits === null ? null : row.dailyCostMinorUnits.toString(),
    costNote: row.costNote,
  };
}

export async function upsertEmployee(deps: CommandDeps, input: unknown): Promise<Employee> {
  const command = parseInput(UpsertEmployeeCommand, input);

  return withTransaction(deps.db, async (tx) => {
    const werte = {
      displayName: command.displayName,
      roleLabel: command.roleLabel ?? null,
      dailyCostMinorUnits:
        command.dailyCostMinorUnits === undefined ? null : fromWire(command.dailyCostMinorUnits),
      costNote: command.costNote ?? null,
      ...(command.active === undefined ? {} : { active: command.active }),
    };

    if (command.id === undefined) {
      const [row] = await tx
        .insert(employees)
        .values({ orgId: deps.tenant.orgId, ...werte })
        .returning(COLUMNS);

      await recordAudit(tx, {
        orgId: deps.tenant.orgId,
        actor: deps.tenant.actor,
        operation: "create_employee",
        subjectId: row!.id,
        payload: { displayName: command.displayName },
        correlationId: deps.correlationId,
      });

      return toDto(row!);
    }

    const [row] = await tx
      .update(employees)
      .set(werte)
      .where(and(eq(employees.id, command.id), eq(employees.orgId, deps.tenant.orgId)))
      .returning(COLUMNS);

    if (row === undefined) {
      throw notFound("Mitarbeitende Person", command.id);
    }

    await recordAudit(tx, {
      orgId: deps.tenant.orgId,
      actor: deps.tenant.actor,
      operation: "update_employee",
      subjectId: row.id,
      payload: { displayName: command.displayName },
      correlationId: deps.correlationId,
    });

    return toDto(row);
  });
}
