import { z } from "zod";

import { MonthPlanningViewSchema } from "../../../../contracts/worksite-days";
import { DomainRuleError } from "../../../../domain/workday-derivation";
import { defineRoute } from "../../../../server/http/handler";
import { routeDeps } from "../../../../server/http/route-deps";
import { monthPlanningView } from "../../../../server/queries/month-planning-view";

const MonthParam = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format YYYY-MM mit Monat 01 bis 12");

/**
 * Monatsansicht als serverseitig berechnetes Lesemodell (REQ-A-003).
 *
 * Die Antwort wird VOR dem Senden gegen ihren eigenen Vertrag geparst. Ein
 * Lesemodell, das seinen Vertrag verletzt, soll hier auffallen und nicht erst
 * in der UI - dort waere der Fehler nur noch als kaputte Darstellung sichtbar.
 */
export const GET = defineRoute({
  handler: async (ctx) => {
    const roh = new URL(ctx.request.url).searchParams.get("monat") ?? "";
    const monat = MonthParam.safeParse(roh);

    if (!monat.success) {
      throw new DomainRuleError(
        "VALIDATION_FAILED",
        `Der Parameter monat ist ungueltig: ${roh || "(fehlt)"}.`,
      );
    }

    const view = await monthPlanningView(routeDeps(ctx.correlationId), monat.data);

    return MonthPlanningViewSchema.parse(view);
  },
});
