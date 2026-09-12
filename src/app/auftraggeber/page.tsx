import { CustomerSchema } from "../../contracts/customer";
import { WorksiteSchema } from "../../contracts/worksite";
import { getDb } from "../../server/db/connection";
import { listCustomers, listWorksites } from "../../server/queries/master-data";
import { resolveTenant } from "../../server/tenant/tenant-context";
import { CustomerPanel } from "../../ui/master-data/customer-panel";

/** Servertruth, nicht Buildzeit. */
export const dynamic = "force-dynamic";

export default async function AuftraggeberPage() {
  const deps = { db: getDb().db, tenant: resolveTenant() };

  // Alle Baustellen auf einmal statt einer Abfrage je Auswahl: die Auswahl ist
  // reine Anzeigefrage, und ein Mandant hat in diesem Prototyp eine Handvoll
  // Baustellen. Gefiltert wird im Client, geladen genau einmal.
  const [customers, worksites] = await Promise.all([listCustomers(deps), listWorksites(deps)]);

  return (
    <CustomerPanel
      customers={CustomerSchema.array().parse(customers)}
      worksites={WorksiteSchema.array().parse(worksites)}
    />
  );
}
