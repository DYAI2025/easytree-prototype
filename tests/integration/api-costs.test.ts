import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { seed } from "../../scripts/seed-data";
import { GET as kostenRoute } from "../../src/app/api/einsaetze/[id]/kosten/route";
import { createDb } from "../../src/server/db/client";
import { setDbForTests } from "../../src/server/db/connection";

/**
 * Die Kostenroute entsteht ausserhalb des Plans (PA-09). Sie braucht denselben
 * Nachweis wie jede andere Route: echte Datenbank, echtes Wire-Format, und die
 * eine Regel, die nicht verhandelbar ist - eine fehlende Kostengrundlage
 * bleibt `null` und wird nie zu 0 (FR-020, H-03).
 */
const handle = createDb(process.env.DATABASE_URL_TEST as string, { max: 6 });
setDbForTests(handle);

afterAll(async () => {
  setDbForTests(undefined);
  await handle.close();
});

beforeEach(async () => {
  await handle.sql`truncate table organizations restart identity cascade`;
  await seed(handle.db);
});

describe("api-costs", () => {
  it("liefert fuer den Einsatz mit satzlosem Mitarbeiter null statt 0", async () => {
    const einsaetze = await handle.sql<{ id: string; title: string }[]>`
      select id, title from engagements order by title
    `;
    const kronensicherung = einsaetze.find((zeile) => zeile.title.startsWith("Kronensicherung"));

    expect(kronensicherung).toBeDefined();

    const antwort = await kostenRoute(
      new Request(`http://localhost/api/einsaetze/${kronensicherung!.id}/kosten`),
      { params: Promise.resolve({ id: kronensicherung!.id }) },
    );

    expect(antwort.status).toBe(200);

    const koerper = (await antwort.json()) as {
      complete: boolean;
      missingCount: number;
      ruleVersion: string;
      currency: string;
      totalMinorUnits: string;
      days: {
        date: string;
        positions: { subjectLabel: string; amountMinorUnits: string | null; missing: boolean }[];
      }[];
    };

    expect(koerper.ruleVersion).toBe("prototype-daily-rate-v1");
    expect(koerper.currency).toBe("EUR");
    expect(koerper.complete).toBe(false);

    // Der Einsatz hat 15 Tage; Erik Sommer hat keinen Satz - also 15 Luecken.
    expect(koerper.days).toHaveLength(15);
    expect(koerper.missingCount).toBe(15);

    // 28000 (Bernd) + 26000 (Dilan) + 18000 (Haecksler) + 3000 (Saegen) = 75000
    // je Tag, mal 15 Tage. Erik faellt heraus, statt als 0 mitzurechnen.
    expect(koerper.totalMinorUnits).toBe(`${75_000 * 15}`);

    const erikPositionen = koerper.days
      .flatMap((tag) => tag.positions)
      .filter((position) => position.subjectLabel === "Erik Sommer");

    expect(erikPositionen).toHaveLength(15);

    for (const position of erikPositionen) {
      expect(position.amountMinorUnits).toBeNull();
      expect(position.missing).toBe(true);
    }
  });

  it("meldet fuer einen Einsatz mit vollstaendigen Saetzen complete", async () => {
    const einsaetze = await handle.sql<{ id: string; title: string }[]>`
      select id, title from engagements order by title
    `;
    const baumpflege = einsaetze.find((zeile) => zeile.title.startsWith("Baumpflege"));

    const antwort = await kostenRoute(
      new Request(`http://localhost/api/einsaetze/${baumpflege!.id}/kosten`),
      { params: Promise.resolve({ id: baumpflege!.id }) },
    );

    const koerper = (await antwort.json()) as {
      complete: boolean;
      missingCount: number;
      totalMinorUnits: string;
    };

    expect(koerper.complete).toBe(true);
    expect(koerper.missingCount).toBe(0);
    // Anna 32000 + Bernd 28000 + Carla 24000 + Hebebuehne 45000
    // + Pritschenwagen 12000 = 141000 je Tag, zehn Tage.
    expect(koerper.totalMinorUnits).toBe(`${141_000 * 10}`);
  });
});
