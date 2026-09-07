import { redirect } from "next/navigation";

import { serverClock } from "../server/clock/clock";
import { resolveTenant } from "../server/tenant/tenant-context";

/** Der Einstieg ist die Planung, nicht die Kostenansicht (PRD 11/12). */
export default function HomePage() {
  const tenant = resolveTenant();
  const monat = serverClock().todayLocal(tenant.timeZone).slice(0, 7);

  redirect(`/planung?monat=${monat}`);
}
