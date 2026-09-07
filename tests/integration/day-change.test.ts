import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "../../src/server/clock/clock";
import { createCustomer } from "../../src/server/commands/create-customer";
import { createEngagement } from "../../src/server/commands/create-engagement";
import { createWorksite } from "../../src/server/commands/create-worksite";
import { previewSeriesChange } from "../../src/server/commands/preview-series-change";
import { updateWorksiteDay } from "../../src/server/commands/update-worksite-day";
import { upsertEmployee } from "../../src/server/commands/upsert-employee";
import { createDb } from "../../src/server/db/client";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
const tenant = resolveTenant();
const clock = fixedClock("2026-09-07T08:00:00Z");
const deps = { db: handle.db, tenant, clock, correlationId: "corr-day" };

let worksiteA = "";
let anna = "";
let bernd = "";
let tage: { id: string; date: string }[] = [];

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;

  const kunde = await createCustomer(deps, { name: "Arboscus Demo" });
  worksiteA = (
    await createWorksite(deps, { customerId: kunde.id, name: "Park", addressLine: "Weg 1" })
  ).id;
  anna = (await upsertEmployee(deps, { displayName: "Anna" })).id;
  bernd = (await upsertEmployee(deps, { displayName: "Bernd" })).id;

  const result = await createEngagement(deps, {
    worksiteId: worksiteA,
    title: "Rueckschnitt",
    startDate: "2026-09-07",
    endDate: "2026-09-18",
    colourKey: "moos",
    employeeIds: [anna],
    resourceIds: [],
  });

  tage = result.worksiteDayIds.map((id, index) => ({ id, date: result.localDates[index]! }));
});

const tagVom = (datum: string): string => tage.find((t) => t.date === datum)!.id;

async function revisionen() {
  return handle.sql<
    { local_date: string; revision_no: number; origin: string; superseded_at: string | null }[]
  >`
    select d.local_date, c.revision_no, c.origin, c.superseded_at
    from worksite_day_configurations c
    join worksite_days d on d.id = c.worksite_day_id
    order by d.local_date, c.revision_no
  `;
}

describe("day-change", () => {
  it("erzeugt fuer NUR DIESEN TAG eine Revision 2 und laesst alle anderen Tage bei 1", async () => {
    const ziel = tagVom("2026-09-10");

    const result = await updateWorksiteDay(deps, {
      worksiteDayId: ziel,
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: { employeeIds: [anna, bernd], note: "Zusaetzliche Person" },
    });

    expect(result.updatedDayIds).toEqual([ziel]);
    expect(result.newRevisions).toEqual([{ worksiteDayId: ziel, revisionNo: 2 }]);

    const alle = await revisionen();

    // Der adressierte Tag hat zwei Revisionen: die alte abgeloest, die neue aktuell.
    const zielRevisionen = alle.filter((r) => r.local_date === "2026-09-10");
    expect(zielRevisionen).toHaveLength(2);
    expect(zielRevisionen[0]?.revision_no).toBe(1);
    expect(zielRevisionen[0]?.superseded_at).not.toBeNull();
    expect(zielRevisionen[1]?.revision_no).toBe(2);
    expect(zielRevisionen[1]?.origin).toBe("day_edit");
    expect(zielRevisionen[1]?.superseded_at).toBeNull();

    // EXPLIZIT ueber ALLE anderen Tage: unveraendert bei Revision 1.
    const andere = alle.filter((r) => r.local_date !== "2026-09-10");
    expect(andere).toHaveLength(9);
    expect(andere.every((r) => r.revision_no === 1)).toBe(true);
    expect(andere.every((r) => r.origin === "materialized")).toBe(true);
    expect(andere.every((r) => r.superseded_at === null)).toBe(true);
  });

  it("uebernimmt Team und Notiz in die neue Revision", async () => {
    const ziel = tagVom("2026-09-10");

    await updateWorksiteDay(deps, {
      worksiteDayId: ziel,
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: { employeeIds: [anna, bernd], note: "Zwei Personen" },
    });

    const rows = await handle.sql<{ note: string; anzahl: string }[]>`
      select c.note, count(t.id)::text as anzahl
      from worksite_day_configurations c
      left join day_team_members t on t.configuration_id = c.id
      where c.worksite_day_id = ${ziel} and c.superseded_at is null
      group by c.note
    `;

    expect(rows[0]?.note).toBe("Zwei Personen");
    expect(rows[0]?.anzahl).toBe("2");
  });

  it("meldet STALE_REVISION und legt keine neue Revision an", async () => {
    const ziel = tagVom("2026-09-10");

    await expect(
      updateWorksiteDay(deps, {
        worksiteDayId: ziel,
        scope: "ONLY_THIS_DAY",
        expectedRevisionNo: 7,
        changes: { note: "Veraltet" },
      }),
    ).rejects.toMatchObject({ code: "STALE_REVISION" });

    const alle = await revisionen();
    expect(alle).toHaveLength(10);
    expect(alle.every((r) => r.revision_no === 1)).toBe(true);
  });

  it("sperrt Tage vor heute mit DAY_IN_PAST_LOCKED", async () => {
    // Uhr auf 2026-09-10 vorstellen: der 07.09. liegt dann in der Vergangenheit.
    const spaeter = {
      ...deps,
      clock: fixedClock("2026-09-10T08:00:00Z"),
    };

    await expect(
      updateWorksiteDay(spaeter, {
        worksiteDayId: tagVom("2026-09-07"),
        scope: "ONLY_THIS_DAY",
        expectedRevisionNo: 1,
        changes: { note: "Rueckwirkend" },
      }),
    ).rejects.toMatchObject({ code: "DAY_IN_PAST_LOCKED" });

    const alle = await revisionen();
    expect(alle).toHaveLength(10);
    expect(alle.every((r) => r.revision_no === 1)).toBe(true);
  });

  it("meldet NOT_FOUND fuer einen unbekannten Tag", async () => {
    await expect(
      updateWorksiteDay(deps, {
        worksiteDayId: "b0000000-0000-4000-8000-00000000dead",
        scope: "ONLY_THIS_DAY",
        expectedRevisionNo: 1,
        changes: { note: "X" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("schreibt einen Audit-Eintrag je Tagesaenderung", async () => {
    await updateWorksiteDay(deps, {
      worksiteDayId: tagVom("2026-09-10"),
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: { note: "Mit Audit" },
    });

    const rows = await handle.sql<{ count: string }[]>`
      select count(*)::text as count from audit_events where operation = 'update_worksite_day'
    `;
    expect(rows[0]?.count).toBe("1");
  });

  it("liefert fuer jeden Folgetag ID und Status", async () => {
    const vorschau = await previewSeriesChange(deps, {
      worksiteDayId: tagVom("2026-09-10"),
      includeAdjustedDayIds: [],
    });

    // Ab dem 10.09.: 10., 11., 14., 15., 16., 17., 18. = sieben Tage.
    expect(vorschau.rows).toHaveLength(7);
    expect(vorschau.rows.map((r) => r.date)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(vorschau.rows.every((r) => r.worksiteDayId.length === 36)).toBe(true);
    expect(vorschau.rows.every((r) => r.status === "unchanged")).toBe(true);
    expect(vorschau.targetIds).toHaveLength(7);
  });

  it("markiert einen zuvor einzeln geaenderten Folgetag als adjusted_excluded", async () => {
    // 2026-09-15 bekommt zuerst eine Einzelaenderung.
    await updateWorksiteDay(deps, {
      worksiteDayId: tagVom("2026-09-15"),
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: { note: "Individuell angepasst" },
    });

    const vorschau = await previewSeriesChange(deps, {
      worksiteDayId: tagVom("2026-09-10"),
      includeAdjustedDayIds: [],
    });

    const angepasst = vorschau.rows.find((r) => r.date === "2026-09-15");
    expect(angepasst?.status).toBe("adjusted_excluded");
    expect(vorschau.targetIds).not.toContain(tagVom("2026-09-15"));
    expect(vorschau.targetIds).toHaveLength(6);
    expect(vorschau.adjustedCount).toBe(1);
  });

  it("zeigt einen ausdruecklich einbezogenen Tag als adjusted_included", async () => {
    await updateWorksiteDay(deps, {
      worksiteDayId: tagVom("2026-09-15"),
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: { note: "Individuell angepasst" },
    });

    const vorschau = await previewSeriesChange(deps, {
      worksiteDayId: tagVom("2026-09-10"),
      includeAdjustedDayIds: [tagVom("2026-09-15")],
    });

    expect(vorschau.rows.find((r) => r.date === "2026-09-15")?.status).toBe("adjusted_included");
    expect(vorschau.targetIds).toContain(tagVom("2026-09-15"));
    expect(vorschau.targetIds).toHaveLength(7);
  });

  it("sperrt vergangene Tage auch in der Vorschau", async () => {
    const spaeter = { ...deps, clock: fixedClock("2026-09-16T08:00:00Z") };

    const vorschau = await previewSeriesChange(spaeter, {
      worksiteDayId: tagVom("2026-09-14"),
      includeAdjustedDayIds: [],
    });

    expect(vorschau.rows.find((r) => r.date === "2026-09-14")?.status).toBe("past_locked");
    expect(vorschau.rows.find((r) => r.date === "2026-09-15")?.status).toBe("past_locked");
    expect(vorschau.targetIds).not.toContain(tagVom("2026-09-14"));
  });
});
