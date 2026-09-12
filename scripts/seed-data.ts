import { fixedClock } from "../src/server/clock/clock";
import { createEngagement } from "../src/server/commands/create-engagement";
import type { Database } from "../src/server/db/client";
import { customers, employees, organizations, resources, worksites } from "../src/server/db/schema";
import { DEMO_ORG_ID, resolveTenant } from "../src/server/tenant/tenant-context";

/**
 * Demo-Daten nach Abschnitt 12 des Plans. Alles PROTOTYPE_ONLY: erfundene
 * Fixtures, keine realen Kundendaten, Tagessaetze sind Demo-Werte.
 *
 * Reproduzierbarkeit ruht auf zwei Saeulen:
 * 1. Stammdaten mit FESTEN UUIDs und `on conflict (id) do update` - ein
 *    zweiter Lauf schreibt dieselben Zeilen.
 * 2. Einsaetze ueber createEngagement mit FESTEN Idempotenz-Schluesseln - die
 *    Wiederholung ist damit per Konstruktion wirkungsfrei und liefert
 *    dieselben IDs zurueck, obwohl die IDs selbst zufaellig erzeugt werden.
 */
const P = "a0000000-0000-4000-8000-";

export const SEED_IDS = {
  organization: DEMO_ORG_ID,
  customers: {
    stadtwerke: `${P}000000000101`,
    genossenschaft: `${P}000000000102`,
  },
  worksites: {
    nordring: `${P}000000000201`,
    allee: `${P}000000000202`,
    innenhof: `${P}000000000203`,
    spielplatz: `${P}000000000204`,
  },
  employees: {
    anna: `${P}000000000301`,
    bernd: `${P}000000000302`,
    carla: `${P}000000000303`,
    dilan: `${P}000000000304`,
    erik: `${P}000000000305`,
  },
  resources: {
    hebebuehne: `${P}000000000401`,
    haecksler: `${P}000000000402`,
    pritsche: `${P}000000000403`,
    transporter: `${P}000000000404`,
    saegen: `${P}000000000405`,
    seilklettern: `${P}000000000406`,
  },
} as const;

const HINWEIS = "PROTOTYPE_ONLY Demo-Fixture";

export async function seed(db: Database): Promise<void> {
  const tenant = resolveTenant();
  // Fester Zeitanker: der Seed liegt vor allen Einsaetzen, sonst schluege die
  // Vergangenheitsregel zu.
  const deps = { db, tenant, clock: fixedClock("2026-09-01T08:00:00Z"), correlationId: "seed" };

  await db
    .insert(organizations)
    .values({
      id: SEED_IDS.organization,
      name: "Demo-Betrieb (Prototyp)",
      timeZone: "Europe/Berlin",
    })
    .onConflictDoUpdate({
      target: organizations.id,
      set: { name: "Demo-Betrieb (Prototyp)", timeZone: "Europe/Berlin" },
    });

  const kunden = [
    {
      id: SEED_IDS.customers.stadtwerke,
      name: "Stadtwerke Musterstadt",
      contact: "Frau Keller, 030 000000",
    },
    {
      id: SEED_IDS.customers.genossenschaft,
      name: "Wohnungsgenossenschaft Gruenblick eG",
      contact: "Herr Adam",
    },
  ];

  for (const kunde of kunden) {
    await db
      .insert(customers)
      .values({ ...kunde, orgId: tenant.orgId, notes: HINWEIS })
      .onConflictDoUpdate({
        target: customers.id,
        set: { name: kunde.name, contact: kunde.contact, notes: HINWEIS },
      });
  }

  const baustellen = [
    {
      id: SEED_IDS.worksites.nordring,
      customerId: SEED_IDS.customers.stadtwerke,
      name: "Parkanlage Nordring",
      addressLine: "Nordring 12",
      postalCode: "14467",
      city: "Potsdam",
      lat: 52.4009,
      lng: 13.0591,
      geocodeSource: "fixture" as const,
    },
    {
      id: SEED_IDS.worksites.allee,
      customerId: SEED_IDS.customers.stadtwerke,
      // Bewusst sehr lang: belegt das Abschneiden langer Namen in der UI.
      name: "Allee am Wasserwerk - Abschnitt West, Baumreihe 1-48",
      addressLine: "Zeppelinstrasse 140",
      postalCode: "14471",
      city: "Potsdam",
      lat: 52.3906,
      lng: 13.0335,
      geocodeSource: "fixture" as const,
    },
    {
      id: SEED_IDS.worksites.innenhof,
      customerId: SEED_IDS.customers.genossenschaft,
      name: "Innenhof Gruenblick",
      addressLine: "Kastanienweg 3",
      postalCode: "14482",
      city: "Potsdam",
      // Ohne Koordinaten: belegt den Manual-Pfad.
      lat: null,
      lng: null,
      geocodeSource: "manual" as const,
    },
    {
      id: SEED_IDS.worksites.spielplatz,
      customerId: SEED_IDS.customers.genossenschaft,
      name: "Spielplatz Suedhang",
      addressLine: "Suedhang 7",
      postalCode: "14478",
      city: "Potsdam",
      lat: 52.3762,
      lng: 13.1055,
      geocodeSource: "fixture" as const,
    },
  ];

  for (const baustelle of baustellen) {
    await db
      .insert(worksites)
      .values({ ...baustelle, orgId: tenant.orgId, notes: HINWEIS })
      .onConflictDoUpdate({
        target: worksites.id,
        set: {
          name: baustelle.name,
          addressLine: baustelle.addressLine,
          postalCode: baustelle.postalCode,
          city: baustelle.city,
          lat: baustelle.lat,
          lng: baustelle.lng,
          geocodeSource: baustelle.geocodeSource,
        },
      });
  }

  const personen = [
    {
      id: SEED_IDS.employees.anna,
      displayName: "Anna Bergmann",
      roleLabel: "Teamleitung",
      dailyCostMinorUnits: 32_000n,
    },
    {
      id: SEED_IDS.employees.bernd,
      displayName: "Bernd Kowalski",
      roleLabel: "Kletterer",
      dailyCostMinorUnits: 28_000n,
    },
    {
      id: SEED_IDS.employees.carla,
      displayName: "Carla Nguyen",
      roleLabel: "Bodenpersonal",
      dailyCostMinorUnits: 24_000n,
    },
    {
      id: SEED_IDS.employees.dilan,
      displayName: "Dilan Yildiz",
      roleLabel: "Baumpflege",
      dailyCostMinorUnits: 26_000n,
    },
    // Ohne Satz: belegt die Anzeige "fehlt" statt 0.
    {
      id: SEED_IDS.employees.erik,
      displayName: "Erik Sommer",
      roleLabel: "Aushilfe",
      dailyCostMinorUnits: null,
    },
  ];

  for (const person of personen) {
    await db
      .insert(employees)
      .values({ ...person, orgId: tenant.orgId, costNote: HINWEIS })
      .onConflictDoUpdate({
        target: employees.id,
        set: {
          displayName: person.displayName,
          roleLabel: person.roleLabel,
          dailyCostMinorUnits: person.dailyCostMinorUnits,
        },
      });
  }

  const geraete = [
    {
      id: SEED_IDS.resources.hebebuehne,
      kind: "machine",
      name: "Hebebuehne HB-18",
      dailyCostMinorUnits: 45_000n,
    },
    {
      id: SEED_IDS.resources.haecksler,
      kind: "machine",
      name: "Haecksler HX-9",
      dailyCostMinorUnits: 18_000n,
    },
    {
      id: SEED_IDS.resources.pritsche,
      kind: "vehicle",
      name: "Pritschenwagen P-BM 214",
      dailyCostMinorUnits: 12_000n,
    },
    {
      id: SEED_IDS.resources.transporter,
      kind: "vehicle",
      name: "Transporter P-BM 998",
      dailyCostMinorUnits: 11_000n,
    },
    {
      id: SEED_IDS.resources.saegen,
      kind: "equipment",
      name: "Motorsaegen-Set A",
      dailyCostMinorUnits: 3_000n,
    },
    {
      id: SEED_IDS.resources.seilklettern,
      kind: "equipment",
      name: "Seilklettersatz B",
      dailyCostMinorUnits: null,
    },
  ];

  for (const geraet of geraete) {
    await db
      .insert(resources)
      .values({ ...geraet, orgId: tenant.orgId, costNote: HINWEIS })
      .onConflictDoUpdate({
        target: resources.id,
        set: {
          kind: geraet.kind,
          name: geraet.name,
          dailyCostMinorUnits: geraet.dailyCostMinorUnits,
        },
      });
  }

  const einsaetze = [
    {
      key: "seed-engagement-1",
      worksiteId: SEED_IDS.worksites.nordring,
      title: "Baumpflege Herbstschnitt",
      startDate: "2026-09-07",
      endDate: "2026-09-18",
      colourKey: "moos",
      employeeIds: [SEED_IDS.employees.anna, SEED_IDS.employees.bernd, SEED_IDS.employees.carla],
      resourceIds: [SEED_IDS.resources.hebebuehne, SEED_IDS.resources.pritsche],
    },
    {
      key: "seed-engagement-2",
      worksiteId: SEED_IDS.worksites.allee,
      title: "Kronensicherung Allee",
      startDate: "2026-09-14",
      endDate: "2026-10-02",
      colourKey: "ocker",
      employeeIds: [SEED_IDS.employees.bernd, SEED_IDS.employees.dilan, SEED_IDS.employees.erik],
      resourceIds: [SEED_IDS.resources.haecksler, SEED_IDS.resources.saegen],
    },
    {
      key: "seed-engagement-3",
      worksiteId: SEED_IDS.worksites.innenhof,
      title: "Sturmschaden Sofortmassnahme",
      startDate: "2026-09-10",
      endDate: "2026-09-10",
      colourKey: "pflaume",
      employeeIds: [SEED_IDS.employees.anna, SEED_IDS.employees.dilan],
      resourceIds: [SEED_IDS.resources.transporter],
    },
    {
      key: "seed-engagement-4",
      worksiteId: SEED_IDS.worksites.spielplatz,
      title: "Spielplatz-Freischnitt (Wochenende)",
      startDate: "2026-09-18",
      endDate: "2026-09-21",
      colourKey: "petrol",
      employeeIds: [SEED_IDS.employees.carla, SEED_IDS.employees.erik],
      resourceIds: [SEED_IDS.resources.seilklettern],
      // Samstag ausdruecklich zugewaehlt (Wochenend-Opt-in, D-006).
      addedDays: ["2026-09-19"],
    },
  ];

  for (const einsatz of einsaetze) {
    const { key, ...command } = einsatz;
    await createEngagement(deps, command, { idempotencyKey: key });
  }
}
