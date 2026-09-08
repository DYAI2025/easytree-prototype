import { redirect } from "next/navigation";

import { MonthPlanningViewSchema } from "../../contracts/worksite-days";
import { serverClock } from "../../server/clock/clock";
import { getDb } from "../../server/db/connection";
import { monthPlanningView } from "../../server/queries/month-planning-view";
import { resolveTenant } from "../../server/tenant/tenant-context";
import { PlanungsAnsicht } from "../../ui/calendar/planungs-ansicht";
import { resolvePlanungsViewState } from "../../ui/calendar/planning-view-state";

const MONAT_MUSTER = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Servertruth ohne Umweg: die Server Component ruft die Query DIREKT auf.
 *
 * Ein Self-Fetch gegen die eigene API waere ein zusaetzlicher Netzwerk-Hop,
 * braeuchte eine absolute Basis-URL und wuerde in der Serverumgebung nur die
 * eigene Route noch einmal ausfuehren. Die API existiert fuer Clients, nicht
 * fuer den eigenen Server.
 *
 * Die URL ist der Ansichtszustand - nicht nur der Monat: `monat`, `tag`,
 * `drawer` und `id` werden hier gegen das gerade geladene Lesemodell
 * aufgeloest (Plan 5.6). Deshalb rekonstruiert schon der Serverrender einen
 * offenen Drawer, und ein Direktaufruf braucht keinen Klick im Client.
 * Fehlt oder taugt `monat` nicht, wird auf den aktuellen Monat umgeleitet,
 * damit jede Ansicht teilbar bleibt.
 */
export default async function PlanungPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const roh = typeof params.monat === "string" ? params.monat : undefined;
  const tenant = resolveTenant();
  const clock = serverClock();

  if (roh === undefined || !MONAT_MUSTER.test(roh)) {
    redirect(`/planung?monat=${clock.todayLocal(tenant.timeZone).slice(0, 7)}`);
  }

  const view = MonthPlanningViewSchema.parse(
    await monthPlanningView({ db: getDb().db, tenant, clock }, roh),
  );

  return <PlanungsAnsicht view={view} viewState={resolvePlanungsViewState(view, params)} />;
}
