import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "../../src/server/clock/clock";
import { applySeriesChange } from "../../src/server/commands/apply-series-change";
import { createCustomer } from "../../src/server/commands/create-customer";
import { createEngagement } from "../../src/server/commands/create-engagement";
import { createWorksite } from "../../src/server/commands/create-worksite";
import { previewSeriesChange } from "../../src/server/commands/preview-series-change";
import { updateWorksiteDay } from "../../src/server/commands/update-worksite-day";
import { upsertEmployee } from "../../src/server/commands/upsert-employee";
import { upsertResource } from "../../src/server/commands/upsert-resource";
import { createDb } from "../../src/server/db/client";
import { costOverview } from "../../src/server/queries/cost-overview";
import { monthPlanningView } from "../../src/server/queries/month-planning-view";
import { worksiteDayDetail } from "../../src/server/queries/worksite-day-detail";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
const tenant = resolveTenant();
const deps = {
  db: handle.db,
  tenant,
  clock: fixedClock("2026-09-07T08:00:00Z"),
  correlationId: "corr-flow",
};

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;
});

/**
 * Durchlaeuft die gesamte fachliche Kette EINMAL und prueft nach jedem Schritt
 * den PERSISTIERTEN Zustand - nicht den Rueckgabewert allein.
 */
describe("backend-flow", () => {
  it("Auftraggeber -> Baustelle -> Einsatz -> Tage -> Revision -> Serie -> Queries", async () => {
    // 1. Auftraggeber
    const kunde = await createCustomer(deps, { name: "Arboscus Demo", contact: "Frau Mueller" });
    expect(
      (await handle.sql<{ count: string }[]>`select count(*)::text as count from customers`)[0]
        ?.count,
    ).toBe("1");

    // 2. Baustelle
    const baustelle = await createWorksite(deps, {
      customerId: kunde.id,
      name: "Parkanlage Nord",
      addressLine: "Musterweg 1",
      city: "Berlin",
      lat: 52.52,
      lng: 13.405,
      geocodeSource: "manual",
    });
    const baustellenZeile = await handle.sql<{ customer_id: string; lat: number; lng: number }[]>`
      select customer_id, lat, lng from worksites where id = ${baustelle.id}
    `;
    expect(baustellenZeile[0]?.customer_id).toBe(kunde.id);
    expect(baustellenZeile[0]?.lat).toBe(52.52);

    // 3. Team und Ressourcen
    const anna = await upsertEmployee(deps, { displayName: "Anna", dailyCostMinorUnits: "25000" });
    const bernd = await upsertEmployee(deps, {
      displayName: "Bernd",
      dailyCostMinorUnits: "20000",
    });
    const carla = await upsertEmployee(deps, { displayName: "Carla" });
    const buehne = await upsertResource(deps, {
      kind: "machine",
      name: "Hebebuehne",
      dailyCostMinorUnits: "12000",
    });

    // 4. Einsatz mit materialisierten Baustellentagen
    const einsatz = await createEngagement(
      deps,
      {
        worksiteId: baustelle.id,
        title: "Rueckschnitt Allee",
        startDate: "2026-09-07",
        endDate: "2026-09-18",
        colourKey: "moos",
        employeeIds: [anna.id, carla.id],
        resourceIds: [buehne.id],
      },
      { idempotencyKey: "flow-key" },
    );
    expect(einsatz.worksiteDayIds).toHaveLength(10);

    // 5. Revision 1 je Tag, mit Team und Ressourcen
    const revision1 = await handle.sql<{ anzahl: string; origin: string; revision_no: number }[]>`
      select count(*)::text as anzahl, origin, revision_no
      from worksite_day_configurations group by origin, revision_no
    `;
    expect(revision1).toHaveLength(1);
    expect(revision1[0]).toMatchObject({ anzahl: "10", origin: "materialized", revision_no: 1 });
    expect(
      (
        await handle.sql<{ count: string }[]>`select count(*)::text as count from day_team_members`
      )[0]?.count,
    ).toBe("20");
    expect(
      (
        await handle.sql<
          { count: string }[]
        >`select count(*)::text as count from day_resource_allocations`
      )[0]?.count,
    ).toBe("10");

    // 5b. Idempotenz: derselbe Key erzeugt keinen zweiten Einsatz
    const wiederholung = await createEngagement(
      deps,
      {
        worksiteId: baustelle.id,
        title: "Rueckschnitt Allee",
        startDate: "2026-09-07",
        endDate: "2026-09-18",
        colourKey: "moos",
        employeeIds: [anna.id, carla.id],
        resourceIds: [buehne.id],
      },
      { idempotencyKey: "flow-key" },
    );
    expect(wiederholung).toEqual(einsatz);
    expect(
      (await handle.sql<{ count: string }[]>`select count(*)::text as count from engagements`)[0]
        ?.count,
    ).toBe("1");

    // 6. Tagesaenderung (nur dieser Tag) -> Revision 2, origin day_edit
    const tagIndex = einsatz.localDates.indexOf("2026-09-15");
    const angepassterTag = einsatz.worksiteDayIds[tagIndex]!;
    await updateWorksiteDay(deps, {
      worksiteDayId: angepassterTag,
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: { employeeIds: [anna.id, bernd.id, carla.id], note: "Verstaerkung" },
    });

    const detailNachTagesaenderung = await worksiteDayDetail(deps, angepassterTag);
    expect(detailNachTagesaenderung.revisionNo).toBe(2);
    expect(detailNachTagesaenderung.origin).toBe("day_edit");
    expect(detailNachTagesaenderung.employees).toHaveLength(3);

    // 7. Serienvorschau ab dem 10.09.
    const startTag = einsatz.worksiteDayIds[einsatz.localDates.indexOf("2026-09-10")]!;
    const vorschau = await previewSeriesChange(deps, {
      worksiteDayId: startTag,
      includeAdjustedDayIds: [],
    });
    expect(vorschau.rows.find((r) => r.date === "2026-09-15")?.status).toBe("adjusted_excluded");
    expect(vorschau.targetIds).toHaveLength(6);

    // 8. Serienaenderung - der angepasste Tag bleibt unangetastet
    const serie = await applySeriesChange(deps, {
      worksiteDayId: startTag,
      scope: "THIS_AND_FOLLOWING",
      expectedRevisionNo: 1,
      changes: { employeeIds: [anna.id], note: "Serie" },
      includeAdjustedDayIds: [],
    });
    expect(serie.updatedDayIds).toHaveLength(6);
    expect(serie.updatedDayIds).not.toContain(angepassterTag);

    const nachSerie = await worksiteDayDetail(deps, angepassterTag);
    expect(nachSerie.revisionNo).toBe(2);
    expect(nachSerie.origin).toBe("day_edit");
    expect(nachSerie.note).toBe("Verstaerkung");

    // 9. Monatsansicht: eine Karte je Tag, zehn Tage
    const monat = await monthPlanningView(deps, "2026-09");
    expect(monat.cards).toHaveLength(10);
    for (const datum of einsatz.localDates) {
      expect(monat.cards.filter((c) => c.date === datum)).toHaveLength(1);
    }
    expect(monat.cards.find((c) => c.date === "2026-09-15")?.employeeCount).toBe(3);
    expect(monat.today).toBe("2026-09-07");

    // 10. Kosten: Carla ohne Grundlage -> unvollstaendig, nie 0
    const kosten = await costOverview(deps, einsatz.engagementId);
    expect(kosten.complete).toBe(false);
    expect(kosten.missingCount).toBeGreaterThan(0);
    const carlaPositionen = kosten.days.flatMap((d) =>
      d.positions.filter((p) => p.subjectId === carla.id),
    );
    expect(carlaPositionen.length).toBeGreaterThan(0);
    expect(carlaPositionen.every((p) => p.amountMinorUnits === null && p.missing)).toBe(true);

    // 11. Audit-Spur der gesamten Kette
    const audit = await handle.sql<{ operation: string; anzahl: string }[]>`
      select operation, count(*)::text as anzahl from audit_events group by operation order by operation
    `;
    expect(audit.map((a) => a.operation)).toEqual([
      "apply_series_change",
      "create_customer",
      "create_employee",
      "create_engagement",
      "create_resource",
      "create_worksite",
      "update_worksite_day",
    ]);
  });
});
