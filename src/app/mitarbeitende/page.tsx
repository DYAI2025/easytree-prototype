import { EmployeeSchema } from "../../contracts/employee";
import { getDb } from "../../server/db/connection";
import { listEmployees } from "../../server/queries/master-data";
import { resolveTenant } from "../../server/tenant/tenant-context";
import { EmployeeAdmin } from "../../ui/master-data/employee-form";

/**
 * Die Liste ist Servertruth und darf nicht zur Buildzeit einfrieren - sonst
 * zeigte die Seite nach jedem Anlegen weiter den alten Stand.
 */
export const dynamic = "force-dynamic";

/** Servertruth ohne Umweg: die Server Component ruft die Query direkt auf. */
export default async function MitarbeitendePage() {
  const rows = await listEmployees({ db: getDb().db, tenant: resolveTenant() });

  return <EmployeeAdmin employees={EmployeeSchema.array().parse(rows)} />;
}
