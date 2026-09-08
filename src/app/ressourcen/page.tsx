import { ResourceSchema } from "../../contracts/resource";
import { getDb } from "../../server/db/connection";
import { listResources } from "../../server/queries/master-data";
import { resolveTenant } from "../../server/tenant/tenant-context";
import { ResourceAdmin } from "../../ui/master-data/resource-form";

/** Servertruth, nicht Buildzeit - sonst friert die Liste beim Build ein. */
export const dynamic = "force-dynamic";

export default async function RessourcenPage() {
  const rows = await listResources({ db: getDb().db, tenant: resolveTenant() });

  // Die Query liefert `kind` als freies text-Feld; erst der Vertrag macht daraus
  // die drei erlaubten Typen - und meldet, wenn in der Datenbank etwas anderes
  // steht, statt es stumm durchzureichen.
  return <ResourceAdmin resources={ResourceSchema.array().parse(rows)} />;
}
