import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fixedClock } from "../../src/server/clock/clock";
import { createCustomer } from "../../src/server/commands/create-customer";
import { createEngagement } from "../../src/server/commands/create-engagement";
import { createWorksite } from "../../src/server/commands/create-worksite";
import { updateEngagement } from "../../src/server/commands/update-engagement";
import { updateWorksiteDay } from "../../src/server/commands/update-worksite-day";
import { upsertEmployee } from "../../src/server/commands/upsert-employee";
import { upsertResource } from "../../src/server/commands/upsert-resource";
import { createDb } from "../../src/server/db/client";
import { engagementDetail } from "../../src/server/queries/engagement-detail";
import { resolveTenant } from "../../src/server/tenant/tenant-context";

/**
 * Einsatzbearbeitung gegen echtes PostgreSQL.
 *
 * Kanonische Quelle ist Confluence 49119274 D-007 und Invariante 12:
 * eine Verlaengerung fuegt NUR neue Tage DEMSELBEN Einsatz hinzu, bestehende
 * Baustellentage und ihre Revisionen bleiben unveraendert, und fuer die neuen
 * Tage wird die persistierte Ausgangskonfiguration materialisiert - es gibt
 * keine Live-Vererbung auf bestehende Tage.
 *
 * Jede Zusicherung misst den Serverzustand, nicht die Rueckgabe allein: eine
 * Rueckgabe kann stimmen, waehrend die Tabelle etwas anderes enthaelt.
 */
const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
const tenant = resolveTenant();
/** 2026-09-07 ist ein Montag; 12./13.09. sind Samstag und Sonntag. */
const clock = fixedClock("2026-09-07T08:00:00Z");
const deps = { db: handle.db, tenant, clock, correlationId: "corr-upd" };

let worksiteA = "";
let worksiteB = "";
let anna = "";
let bernd = "";
let hebebuehne = "";

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await handle.sql`insert into organizations (id, name, time_zone) values (${tenant.orgId}, 'Demo-Betrieb (Prototyp)', 'Europe/Berlin')`;

  const kunde = await createCustomer(deps, { name: "Arboscus Demo" });
  worksiteA = (
    await createWorksite(deps, { customerId: kunde.id, name: "Park Nord", addressLine: "Weg 1" })
  ).id;
  worksiteB = (
    await createWorksite(deps, { customerId: kunde.id, name: "Allee Sued", addressLine: "Weg 2" })
  ).id;
  anna = (await upsertEmployee(deps, { displayName: "Anna" })).id;
  bernd = (await upsertEmployee(deps, { displayName: "Bernd" })).id;
  hebebuehne = (await upsertResource(deps, { kind: "machine", name: "Hebebuehne" })).id;
});

/** Einsatz mit bekanntem Ende: 07.09.-11.09.2026 = fuenf Werktage. */
const mitEnde = (overrides: Record<string, unknown> = {}) => ({
  worksiteId: worksiteA,
  title: "Rueckschnitt",
  startDate: "2026-09-07",
  endDate: "2026-09-11",
  colourKey: "moos" as const,
  employeeIds: [anna],
  resourceIds: [hebebuehne],
  ...overrides,
});

/** Offener Einsatz: Horizont 11.09.2026, `end_date` bleibt null. */
const offen = (overrides: Record<string, unknown> = {}) => ({
  worksiteId: worksiteB,
  title: "Offener Einsatz",
  startDate: "2026-09-07",
  endDate: undefined,
  planningHorizonDate: "2026-09-11",
  colourKey: "petrol" as const,
  employeeIds: [anna],
  resourceIds: [],
  ...overrides,
});

/** Alle Tage eines Einsatzes mit ihrer AKTUELLEN Revision, chronologisch. */
async function tage(engagementId: string) {
  return handle.sql<{ id: string; local_date: string; revision_no: number; origin: string }[]>`
    select d.id, d.local_date, c.revision_no, c.origin
    from worksite_days d
    join worksite_day_configurations c
      on c.worksite_day_id = d.id and c.superseded_at is null
    where d.engagement_id = ${engagementId}
    order by d.local_date
  `;
}

/** Team bzw. Ressourcen der aktuellen Revision eines Tages. */
async function belegung(worksiteDayId: string) {
  const team = await handle.sql<{ employee_id: string }[]>`
    select t.employee_id from day_team_members t
    join worksite_day_configurations c on c.id = t.configuration_id
    where c.worksite_day_id = ${worksiteDayId} and c.superseded_at is null
    order by t.employee_id
  `;
  const mittel = await handle.sql<{ resource_id: string }[]>`
    select r.resource_id from day_resource_allocations r
    join worksite_day_configurations c on c.id = r.configuration_id
    where c.worksite_day_id = ${worksiteDayId} and c.superseded_at is null
    order by r.resource_id
  `;

  return {
    employeeIds: team.map((z) => z.employee_id),
    resourceIds: mittel.map((z) => z.resource_id),
  };
}

async function einsatzZeile(engagementId: string) {
  const rows = await handle.sql<
    {
      title: string;
      description: string | null;
      colour_key: string;
      start_date: string;
      end_date: string | null;
      planning_horizon_date: string | null;
      worksite_id: string;
    }[]
  >`
    select title, description, colour_key, start_date, end_date, planning_horizon_date, worksite_id
    from engagements where id = ${engagementId}
  `;

  return rows[0]!;
}

const zaehle = async (tabelle: "engagements" | "worksite_days" | "worksite_day_configurations") =>
  (
    await handle.sql<
      { count: string }[]
    >`select count(*)::text as count from ${handle.sql(tabelle)}`
  )[0]?.count;

/* ------------------------------------------------------------------ *
 * RED 1 - Metadaten (REQ-E01)
 * ------------------------------------------------------------------ */

describe("update-engagement: Metadaten", () => {
  it("aendert Titel, Beschreibung und Farbe und liest sie unveraendert zurueck", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    const ergebnis = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      title: "Rueckschnitt Herbst",
      description: "Zweiter Durchgang",
      colourKey: "ocker",
    });

    expect(ergebnis.engagementId).toBe(angelegt.engagementId);
    // Keine Verlaengerung verlangt -> kein einziger neuer Tag.
    expect(ergebnis.addedWorksiteDayIds).toEqual([]);
    expect(ergebnis.addedLocalDates).toEqual([]);

    // Readback ueber die Query, nicht ueber die Rueckgabe des Commands.
    const nachher = await engagementDetail(deps, angelegt.engagementId);

    expect(nachher.title).toBe("Rueckschnitt Herbst");
    expect(nachher.description).toBe("Zweiter Durchgang");
    expect(nachher.colourKey).toBe("ocker");

    // Und in der Tabelle selbst.
    const zeile = await einsatzZeile(angelegt.engagementId);

    expect(zeile.title).toBe("Rueckschnitt Herbst");
    expect(zeile.description).toBe("Zweiter Durchgang");
    expect(zeile.colour_key).toBe("ocker");
  });

  it("laesst die Baustellentage einer reinen Metadatenaenderung voellig unberuehrt", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);
    const tageVorher = await tage(angelegt.engagementId);

    await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      title: "Nur der Titel",
    });

    const tageNachher = await tage(angelegt.engagementId);

    // Identische Zeilen: gleiche Ids, gleiche Daten, gleiche Revisionen.
    expect(tageNachher).toEqual(tageVorher);
    expect(await zaehle("worksite_day_configurations")).toBe("5");
  });

  it("laesst ein weggelassenes Feld unberuehrt", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const ersteLesung = await engagementDetail(deps, angelegt.engagementId);

    await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: ersteLesung.updatedAt,
      description: "Nur die Beschreibung",
    });

    const nachher = await engagementDetail(deps, angelegt.engagementId);

    expect(nachher.description).toBe("Nur die Beschreibung");
    // Der Titel stand nicht im Befehl und darf nicht verschwinden.
    expect(nachher.title).toBe("Rueckschnitt");
    expect(nachher.colourKey).toBe("moos");
  });

  it("schreibt einen Audit-Eintrag mit Einsatz-Id und Correlation-Id", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      title: "Mit Audit",
    });

    const rows = await handle.sql<
      { subject_id: string; correlation_id: string; payload: Record<string, unknown> }[]
    >`
      select subject_id, correlation_id, payload from audit_events
      where operation = 'update_engagement'
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(angelegt.engagementId);
    expect(rows[0]?.correlation_id).toBe("corr-upd");
    expect(rows[0]?.payload.addedDayCount).toBe(0);
  });

  it("meldet NOT_FOUND fuer einen unbekannten Einsatz", async () => {
    await expect(
      updateEngagement(deps, {
        id: "b0000000-0000-4000-8000-00000000dead",
        expectedUpdatedAt: "2026-09-07T00:00:00.000000Z",
        title: "Ins Leere",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("aendert keinen Einsatz eines FREMDEN Mandanten", async () => {
    const fremdeOrg = "b0000000-0000-4000-8000-0000000000aa";
    const fremderKunde = "b0000000-0000-4000-8000-0000000000bb";
    const fremdeBaustelle = "b0000000-0000-4000-8000-0000000000cc";
    const fremderEinsatz = "b0000000-0000-4000-8000-0000000000dd";

    await handle.sql`insert into organizations (id, name, time_zone) values (${fremdeOrg}, 'Fremdbetrieb', 'Europe/Berlin')`;
    await handle.sql`insert into customers (id, org_id, name) values (${fremderKunde}, ${fremdeOrg}, 'Fremdkunde')`;
    await handle.sql`insert into worksites (id, org_id, customer_id, name, address_line) values (${fremdeBaustelle}, ${fremdeOrg}, ${fremderKunde}, 'Fremdbaustelle', 'Weg 9')`;
    await handle.sql`
      insert into engagements (id, org_id, worksite_id, title, start_date, end_date, colour_key, initial_configuration)
      values (${fremderEinsatz}, ${fremdeOrg}, ${fremdeBaustelle}, 'Fremdeinsatz', '2026-09-07', '2026-09-11', 'moos', '{"employeeIds":[],"resourceIds":[]}'::jsonb)
    `;

    await expect(
      updateEngagement(deps, {
        id: fremderEinsatz,
        expectedUpdatedAt: "2026-09-07T00:00:00.000000Z",
        title: "Uebergriff",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const rows = await handle.sql<{ title: string }[]>`
      select title from engagements where id = ${fremderEinsatz}
    `;
    expect(rows[0]?.title).toBe("Fremdeinsatz");
  });
});

/* ------------------------------------------------------------------ *
 * RED 2 - Vorwaertsverlaengerung bei bekanntem Ende (REQ-E02)
 * ------------------------------------------------------------------ */

describe("update-engagement: Verlaengerung bei bekanntem Ende", () => {
  it("ergaenzt NUR die neuen Werktage und laesst bestehende Tage und Revisionen identisch", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);
    const tageVorher = await tage(angelegt.engagementId);

    expect(tageVorher.map((t) => t.local_date)).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);

    const ergebnis = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      endDate: "2026-09-18",
    });

    // Nur das Delta: der 12. und 13.09. sind Wochenende und bleiben draussen.
    expect(ergebnis.addedLocalDates).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(ergebnis.addedWorksiteDayIds).toHaveLength(5);

    const tageNachher = await tage(angelegt.engagementId);

    expect(tageNachher).toHaveLength(10);

    // Kein zweiter Einsatz.
    expect(await zaehle("engagements")).toBe("1");

    // Die fuenf bestehenden Tage sind ZEILENGLEICH - Id, Datum, Revision, Herkunft.
    expect(tageNachher.slice(0, 5)).toEqual(tageVorher);

    // Die neuen Tage tragen Revision 1 und sind materialisiert.
    const neue = tageNachher.slice(5);

    expect(neue.every((t) => t.revision_no === 1)).toBe(true);
    expect(neue.every((t) => t.origin === "materialized")).toBe(true);
    expect(neue.map((t) => t.id).sort()).toEqual([...ergebnis.addedWorksiteDayIds].sort());
  });

  it("materialisiert fuer neue Tage die persistierte Ausgangskonfiguration", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    const ergebnis = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      endDate: "2026-09-18",
    });

    for (const id of ergebnis.addedWorksiteDayIds) {
      const belegt = await belegung(id);

      expect(belegt.employeeIds).toEqual([anna]);
      expect(belegt.resourceIds).toEqual([hebebuehne]);
    }
  });

  it("erbt NICHT aus einem individuell geaenderten Tag, sondern aus der Ausgangskonfiguration", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const tageVorher = await tage(angelegt.engagementId);
    const letzterTag = tageVorher.at(-1)!;

    // Der letzte bestehende Tag bekommt ein ABWEICHENDES Team.
    await updateWorksiteDay(deps, {
      worksiteDayId: letzterTag.id,
      scope: "ONLY_THIS_DAY",
      expectedRevisionNo: 1,
      changes: { employeeIds: [bernd], resourceIds: [] },
    });

    const vorher = await engagementDetail(deps, angelegt.engagementId);
    const ergebnis = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      endDate: "2026-09-18",
    });

    // D-007: "Sie darf nicht aus einem zufaellig individuell geaenderten
    // letzten Tag erraten werden." Die neuen Tage tragen Anna, nicht Bernd.
    for (const id of ergebnis.addedWorksiteDayIds) {
      const belegt = await belegung(id);

      expect(belegt.employeeIds).toEqual([anna]);
      expect(belegt.resourceIds).toEqual([hebebuehne]);
    }

    // Und die Einzelanpassung bleibt bestehen.
    const nachher = await tage(angelegt.engagementId);
    const angepasst = nachher.find((t) => t.id === letzterTag.id)!;

    expect(angepasst.revision_no).toBe(2);
    expect(angepasst.origin).toBe("day_edit");
    expect((await belegung(letzterTag.id)).employeeIds).toEqual([bernd]);
  });

  it("nimmt einen ausdruecklich zugewaehlten Samstag im Delta mit auf", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    const ergebnis = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      endDate: "2026-09-18",
      addedDays: ["2026-09-12"],
    });

    expect(ergebnis.addedLocalDates).toEqual([
      "2026-09-12",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
  });

  it("laesst einen zugewaehlten Tag AUSSERHALB des Deltas nicht zu", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    // Der 05.09. liegt vor dem bisherigen Ende und ist damit kein neuer Tag.
    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: vorher.updatedAt,
        endDate: "2026-09-18",
        addedDays: ["2026-09-05"],
      }),
    ).rejects.toMatchObject({ code: "DAY_OUTSIDE_PERIOD" });

    expect(await zaehle("worksite_days")).toBe("5");
  });

  it("meldet eine Kollision an derselben Baustelle und ergaenzt keinen Tag", async () => {
    const angelegt = await createEngagement(deps, mitEnde());

    // Zweiter Einsatz an DERSELBEN Baustelle im Zielbereich der Verlaengerung.
    await createEngagement(
      deps,
      mitEnde({ title: "Belegt", startDate: "2026-09-14", endDate: "2026-09-18" }),
    );

    const vorher = await engagementDetail(deps, angelegt.engagementId);

    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: vorher.updatedAt,
        endDate: "2026-09-18",
      }),
    ).rejects.toMatchObject({ code: "WORKSITE_DAY_ALREADY_PLANNED" });

    // Beide Einsaetze bleiben vollstaendig und unveraendert.
    expect(await zaehle("worksite_days")).toBe("10");
    expect((await einsatzZeile(angelegt.engagementId)).end_date).toBe("2026-09-11");
  });

  it("verweigert neue Tage vor dem heutigen lokalen Datum", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    // Uhr auf den 21.09. vorstellen: die Deltatage 14.-18.09. liegen davor.
    const spaeter = { ...deps, clock: fixedClock("2026-09-21T08:00:00Z") };

    await expect(
      updateEngagement(spaeter, {
        id: angelegt.engagementId,
        expectedUpdatedAt: vorher.updatedAt,
        endDate: "2026-09-18",
      }),
    ).rejects.toMatchObject({ code: "DAY_IN_PAST_LOCKED" });

    expect(await zaehle("worksite_days")).toBe("5");
  });
});

/* ------------------------------------------------------------------ *
 * RED 3 - Offener Einsatz und Planungshorizont (REQ-E02)
 * ------------------------------------------------------------------ */

describe("update-engagement: offener Einsatz", () => {
  it("materialisiert beim spaeteren Horizont nur das Delta und laesst end_date null", async () => {
    const angelegt = await createEngagement(deps, offen());
    const vorher = await engagementDetail(deps, angelegt.engagementId);
    const tageVorher = await tage(angelegt.engagementId);

    expect(tageVorher).toHaveLength(5);

    const ergebnis = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      planningHorizonDate: "2026-09-18",
    });

    expect(ergebnis.addedLocalDates).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);

    const zeile = await einsatzZeile(angelegt.engagementId);

    // Der Horizont ist NICHT das fachliche Ende (D-006).
    expect(zeile.end_date).toBeNull();
    expect(zeile.planning_horizon_date).toBe("2026-09-18");

    const tageNachher = await tage(angelegt.engagementId);

    expect(tageNachher).toHaveLength(10);
    expect(tageNachher.slice(0, 5)).toEqual(tageVorher);
  });

  it("weist ein Enddatum am offenen Einsatz ab", async () => {
    const angelegt = await createEngagement(deps, offen());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: vorher.updatedAt,
        endDate: "2026-09-18",
      }),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_PERIOD_MODE_MISMATCH" });

    expect((await einsatzZeile(angelegt.engagementId)).end_date).toBeNull();
  });

  it("weist einen Planungshorizont am Einsatz MIT Ende ab", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: vorher.updatedAt,
        planningHorizonDate: "2026-09-18",
      }),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_PERIOD_MODE_MISMATCH" });

    expect((await einsatzZeile(angelegt.engagementId)).planning_horizon_date).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * RED 4 - Optimistische Nebenlaeufigkeit (REQ-E04)
 * ------------------------------------------------------------------ */

describe("update-engagement: Nebenlaeufigkeit", () => {
  it("lehnt den zweiten Client mit veraltetem Stand ab und bewahrt den ersten", async () => {
    const angelegt = await createEngagement(deps, mitEnde());

    // Beide Clients lesen DENSELBEN Stand.
    const clientA = await engagementDetail(deps, angelegt.engagementId);
    const clientB = await engagementDetail(deps, angelegt.engagementId);

    expect(clientA.updatedAt).toBe(clientB.updatedAt);

    await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: clientA.updatedAt,
      title: "Von A gespeichert",
    });

    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: clientB.updatedAt,
        title: "Von B ueberschrieben",
      }),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_VERSION_CONFLICT" });

    // A bleibt stehen, von B ist NICHTS geschrieben.
    expect((await einsatzZeile(angelegt.engagementId)).title).toBe("Von A gespeichert");
  });

  it("schreibt bei einem Konflikt auch keinen einzigen neuen Tag", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const veraltet = await engagementDetail(deps, angelegt.engagementId);

    await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: veraltet.updatedAt,
      title: "Zwischendurch",
    });

    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: veraltet.updatedAt,
        endDate: "2026-09-18",
      }),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_VERSION_CONFLICT" });

    expect(await zaehle("worksite_days")).toBe("5");
    expect((await einsatzZeile(angelegt.engagementId)).end_date).toBe("2026-09-11");
  });

  it("laesst den Versionstoken bei JEDER Aenderung streng steigen", async () => {
    const angelegt = await createEngagement(deps, mitEnde());

    const eins = await engagementDetail(deps, angelegt.engagementId);
    const nachErster = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: eins.updatedAt,
      title: "Erste Aenderung",
    });
    const nachZweiter = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: nachErster.updatedAt,
      title: "Zweite Aenderung",
    });

    // Zwei Aenderungen dicht hintereinander duerfen nicht denselben Token
    // ergeben - sonst wuerde ein veralteter Stand still angenommen.
    expect(nachErster.updatedAt).not.toBe(eins.updatedAt);
    expect(nachZweiter.updatedAt).not.toBe(nachErster.updatedAt);
    expect(nachZweiter.updatedAt > nachErster.updatedAt).toBe(true);
    expect(nachErster.updatedAt > eins.updatedAt).toBe(true);

    // Und der Token der Query ist derselbe wie der der Rueckgabe.
    const gelesen = await engagementDetail(deps, angelegt.engagementId);

    expect(gelesen.updatedAt).toBe(nachZweiter.updatedAt);
  });

  /*
   * Kanarienvogel fuer die STRENGE Monotonie - gemessen am 13.09.2026.
   *
   * Die Gegenmutation
   *   `greatest(clock_timestamp(), updated_at + interval '1 microsecond')`
   *   -> `now()`
   * liess alle 196 Integrationstests gruen. Der Schutz war damit unbelegt, und
   * ein Gate, das nie rot war, ist `not_run` und nicht `passed`.
   *
   * Dieser Fall belegt ihn. Liegt `updated_at` in der ZUKUNFT - Uhrversatz,
   * oder eine Transaktion, die spaeter begonnen hat als die letzte Schreibung -
   * setzt ein blosses `now()` den Token RUECKWAERTS. Ein bereits verbrauchter
   * Token waere dann wieder gueltig: genau das Loch, das die Vorbedingung
   * schliessen soll.
   */
  it("laesst den Token nicht zurueckspringen, wenn updated_at in der Zukunft liegt", async () => {
    const angelegt = await createEngagement(deps, mitEnde());

    await handle.sql`
      update engagements set updated_at = now() + interval '1 hour'
      where id = ${angelegt.engagementId}
    `;

    const vorher = await engagementDetail(deps, angelegt.engagementId);

    const ergebnis = await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      title: "Nach vorn",
    });

    // Mit `now()` waere der neue Token eine Stunde AELTER als der alte.
    expect(ergebnis.updatedAt > vorher.updatedAt).toBe(true);

    // Die Folge, auf die es ankommt: der alte Token ist wirklich verbraucht.
    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: vorher.updatedAt,
        title: "Noch einmal mit altem Token",
      }),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_VERSION_CONFLICT" });
  });
});

/* ------------------------------------------------------------------ *
 * RED 5 - Atomizitaet (REQ-E05)
 * ------------------------------------------------------------------ */

describe("update-engagement: Atomizitaet", () => {
  it("rollt bei einem Fehler NACH dem Tageseinfuegen die ganze Aenderung zurueck", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    await expect(
      updateEngagement(
        deps,
        {
          id: angelegt.engagementId,
          expectedUpdatedAt: vorher.updatedAt,
          title: "Haelt nicht",
          endDate: "2026-09-18",
        },
        {
          afterDaysInserted: async () => {
            throw new Error("Fehlerinjektion nach dem Tageseinfuegen");
          },
        },
      ),
    ).rejects.toThrow("Fehlerinjektion nach dem Tageseinfuegen");

    // Weder halbe Verlaengerung ...
    expect(await zaehle("worksite_days")).toBe("5");
    expect(await zaehle("worksite_day_configurations")).toBe("5");

    // ... noch teilweise aktualisierter Einsatz.
    const zeile = await einsatzZeile(angelegt.engagementId);

    expect(zeile.title).toBe("Rueckschnitt");
    expect(zeile.end_date).toBe("2026-09-11");

    // Auch der Versionstoken darf sich nicht bewegt haben.
    const nachher = await engagementDetail(deps, angelegt.engagementId);

    expect(nachher.updatedAt).toBe(vorher.updatedAt);
  });

  it("laesst nach einem gescheiterten Versuch einen erneuten Anlauf zu", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    await expect(
      updateEngagement(
        deps,
        {
          id: angelegt.engagementId,
          expectedUpdatedAt: vorher.updatedAt,
          endDate: "2026-09-18",
        },
        {
          afterDaysInserted: async () => {
            throw new Error("Abbruch");
          },
        },
      ),
    ).rejects.toThrow("Abbruch");

    const ergebnis = await updateEngagement(deps, {
      id: angelegt.engagementId,
      // Derselbe Token gilt weiter - der gescheiterte Lauf hat nichts bewegt.
      expectedUpdatedAt: vorher.updatedAt,
      endDate: "2026-09-18",
    });

    expect(ergebnis.addedWorksiteDayIds).toHaveLength(5);
    expect(await zaehle("worksite_days")).toBe("10");
  });
});

/* ------------------------------------------------------------------ *
 * RED 6 - Kein implizites Shrinking (REQ-E03)
 * ------------------------------------------------------------------ */

describe("update-engagement: kein Shrinking", () => {
  it("weist ein frueheres Enddatum ab und loescht keinen Tag", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);
    const tageVorher = await tage(angelegt.engagementId);

    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: vorher.updatedAt,
        endDate: "2026-09-09",
      }),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_SHRINK_NOT_ALLOWED" });

    expect(await tage(angelegt.engagementId)).toEqual(tageVorher);
    expect((await einsatzZeile(angelegt.engagementId)).end_date).toBe("2026-09-11");
  });

  it("weist einen frueheren Planungshorizont ab", async () => {
    const angelegt = await createEngagement(deps, offen());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    await expect(
      updateEngagement(deps, {
        id: angelegt.engagementId,
        expectedUpdatedAt: vorher.updatedAt,
        planningHorizonDate: "2026-09-09",
      }),
    ).rejects.toMatchObject({ code: "ENGAGEMENT_SHRINK_NOT_ALLOWED" });

    expect((await einsatzZeile(angelegt.engagementId)).planning_horizon_date).toBe("2026-09-11");
  });

  it("verschiebt den Start auch dann nicht, wenn er im Rumpf steht", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    // startDate und worksiteId sind im Vertrag nicht vorgesehen. Zod verwirft
    // unbekannte Schluessel still - die Zusicherung misst die FOLGE davon.
    await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      title: "Versuch",
      startDate: "2026-09-01",
      worksiteId: worksiteB,
    } as Parameters<typeof updateEngagement>[1]);

    const zeile = await einsatzZeile(angelegt.engagementId);

    expect(zeile.start_date).toBe("2026-09-07");
    expect(zeile.worksite_id).toBe(worksiteA);
    expect(zeile.title).toBe("Versuch");
  });

  it("aendert eine bestehende Tagesrevision auch bei einer Verlaengerung nicht", async () => {
    const angelegt = await createEngagement(deps, mitEnde());
    const vorher = await engagementDetail(deps, angelegt.engagementId);

    const revisionenVorher = await handle.sql<
      { id: string; revision_no: number; superseded_at: string | null }[]
    >`select id, revision_no, superseded_at from worksite_day_configurations order by id`;

    await updateEngagement(deps, {
      id: angelegt.engagementId,
      expectedUpdatedAt: vorher.updatedAt,
      endDate: "2026-09-18",
    });

    const bestehende = await handle.sql<
      { id: string; revision_no: number; superseded_at: string | null }[]
    >`
      select id, revision_no, superseded_at from worksite_day_configurations
      where id in ${handle.sql(revisionenVorher.map((r) => r.id))}
      order by id
    `;

    // Zeilengleich: keine abgeloest, keine hochgezaehlt.
    expect(bestehende).toEqual(revisionenVorher);
  });
});
