import { and, asc, eq } from "drizzle-orm";

import type { CommandDeps } from "../commands/command-deps";
import { customers, employees, resources, worksites } from "../db/schema";

/** Listenabfragen der Stammdaten, immer auf den Mandanten eingeschraenkt. */
export async function listCustomers(deps: CommandDeps) {
  return deps.db
    .select({
      id: customers.id,
      name: customers.name,
      contact: customers.contact,
      notes: customers.notes,
      active: customers.active,
    })
    .from(customers)
    .where(eq(customers.orgId, deps.tenant.orgId))
    .orderBy(asc(customers.name));
}

export async function listWorksites(deps: CommandDeps, customerId?: string) {
  const filter =
    customerId === undefined
      ? eq(worksites.orgId, deps.tenant.orgId)
      : and(eq(worksites.orgId, deps.tenant.orgId), eq(worksites.customerId, customerId));

  return deps.db
    .select({
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
    })
    .from(worksites)
    .where(filter)
    .orderBy(asc(worksites.name));
}

export async function listEmployees(deps: CommandDeps) {
  const rows = await deps.db
    .select({
      id: employees.id,
      displayName: employees.displayName,
      roleLabel: employees.roleLabel,
      active: employees.active,
      dailyCostMinorUnits: employees.dailyCostMinorUnits,
      costNote: employees.costNote,
    })
    .from(employees)
    .where(eq(employees.orgId, deps.tenant.orgId))
    .orderBy(asc(employees.displayName));

  // bigint -> Dezimalstring an der Grenze; JSON.stringify wuerde sonst werfen.
  return rows.map((row) => ({
    ...row,
    dailyCostMinorUnits: row.dailyCostMinorUnits?.toString() ?? null,
  }));
}

export async function listResources(deps: CommandDeps) {
  const rows = await deps.db
    .select({
      id: resources.id,
      kind: resources.kind,
      name: resources.name,
      identifier: resources.identifier,
      active: resources.active,
      dailyCostMinorUnits: resources.dailyCostMinorUnits,
      costNote: resources.costNote,
    })
    .from(resources)
    .where(eq(resources.orgId, deps.tenant.orgId))
    .orderBy(asc(resources.name));

  return rows.map((row) => ({
    ...row,
    dailyCostMinorUnits: row.dailyCostMinorUnits?.toString() ?? null,
  }));
}
