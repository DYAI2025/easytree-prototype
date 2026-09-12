import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { seed, SEED_IDS } from "../../scripts/seed-data";
import { createDb } from "../../src/server/db/client";

const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
});

async function zaehle(tabelle: string): Promise<string> {
  const rows = await handle.sql<{ count: string }[]>`
    select count(*)::text as count from ${handle.sql(tabelle)}
  `;
  return rows[0]!.count;
}

async function ids(tabelle: string): Promise<string[]> {
  const rows = await handle.sql<{ id: string }[]>`
    select id from ${handle.sql(tabelle)} order by id
  `;
  return rows.map((row) => row.id);
}

describe("seed", () => {
  it("erzeugt die in Abschnitt 12 festgelegten Bestaende", async () => {
    await seed(handle.db);

    expect(await zaehle("organizations")).toBe("1");
    expect(await zaehle("customers")).toBe("2");
    expect(await zaehle("worksites")).toBe("4");
    expect(await zaehle("employees")).toBe("5");
    expect(await zaehle("resources")).toBe("6");
    expect(await zaehle("engagements")).toBe("4");
    // 10 + 15 + 1 + 3 = 29 Baustellentage
    expect(await zaehle("worksite_days")).toBe("29");
    expect(await zaehle("worksite_day_configurations")).toBe("29");
  });

  it("aendert beim ZWEITEN Lauf weder Zeilenzahlen noch IDs", async () => {
    await seed(handle.db);

    const vorher = {
      customers: await ids("customers"),
      worksites: await ids("worksites"),
      employees: await ids("employees"),
      resources: await ids("resources"),
      engagements: await ids("engagements"),
      worksiteDays: await ids("worksite_days"),
    };

    await seed(handle.db);

    expect(await ids("customers")).toEqual(vorher.customers);
    expect(await ids("worksites")).toEqual(vorher.worksites);
    expect(await ids("employees")).toEqual(vorher.employees);
    expect(await ids("resources")).toEqual(vorher.resources);
    // Der eigentliche Beweis: auch die per Command erzeugten IDs bleiben,
    // weil der Seed feste Idempotenz-Schluessel benutzt.
    expect(await ids("engagements")).toEqual(vorher.engagements);
    expect(await ids("worksiteDays".replace("worksiteDays", "worksite_days"))).toEqual(
      vorher.worksiteDays,
    );
    expect(await zaehle("worksite_days")).toBe("29");
  });

  it("legt die vier Einsaetze mit ihren Besonderheiten an", async () => {
    await seed(handle.db);

    const einsaetze = await handle.sql<{ title: string; colour_key: string; tage: string }[]>`
      select e.title, e.colour_key, count(d.id)::text as tage
      from engagements e join worksite_days d on d.engagement_id = e.id
      group by e.title, e.colour_key order by e.title
    `;

    expect(einsaetze).toEqual([
      { title: "Baumpflege Herbstschnitt", colour_key: "moos", tage: "10" },
      { title: "Kronensicherung Allee", colour_key: "ocker", tage: "15" },
      { title: "Spielplatz-Freischnitt (Wochenende)", colour_key: "petrol", tage: "3" },
      { title: "Sturmschaden Sofortmassnahme", colour_key: "pflaume", tage: "1" },
    ]);
  });

  it("enthaelt den zugewaehlten Samstag 2026-09-19", async () => {
    await seed(handle.db);

    const rows = await handle.sql<{ local_date: string }[]>`
      select d.local_date from worksite_days d
      join engagements e on e.id = d.engagement_id
      where e.title = 'Spielplatz-Freischnitt (Wochenende)'
      order by d.local_date
    `;

    expect(rows.map((r) => r.local_date)).toEqual(["2026-09-18", "2026-09-19", "2026-09-21"]);
  });

  it("deckt vollstaendige UND fehlende Kostengrundlagen ab", async () => {
    await seed(handle.db);

    const ohneSatz = await handle.sql<{ display_name: string }[]>`
      select display_name from employees where daily_cost_minor_units is null
    `;
    const ressourceOhneSatz = await handle.sql<{ name: string }[]>`
      select name from resources where daily_cost_minor_units is null
    `;

    expect(ohneSatz.map((r) => r.display_name)).toEqual(["Erik Sommer"]);
    expect(ressourceOhneSatz.map((r) => r.name)).toEqual(["Seilklettersatz B"]);
  });

  it("belegt den Manual-Pfad mit einer Baustelle ohne Koordinaten", async () => {
    await seed(handle.db);

    const rows = await handle.sql<{ name: string; geocode_source: string }[]>`
      select name, geocode_source from worksites where lat is null and lng is null
    `;

    expect(rows).toEqual([{ name: "Innenhof Gruenblick", geocode_source: "manual" }]);
  });

  it("nutzt durchgehend feste UUIDs mit dem vereinbarten Praefix", async () => {
    await seed(handle.db);

    const alle = [
      ...Object.values(SEED_IDS.customers),
      ...Object.values(SEED_IDS.worksites),
      ...Object.values(SEED_IDS.employees),
      ...Object.values(SEED_IDS.resources),
    ];

    expect(alle.every((id) => id.startsWith("a0000000-0000-4000-8000-"))).toBe(true);
    expect(new Set(alle).size).toBe(alle.length);
  });
});
