import { redirect } from "next/navigation";

import { serverClock } from "../server/clock/clock";
import { resolveTenant } from "../server/tenant/tenant-context";

/**
 * Ohne diese Zeile prerendert Next die Route statisch (Build-Output "○ /") und
 * friert damit den aus der Uhr abgeleiteten Monat zur Buildzeit ein - der
 * Einstieg zeigte dann dauerhaft denselben, veralteten Monat.
 */
export const dynamic = "force-dynamic";

/** Der Einstieg ist die Planung, nicht die Kostenansicht (PRD 11/12). */
export default function HomePage() {
  const tenant = resolveTenant();
  const monat = serverClock().todayLocal(tenant.timeZone).slice(0, 7);

  redirect(`/planung?monat=${monat}`);
}
