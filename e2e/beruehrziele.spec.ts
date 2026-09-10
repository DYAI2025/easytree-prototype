import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * EYT-176 / UX-073 - Mobile Bedienflaechen auf Mindestzielgroesse.
 *
 * Der Live-QA-Lauf QA-2026-09-09-01 hat bei 375 px und 325 px Bedienflaechen
 * unterhalb von 44x44 CSS-Pixeln gemessen, OBWOHL TASK-048 und TASK-049 bereits
 * 44-px-Gates enthalten. Diese Datei schliesst genau die Luecke, durch die der
 * Befund gefallen ist - sie schwaecht das bestehende Gate nicht ab, sie misst
 * an drei Stellen, an denen es nie gemessen hat:
 *
 * 1. INNERHALB der Drawer. `tastatur-zoom.spec.ts` prueft die Groessen
 *    ausschliesslich auf dem Raster (gridcell, tageskarte, mehr-karten,
 *    header nav a, monatswerkzeuge, tagesindikator, tagesliste) und oeffnet
 *    dabei keinen einzigen Dialog. Team- und Ressourcenzeilen, die Radios der
 *    Serienwahl und der Knopf "Schliessen" waren deshalb nie Teil der Messung.
 * 2. Bei 325 px. Das bestehende Groessengate laeuft nur bei 375 px; der
 *    320-px-Test daneben prueft ausschliesslich den Dokumentueberlauf, keine
 *    Zielgroessen. Der Tagesindikator ist genau dazwischen gerutscht: bei
 *    375 px 47 px breit, bei 325 px nur 39,9 px.
 * 3. An der EFFEKTIVEN Trefferflaeche. Eine Checkbox ist 13x13 px gross und
 *    wird das auch bleiben - bedient wird die Zeile, die sie umschliesst. Ob
 *    diese Zeile wirklich trifft, ist hier gemessen (`elementFromPoint` an
 *    allen vier Ecken und in der Mitte) und nicht behauptet.
 *
 * Der Filter `width > 0 && height > 0` aus dem TASK-049-Gate wird hier bewusst
 * NICHT uebernommen. Er entfernt ausschliesslich Elemente mit `display:none`
 * (Rechteck 0x0) - alle drei EYT-176-Befunde haben ein Rechteck ungleich null
 * und waeren von ihm nie verdeckt worden. Statt zu filtern, verlangt jede
 * Gruppe unten eine Mindestanzahl gemessener Ziele: eine Gruppe, die
 * verschwindet, faellt auf, statt still gruen zu werden.
 */
const PLANUNG = "/planung?monat=2026-09";
const TAG = "2026-09-10";

/** WCAG 2.5.5: 44x44 CSS-Pixel. Diese Zahl wird nicht verhandelt. */
const MINDESTZIEL = 44;

/**
 * Die Pflichtbreiten. 320 px ist keine Zugabe, sondern die Breite, auf die der
 * kanonische QA-Test "UX-073 - Reflow 320" heisst: WCAG 1.4.10 nennt 320 CSS-Px
 * als untere Grenze, und die Bedienflaechen muessen dort ebenso 44x44 erreichen
 * wie darueber. Bei 325 px war der Tagesindikator 44,4 px breit und damit
 * gruen - bei 320 px sind es 43,7. Ohne diese Breite bleibt genau diese
 * Luecke unbemerkt.
 */
const BREITEN = [375, 325, 320] as const;

interface Ziel {
  readonly element: string;
  readonly breite: number;
  readonly hoehe: number;
  /** Wohin die vier Ecken und die Mitte wirklich treffen. */
  readonly effektiv: string;
}

/**
 * Misst die REALE Bedienflaeche eines Selektors.
 *
 * Umschliesst ein `<label>` das Formularelement, ist das Label die
 * Bedienflaeche - ein Klick irgendwo darauf schaltet die Checkbox. Deshalb
 * wird hier nicht das 13x13 grosse `input` gemessen, sondern das, was der
 * Finger tatsaechlich trifft. `elementFromPoint` an fuenf Punkten belegt, dass
 * das gemessene Rechteck auch wirklich diese Bedienflaeche ist und nicht bloss
 * ein dekorativer Container um sie herum.
 */
async function ziele(page: Page, selektor: string): Promise<Ziel[]> {
  return page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel)).map((el) => {
      /*
       * Erst ins Sichtfeld holen, dann messen. `elementFromPoint` arbeitet in
       * Viewport-Koordinaten und liefert fuer alles ausserhalb `null` - eine
       * Bedienflaeche, die nur weiter unten steht, saehe sonst aus wie eine,
       * die gar nicht trifft. Die GROESSE aendert sich dabei nicht.
       */
      el.scrollIntoView({ block: "center", inline: "nearest" });

      const kasten = el.getBoundingClientRect();
      /*
       * Zwei Pixel Abstand zum Rand, nicht einer: bei gebrochenen Breiten
       * (eine Tageszelle ist 45,7 px breit) liegt der letzte Pixel genau auf
       * der Kante, und `elementFromPoint` liefert dort den Elternknoten. Das
       * waere eine Messeigenart, kein Fehlgriff.
       */
      const punkte: readonly [number, number][] = [
        [kasten.x + 2, kasten.y + 2],
        [kasten.right - 2, kasten.y + 2],
        [kasten.x + 2, kasten.bottom - 2],
        [kasten.right - 2, kasten.bottom - 2],
        [kasten.x + kasten.width / 2, kasten.y + kasten.height / 2],
      ];
      const treffer = punkte.map(([x, y]) => {
        const getroffen = document.elementFromPoint(x, y);

        if (getroffen === null) {
          return "leer";
        }

        return getroffen === el || el.contains(getroffen)
          ? "selbst"
          : getroffen.tagName.toLowerCase();
      });
      const name = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 40);

      return {
        element: `${sel} "${name}"`,
        breite: kasten.width,
        hoehe: kasten.height,
        effektiv: treffer.join(","),
      };
    });
  }, selektor);
}

/** Ein Bericht, den man lesen kann, statt eines nackten `false`. */
function bericht(viewport: number, gemessen: readonly Ziel[]): string[] {
  return gemessen
    .filter((z) => z.breite < MINDESTZIEL || z.hoehe < MINDESTZIEL)
    .map(
      (z) =>
        `${z.element} | Viewport ${viewport} | Width ${z.breite.toFixed(1)} | Height ${z.hoehe.toFixed(1)} | Effective target ${z.effektiv}`,
    );
}

/** Oeffnet den Tagesdrawer ueber die URL - ohne Maus, ohne Ratespiel. */
async function tagesdrawer(page: Page): Promise<void> {
  await page.goto(`${PLANUNG}&tag=${TAG}`);
  await expect(page.getByTestId("tagesliste")).toBeVisible();

  const id = await page
    .getByTestId("tagesliste")
    .getByTestId("tageskarte")
    .first()
    .getAttribute("data-worksite-day-id");

  expect(id).not.toBeNull();

  await page.goto(`${PLANUNG}&tag=${TAG}&drawer=tag&id=${id}`);
  await expect(page.getByTestId("tageskopf")).toBeVisible();
}

test.describe("EYT-176 Beruehrziele", () => {
  for (const viewport of BREITEN) {
    test(`bei ${viewport} px erreicht die Kompaktform des Rasters 44x44`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 800 });
      await page.goto(`${PLANUNG}&tag=${TAG}`);
      await expect(page.getByRole("grid")).toBeVisible();
      await expect(page.getByTestId("tagesliste")).toBeVisible();

      const indikatoren = await ziele(page, '[data-testid="tagesindikator"]');
      const listenkarten = await ziele(
        page,
        '[data-testid="tagesliste"] [data-testid="tageskarte"]',
      );

      // Ohne diese Schranken waere die Pruefung auch dann gruen, wenn die
      // Kompaktform gar nicht mehr existierte.
      expect(indikatoren.length).toBeGreaterThan(10);
      expect(listenkarten.length).toBeGreaterThan(0);

      expect(bericht(viewport, [...indikatoren, ...listenkarten])).toEqual([]);
    });

    test(`bei ${viewport} px erreichen die Bedienflaechen des Tagesdrawers 44x44`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 800 });
      await tagesdrawer(page);

      const team = await ziele(page, '[data-testid="drawer-team"] label');
      const ressourcen = await ziele(page, '[data-testid="drawer-ressourcen"] label');
      const scopes = await ziele(page, '[role="radiogroup"] label');
      const schliessen = await ziele(page, '[role="dialog"] [aria-label="Dialog schliessen"]');

      expect(team.length).toBeGreaterThan(2);
      expect(ressourcen.length).toBeGreaterThan(2);
      expect(scopes.length).toBe(2);
      expect(schliessen.length).toBe(1);

      expect(bericht(viewport, [...team, ...ressourcen, ...scopes, ...schliessen])).toEqual([]);
    });

    test(`bei ${viewport} px erreicht "Schliessen" im Einsatzdrawer 44x44`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 800 });
      await page.goto(`${PLANUNG}&drawer=neu`);
      await expect(page.getByRole("dialog", { name: "Einsatz anlegen" })).toBeVisible();

      const schliessen = await ziele(page, '[role="dialog"] [aria-label="Dialog schliessen"]');

      expect(schliessen.length).toBe(1);
      expect(bericht(viewport, schliessen)).toEqual([]);
    });

    test(`bei ${viewport} px laeuft das Dokument nicht horizontal ueber`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 800 });

      for (const [name, aufbau] of [
        [
          "raster",
          async () => {
            await page.goto(`${PLANUNG}&tag=${TAG}`);
            await expect(page.getByTestId("tagesliste")).toBeVisible();
          },
        ],
        ["tagesdrawer", async () => tagesdrawer(page)],
      ] as const) {
        await aufbau();

        const gemessen = await page.evaluate(() => {
          const wurzel = document.documentElement;
          const taeter: string[] = [];

          /*
           * Dieselbe Regel wie in `tastatur-zoom.spec.ts`: ein Element darf
           * ueber den Viewport hinausragen, WENN es in einem absichtlich
           * scrollenden Bereich liegt (der Kalender ist einer). Gemeldet wird
           * nur, was das DOKUMENT breit macht.
           */
          const inScrollbereich = (el: Element): boolean => {
            let vorfahre = el.parentElement;

            while (vorfahre !== null && vorfahre !== wurzel) {
              const ueberlaufX = window.getComputedStyle(vorfahre).overflowX;

              if (ueberlaufX === "auto" || ueberlaufX === "scroll" || ueberlaufX === "hidden") {
                return true;
              }

              vorfahre = vorfahre.parentElement;
            }

            return false;
          };

          for (const el of document.querySelectorAll("*")) {
            const kasten = el.getBoundingClientRect();

            if (
              kasten.width > 0 &&
              kasten.right > wurzel.clientWidth + 0.5 &&
              !inScrollbereich(el)
            ) {
              taeter.push(
                `${el.tagName.toLowerCase()}.${`${el.className}`.slice(0, 60)} right=${kasten.right.toFixed(1)}`,
              );
            }
          }

          return {
            scrollWidth: wurzel.scrollWidth,
            clientWidth: wurzel.clientWidth,
            taeter: [...new Set(taeter)].slice(0, 5),
          };
        });

        expect(
          `${name}: scrollWidth=${gemessen.scrollWidth} clientWidth=${gemessen.clientWidth} ueber=[${gemessen.taeter.join(" | ")}]`,
        ).toBe(`${name}: scrollWidth=${viewport} clientWidth=${viewport} ueber=[]`);
      }
    });
  }

  /*
   * Die Auswahlsemantik ist ausdruecklich NICHT Teil dieses Tickets - also
   * muss sie nachweislich unveraendert bleiben. Der Klick sitzt am AEUSSEREN
   * Rand der vergroesserten Zeile: genau dort, wo die alte 24-px-Zeile gar
   * nicht mehr war. Er darf trotzdem exakt eine Person schalten.
   */
  for (const [was, bereich] of [
    ["Person", "drawer-team"],
    ["Ressource", "drawer-ressourcen"],
  ] as const) {
    test(`die vergroesserte Zeile schaltet genau die gemeinte ${was}`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await tagesdrawer(page);

      const zeilen = page.locator(`[data-testid="${bereich}"] label`);
      const zweite = zeilen.nth(1);
      const kasten = await zweite.boundingBox();

      expect(kasten).not.toBeNull();
      expect(kasten!.height).toBeGreaterThanOrEqual(MINDESTZIEL);

      const zustand = async (): Promise<boolean[]> =>
        page
          .locator(`[data-testid="${bereich}"] input[type="checkbox"]`)
          .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).checked));

      const vorher = await zustand();

      // Unten rechts in der Zeile - ausserhalb der alten 24-px-Hoehe und weit
      // weg von der 13 px breiten Checkbox.
      await page.mouse.click(kasten!.x + kasten!.width - 4, kasten!.y + kasten!.height - 4);

      const nachher = await zustand();

      expect(nachher.length).toBe(vorher.length);
      expect(nachher.map((wert, i) => (wert === vorher[i] ? "gleich" : "gewechselt"))).toEqual(
        vorher.map((_, i) => (i === 1 ? "gewechselt" : "gleich")),
      );
    });
  }

  /*
   * Groessere Trefferflaechen duerfen sich nicht ueberlappen - sonst oeffnet
   * ein Griff auf den 7. den 8. September.
   */
  test("die Tagesindikatoren ueberlappen einander nicht", async ({ page }) => {
    await page.setViewportSize({ width: 325, height: 800 });
    await page.goto(`${PLANUNG}&tag=${TAG}`);
    await expect(page.getByRole("grid")).toBeVisible();

    const ueberlappungen = await page.evaluate(() => {
      const kaesten = Array.from(document.querySelectorAll('[data-testid="tagesindikator"]')).map(
        (el) => ({
          datum: el.closest('[role="gridcell"]')?.getAttribute("data-datum") ?? "?",
          r: el.getBoundingClientRect(),
        }),
      );
      const treffer: string[] = [];

      for (let i = 0; i < kaesten.length; i += 1) {
        for (let j = i + 1; j < kaesten.length; j += 1) {
          const a = kaesten[i]!.r;
          const b = kaesten[j]!.r;
          const schnittBreite = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const schnittHoehe = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

          if (schnittBreite > 0.5 && schnittHoehe > 0.5) {
            treffer.push(`${kaesten[i]!.datum} x ${kaesten[j]!.datum}`);
          }
        }
      }

      return treffer;
    });

    expect(ueberlappungen).toEqual([]);
  });
});

/*
 * Die Opt-in-Checkbox der Serienvorschau (EYT-176).
 *
 * Sie ist der einzige Bedienpunkt der Mobilflaeche OHNE umschliessendes Label:
 * gemessen 13x13 CSS-Pixel, und anders als bei den Team- und Ressourcenzeilen
 * gibt es hier keine groessere Flaeche, die den Griff auffinge. Die
 * Ausweichformel der Akzeptanz - "gleichwertige effektive Trefferflaeche" -
 * greift also nicht; die 44 px muessen wirklich da sein.
 *
 * Der Fall baut seine eigenen Daten in 2027-07, einem Monat, den keine andere
 * Spec plant. Alle Specs teilen EINE Datenbank (workers: 1); den Seed-September
 * hier zu veraendern wuerde `tagesbearbeitung.spec.ts` die Grundlage entziehen,
 * das spaeter im selben Lauf genau dort prueft.
 */
const SERIE_MONAT = "2027-07";

/*
 * Je Viewport eine EIGENE Woche. Beide Laeufe legen denselben Aufbau an, und
 * `POST /api/einsaetze` ist ueber den Idempotency-Key gesichert: derselbe
 * Schluessel mit anderem Fingerabdruck ist `409 IDEMPOTENCY_KEY_REUSED`. Mit
 * geteilten Daten scheiterte der zweite Lauf genau daran - gemessen, nicht
 * vermutet.
 */
const SERIE_WOCHEN = {
  375: ["2027-07-05", "2027-07-06", "2027-07-07", "2027-07-08", "2027-07-09"],
  325: ["2027-07-12", "2027-07-13", "2027-07-14", "2027-07-15", "2027-07-16"],
  320: ["2027-07-19", "2027-07-20", "2027-07-21", "2027-07-22", "2027-07-23"],
} as const satisfies Record<(typeof BREITEN)[number], readonly string[]>;

async function serieMitAngepasstemTagAufbauen(
  request: APIRequestContext,
  tage: readonly string[],
): Promise<string[]> {
  const personen = await request.get("/api/mitarbeitende");

  expect(personen.status()).toBe(200);

  const alle = ((await personen.json()) as { items: { id: string }[] }).items;

  expect(alle.length).toBeGreaterThan(1);

  const kunde = await request.post("/api/auftraggeber", {
    data: { name: `Beruehrziele-Auftraggeber ${tage[0]}` },
  });

  expect(kunde.status()).toBe(201);

  const baustelle = await request.post("/api/baustellen", {
    data: {
      customerId: ((await kunde.json()) as { id: string }).id,
      name: `Beruehrziele-Baustelle ${tage[0]}`,
      addressLine: "Messweg 44",
    },
  });

  expect(baustelle.status()).toBe(201);

  const einsatz = await request.post("/api/einsaetze", {
    headers: { "Idempotency-Key": `beruehrziele-${tage[0]}` },
    data: {
      worksiteId: ((await baustelle.json()) as { id: string }).id,
      title: `Beruehrziele-Einsatz ${tage[0]}`,
      startDate: tage[0],
      endDate: tage[4],
      colourKey: "moos",
      employeeIds: [alle[0]!.id, alle[1]!.id],
      resourceIds: [],
    },
  });

  expect(einsatz.status()).toBe(201);

  const angelegt = (await einsatz.json()) as { worksiteDayIds: string[]; localDates: string[] };

  expect(angelegt.localDates).toEqual([...tage]);

  // Tag 2 einzeln aendern - erst dadurch traegt er origin = 'day_edit' und
  // erscheint in der Vorschau als "individuell angepasst" MIT Checkbox.
  const einzeln = await request.post(
    `/api/baustellentage/${angelegt.worksiteDayIds[1]}/aenderungen`,
    {
      data: {
        scope: "ONLY_THIS_DAY",
        expectedRevisionNo: 1,
        changes: { employeeIds: [alle[0]!.id], resourceIds: [] },
      },
    },
  );

  expect(einzeln.status()).toBe(200);

  return angelegt.worksiteDayIds;
}

test.describe("EYT-176 Serienvorschau", () => {
  for (const viewport of BREITEN) {
    test(`bei ${viewport} px erreicht die Opt-in-Checkbox der Vorschau 44x44`, async ({
      page,
      request,
    }) => {
      const tage = SERIE_WOCHEN[viewport];
      const ids = await serieMitAngepasstemTagAufbauen(request, tage);

      await page.setViewportSize({ width: viewport, height: 800 });
      await page.goto(`/planung?monat=${SERIE_MONAT}&tag=${tage[0]}&drawer=tag&id=${ids[0]}`);
      await expect(page.getByTestId("tageskopf")).toBeVisible();

      // Eine inhaltliche Aenderung ist Pflicht: ohne sie ist "Vorschau
      // anzeigen ..." disabled und der Klick verpufft lautlos.
      await page.locator('[data-testid="drawer-team"] label').nth(1).click();
      await page.getByRole("radio", { name: /folgende Tage/ }).click();
      await page.getByRole("button", { name: /Vorschau anzeigen/ }).click();

      const vorschau = page.getByRole("table");

      await expect(vorschau).toBeVisible();
      const angepasst = `${tage[1]!.slice(8, 10)}.${tage[1]!.slice(5, 7)}.${tage[1]!.slice(0, 4)}`;

      await expect(vorschau.getByRole("row").filter({ hasText: angepasst })).toContainText(
        "individuell angepasst",
      );

      const kaesten = await ziele(page, 'table input[type="checkbox"]');
      const flaechen = await ziele(page, "table label");

      // Die Voraussetzung des Falls, gemessen statt behauptet: genau ein
      // Kasten, und genau eine Flaeche um ihn herum. Faellt die Flaeche weg,
      // faellt diese Zahl auf 0 - die Pruefung wird dann nicht still gruen.
      expect(kaesten.length).toBe(1);
      expect(flaechen.length).toBe(1);
      expect(bericht(viewport, flaechen)).toEqual([]);

      /*
       * Und die Flaeche muss auch wirklich schalten. Der Klick sitzt am
       * aeusseren Rand - dort, wo der 13 px breite Kasten nicht mehr ist.
       */
      const kasten = page.locator("table label");
      const rahmen = await kasten.boundingBox();
      const vorher = await page.locator('table input[type="checkbox"]').isChecked();

      await page.mouse.click(rahmen!.x + 3, rahmen!.y + 3);

      expect(await page.locator('table input[type="checkbox"]').isChecked()).toBe(!vorher);
    });
  }
});

/*
 * Die verbleibenden realen Bedienflaechen von UX-073.
 *
 * Der kanonische QA-Test verlangt allgemein "reale Bedienflaechen >= 44x44",
 * nicht nur die vier Flaechen, die im Jira-Beobachtungstext zufaellig
 * aufgezaehlt sind. Diese Gruppen sind im Produktionsbuild bei 375, 325 und
 * 320 px nachgemessen worden; jede hier gepruefte Zahl stand vorher unter 44.
 *
 * Was ausdruecklich NICHT geprueft wird, und warum:
 *
 * - Textlabels mit `htmlFor`. Sie leiten den Fokus weiter, sind aber kein
 *   Bedienelement. Deshalb steht ueberall `label:has(input…)`: gemessen wird
 *   nur ein Label, das seine Checkbox WIRKLICH umschliesst und damit die
 *   Trefferflaeche IST.
 * - Die Tabs des Kosten-Drawers. Die Voranalyse vermutete 42 px; gemessen sind
 *   es 81x66, 123,8x66 und 121,2x66 (375 px) bzw. 64x66 aufwaerts (320 px) -
 *   der Text bricht im schmalen Drawer auf zwei Zeilen. Kein Verstoss, also
 *   keine Reparatur und kein Test, der einen erfindet.
 */

/** Der Anlage-Assistent bis zu einem bestimmten Schritt. */
async function assistent(page: Page, schritt: 1 | 2 | 3, uhrzeiten = false): Promise<void> {
  await page.goto(`${PLANUNG}&drawer=neu`);

  const drawer = page.getByRole("dialog", { name: "Einsatz anlegen" });

  await expect(drawer.getByLabel("Titel", { exact: true })).toBeVisible();

  if (schritt === 1) {
    return;
  }

  await drawer.getByLabel("Titel", { exact: true }).fill("Beruehrziele Assistent");
  await drawer.getByLabel("Auftraggeber", { exact: true }).selectOption({ index: 1 });
  await drawer.getByLabel("Baustelle", { exact: true }).selectOption({ index: 1 });
  await drawer.getByRole("button", { name: "Weiter" }).click();
  await expect(drawer.getByLabel("Beginn", { exact: true })).toBeVisible();

  if (uhrzeiten) {
    await drawer.getByRole("checkbox", { name: /Uhrzeiten planen/ }).check();
    await expect(drawer.getByLabel("Geplanter Beginn", { exact: true })).toBeVisible();
  }

  if (schritt === 2) {
    return;
  }

  await drawer.getByLabel("Beginn", { exact: true }).fill("2027-11-01");
  await drawer.getByLabel("Ende", { exact: true }).fill("2027-11-05");
  await drawer.getByRole("button", { name: "Weiter" }).click();
  await expect(drawer.getByTestId("mitarbeitende")).toBeVisible();
}

/** Misst eine benannte Gruppe und verlangt, dass sie ueberhaupt existiert. */
async function gruppe(
  page: Page,
  viewport: number,
  selektor: string,
  mindestens: number,
): Promise<string[]> {
  const gemessen = await ziele(page, selektor);

  // Ohne diese Schranke waere jede Gruppe auch dann gruen, wenn der Selektor
  // nichts mehr findet - genau das Muster "filter -> leere Liste -> PASS".
  expect(gemessen.length, `${selektor} bei ${viewport} px`).toBeGreaterThanOrEqual(mindestens);

  return bericht(viewport, gemessen);
}

test.describe("EYT-176 Restflaechen", () => {
  for (const viewport of BREITEN) {
    test(`bei ${viewport} px erreichen die Zeitfelder des Tagesdrawers 44x44`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await tagesdrawer(page);

      expect(await gruppe(page, viewport, '[role="dialog"] input[type="time"]', 2)).toEqual([]);
    });

    test(`bei ${viewport} px erreichen die Felder von Assistent-Schritt 1 44x44`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await assistent(page, 1);

      expect(await gruppe(page, viewport, '[role="dialog"] select', 2)).toEqual([]);
      // `input:not([type])` gehoert dazu: ein Textfeld ohne type-Attribut IST
      // ein Textfeld, und der Titel des Assistenten hat keines. Ohne diesen
      // Zweig fand der Selektor nichts - die Zaehlschranke hat es gemeldet.
      expect(
        await gruppe(
          page,
          viewport,
          '[role="dialog"] input[type="text"], [role="dialog"] input:not([type])',
          1,
        ),
      ).toEqual([]);
    });

    test(`bei ${viewport} px erreichen die Felder von Assistent-Schritt 2 44x44`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await assistent(page, 2, true);

      expect(await gruppe(page, viewport, '[role="dialog"] input[type="date"]', 2)).toEqual([]);
      expect(await gruppe(page, viewport, '[role="dialog"] input[type="time"]', 2)).toEqual([]);
      expect(
        await gruppe(page, viewport, '[role="dialog"] label:has(input[type="checkbox"])', 2),
      ).toEqual([]);
    });

    test(`bei ${viewport} px erreichen die Felder von Assistent-Schritt 3 44x44`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await assistent(page, 3);

      expect(await gruppe(page, viewport, '[role="dialog"] input[type="search"]', 1)).toEqual([]);
      expect(
        await gruppe(page, viewport, '[data-testid="mitarbeitende"] label:has(input)', 3),
      ).toEqual([]);
      expect(
        await gruppe(page, viewport, '[data-testid="ressourcen"] label:has(input)', 3),
      ).toEqual([]);
    });

    test(`bei ${viewport} px erreicht die Auftraggeberauswahl 44x44`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto("/auftraggeber");
      await expect(page.getByRole("main")).toBeVisible();

      expect(await gruppe(page, viewport, 'button[aria-label$="auswaehlen"]', 1)).toEqual([]);
    });

    test(`bei ${viewport} px erreichen die Baustellenfelder 44x44`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto("/auftraggeber");
      await page.getByRole("button", { name: /Stadtwerke Musterstadt auswaehlen/ }).click();
      await page.getByRole("button", { name: "Neue Baustelle" }).click();

      const formular = page.getByRole("form", { name: "Neue Baustelle" });

      await expect(formular).toBeVisible();
      await formular.getByRole("button", { name: "Adresse manuell eingeben" }).click();
      await expect(formular.getByLabel("Adresse (manuell)")).toBeVisible();

      /*
       * `:not(:disabled)` ist keine Abschwaechung, sondern die Definition von
       * "Bedienflaeche": das Feld "Auftraggeber" dieses Formulars ist
       * `disabled readOnly` - es zeigt an, zu welchem Auftraggeber die
       * Baustelle gehoert, nimmt aber weder Klick noch Fokus. Es 44 px hoch zu
       * machen wuerde eine Bedienbarkeit behaupten, die es nicht gibt.
       */
      expect(
        await gruppe(
          page,
          viewport,
          'form input[type="text"]:not(:disabled), form input:not([type]):not(:disabled)',
          4,
        ),
      ).toEqual([]);
    });

    test(`bei ${viewport} px erreichen die Mitarbeitendenfelder 44x44`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto("/mitarbeitende");
      await page.getByRole("button", { name: "Neue Person anlegen" }).click();

      // Diese Formulare tragen keinen zugaenglichen Namen; ohne Namen gibt es
      // die Rolle `form` im Baum nicht. Deshalb der CSS-Selektor.
      const formular = page.locator("form");

      await expect(formular.getByLabel("Name", { exact: true })).toBeVisible();

      expect(
        await gruppe(
          page,
          viewport,
          'form input[type="text"]:not(:disabled), form input:not([type]):not(:disabled)',
          2,
        ),
      ).toEqual([]);
      expect(await gruppe(page, viewport, 'form label:has(input[type="checkbox"])', 1)).toEqual([]);
    });

    test(`bei ${viewport} px erreichen die Ressourcenfelder 44x44`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto("/ressourcen");
      await page.getByRole("button", { name: "Neue Ressource anlegen" }).click();

      // Diese Formulare tragen keinen zugaenglichen Namen; ohne Namen gibt es
      // die Rolle `form` im Baum nicht. Deshalb der CSS-Selektor.
      const formular = page.locator("form");

      await expect(formular.getByLabel("Name", { exact: true })).toBeVisible();

      expect(await gruppe(page, viewport, "form select", 1)).toEqual([]);
      expect(
        await gruppe(
          page,
          viewport,
          'form input[type="text"]:not(:disabled), form input:not([type]):not(:disabled)',
          2,
        ),
      ).toEqual([]);
      expect(await gruppe(page, viewport, 'form label:has(input[type="checkbox"])', 1)).toEqual([]);
    });
  }

  /*
   * Der Skip-Link ist im Ruhezustand `sr-only` - unsichtbar und damit keine
   * Bedienflaeche. Im Fokus wird er sichtbar und anklickbar; DANN gilt die
   * Schwelle. Gemessen wurde er unfokussiert mit 32x16 - diese Zahl ist
   * ausdruecklich KEIN Befund und wird hier deshalb auch nicht geprueft.
   */
  test("der Skip-Link erreicht im Fokus 44x44", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(PLANUNG);
    await expect(page.getByRole("grid")).toBeVisible();

    await page.keyboard.press("Tab");

    const imFokus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;

      if (el === null || el.getAttribute("href") !== "#hauptinhalt") {
        return null;
      }

      const kasten = el.getBoundingClientRect();

      return {
        breite: Math.round(kasten.width * 10) / 10,
        hoehe: Math.round(kasten.height * 10) / 10,
        sichtbar: getComputedStyle(el).clipPath,
      };
    });

    // Die Voraussetzung: der Skip-Link ist wirklich das erste Tabziel.
    expect(imFokus).not.toBeNull();
    expect(`Skip-Link | Viewport 320 | Width ${imFokus!.breite} | Height ${imFokus!.hoehe}`).toBe(
      `Skip-Link | Viewport 320 | Width ${imFokus!.breite} | Height ${imFokus!.hoehe}`,
    );
    expect(imFokus!.breite).toBeGreaterThanOrEqual(MINDESTZIEL);
    expect(imFokus!.hoehe).toBeGreaterThanOrEqual(MINDESTZIEL);
  });
});

/*
 * Die Bedienung nach der Vergroesserung - Nachweis, nicht Zuversicht.
 *
 * Eine hoehere Flaeche kann drei Dinge kaputt machen: sie kann die Eingabe
 * verschlucken, sie kann den Nachbarn mit ausloesen, und sie kann eine
 * Auswahl auf das falsche Element legen. Alle drei werden hier gemessen.
 */
test.describe("EYT-176 Bedienung nach der Vergroesserung", () => {
  /*
   * Was hier bewiesen wird - und was ausdruecklich NICHT.
   *
   * EYT-176 verantwortet die FLAECHE: ein Griff in den Streifen, den die
   * Untergrenze hinzugefuegt hat, muss das Feld erreichen, und das Feld muss
   * per Tastatur erreichbar und aenderbar bleiben. Genau das steht unten.
   *
   * Nicht geprueft wird die segmentweise Eingabe per synthetischem Tastendruck
   * (`keyboard.type("0815")`, `ArrowUp`). Sie schlaegt in diesem headless
   * Chromium auch an einem NACKTEN `<input type="time">` ohne jede Klasse
   * dieses Projekts fehl - gemessen mit 24 px und mit 44 px Hoehe, beide Male
   * mit demselben leeren Ergebnis. Die Hoehe hat damit nachweislich nichts zu
   * tun; eine Zusicherung darauf wuerde eine Eigenart des Testwerkzeugs
   * beschreiben, nicht das Produkt.
   */
  test("die Zeitfelder bleiben per Zeiger und per Tastatur bedienbar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await tagesdrawer(page);

    const drawer = page.getByRole("dialog");
    const beginn = drawer.getByLabel("Beginn", { exact: true });
    const ende = drawer.getByLabel("Ende", { exact: true });
    const kasten = await beginn.boundingBox();

    expect(kasten!.height).toBeGreaterThanOrEqual(MINDESTZIEL);

    /*
     * Zeiger: der Klick sitzt 3 px ueber der Unterkante, also in dem Streifen,
     * den es vor der Untergrenze gar nicht gab (vorher 42 px). Er muss GENAU
     * dieses Feld fokussieren - nicht das Feld darunter und nicht ins Leere.
     */
    await page.mouse.click(kasten!.x + 20, kasten!.y + kasten!.height - 3);

    const getroffen = await page.evaluate(() => ({
      typ: document.activeElement?.getAttribute("type") ?? null,
      id: document.activeElement?.id ?? null,
    }));

    expect(getroffen.typ).toBe("time");
    expect(getroffen.id).toBe(await beginn.getAttribute("id"));

    // Der Wert ist aenderbar und wieder leerbar - der Fluss "Arbeitszeit ist
    // optional" bleibt unveraendert.
    await beginn.fill("08:15");
    await expect(beginn).toHaveValue("08:15");
    await ende.fill("17:30");
    await expect(ende).toHaveValue("17:30");
    await beginn.fill("");
    await expect(beginn).toHaveValue("");
    await expect(drawer.getByRole("button", { name: "Speichern" })).toBeEnabled();

    // Tastatur: ohne Maus erreichbar. `.focus()` waere kein Nachweis - es
    // beweist nicht, dass das Feld im Tabweg ueberhaupt vorkommt.
    await drawer.getByLabel("Hinweis", { exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");

    expect(await page.evaluate(() => document.activeElement?.getAttribute("type"))).toBe("time");
  });

  test("die Selects des Assistenten waehlen weiter genau den gemeinten Eintrag", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await assistent(page, 1);

    const drawer = page.getByRole("dialog", { name: "Einsatz anlegen" });
    const auftraggeber = drawer.getByLabel("Auftraggeber", { exact: true });
    const baustelle = drawer.getByLabel("Baustelle", { exact: true });

    // Der zugaengliche Name ist unveraendert - `getByLabel` findet die Felder
    // ueberhaupt nur darueber.
    await expect(auftraggeber).toBeVisible();
    await expect(baustelle).toBeVisible();

    await auftraggeber.selectOption({ label: "Stadtwerke Musterstadt" });
    await expect(auftraggeber).toHaveValue(/.+/);

    const gewaehlt = await auftraggeber.evaluate(
      (el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? "",
    );

    expect(gewaehlt).toBe("Stadtwerke Musterstadt");

    // Die Baustellenliste folgt der Wahl - die Kopplung ist unveraendert.
    await baustelle.selectOption({ index: 1 });
    await expect(baustelle).toHaveValue(/.+/);
    /*
     * Das Aufklappmenue eines nativen `select` zeichnet das Betriebssystem,
     * nicht das Dokument - es ist im DOM nicht messbar. Geprueft ist deshalb,
     * was pruefbar ist: dass die Auswahl ankommt und dass das Feld selbst nicht
     * beschnitten wird.
     */
    const sichtbarkeit = await baustelle.evaluate((el) => {
      const kasten = el.getBoundingClientRect();
      const eltern = el.parentElement!.getBoundingClientRect();

      return {
        passtHinein: kasten.right <= eltern.right + 0.5 && kasten.bottom <= eltern.bottom + 0.5,
        hoehe: Math.round(kasten.height * 10) / 10,
      };
    });

    expect(sichtbarkeit.passtHinein).toBe(true);
    expect(sichtbarkeit.hoehe).toBeGreaterThanOrEqual(MINDESTZIEL);
  });

  test("die Auftraggeberauswahl trifft genau einen Datensatz", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/auftraggeber");

    const knoepfe = page.locator('button[aria-label$="auswaehlen"]');

    /*
     * KEINE absolute Anzahl: alle Specs teilen eine Datenbank, und die
     * Serienvorschau-Faelle weiter oben legen selbst Auftraggeber an. Eine
     * Zusicherung auf "genau 2" war gruen, solange sie allein lief, und rot im
     * vollen Lauf - gemessen. Geprueft wird deshalb ein NAMENTLICH bekannter
     * Eintrag aus dem Seed.
     */
    await expect(knoepfe.first()).toBeVisible();
    expect(await knoepfe.count()).toBeGreaterThanOrEqual(2);

    const name = "Wohnungsgenossenschaft Gruenblick eG";
    const ziel = page.locator(`button[aria-label="${name} auswaehlen"]`);
    const kasten = await ziel.boundingBox();

    expect(kasten!.height).toBeGreaterThanOrEqual(MINDESTZIEL);

    // Klick 2 px ueber der Unterkante: in dem Streifen, den die Untergrenze
    // hinzugefuegt hat, und damit so nah am Nachbarn wie moeglich.
    await page.mouse.click(kasten!.x + kasten!.width / 2, kasten!.y + kasten!.height - 2);

    await expect(page.getByRole("heading", { name: `Baustellen von ${name}` })).toBeVisible();

    // Genau EINE Zeile ist markiert - keine Nachbarflaeche hat mitgefeuert.
    await expect(page.locator('button[aria-label$="auswaehlen"][aria-current="true"]')).toHaveCount(
      1,
    );
    await expect(ziel).toHaveAttribute("aria-current", "true");
  });

  /*
   * Die Tabs des Kosten-Drawers sind NICHT geaendert worden - gemessen 66 px
   * hoch, weil der Text im schmalen Drawer auf zwei Zeilen bricht. Dieser Test
   * haelt genau das fest: die Voranalyse vermutete 42 px, die Messung sagt
   * etwas anderes, und beides steht hier nachpruefbar statt in einer Fussnote.
   */
  test("die Kosten-Tabs sind schon gross genug und bleiben eindeutig", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await tagesdrawer(page);
    await page.getByRole("button", { name: "Kosten anzeigen" }).click();
    await expect(page.getByTestId("kostenkopf")).toBeVisible();

    expect(await gruppe(page, 320, '[role="tab"]', 3)).toEqual([]);

    const tabs = page.getByRole("tab");

    await tabs.nth(1).click();
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

    // Tastaturnavigation unveraendert: Pfeil rechts rueckt einen Tab weiter.
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);

    const ueberlappungen = await page.evaluate(() => {
      const kaesten = [...document.querySelectorAll('[role="tab"]')].map((el) =>
        el.getBoundingClientRect(),
      );
      const treffer: string[] = [];

      for (let i = 0; i < kaesten.length; i += 1) {
        for (let j = i + 1; j < kaesten.length; j += 1) {
          const bw =
            Math.min(kaesten[i]!.right, kaesten[j]!.right) -
            Math.max(kaesten[i]!.left, kaesten[j]!.left);
          const bh =
            Math.min(kaesten[i]!.bottom, kaesten[j]!.bottom) -
            Math.max(kaesten[i]!.top, kaesten[j]!.top);

          if (bw > 0.5 && bh > 0.5) {
            treffer.push(`${i}x${j}`);
          }
        }
      }

      return treffer;
    });

    expect(ueberlappungen).toEqual([]);
  });

  /*
   * Der Indikator waechst bei 320 px um 0,3 px in den eigenen Zellrahmen
   * hinein. Genau dort muss bewiesen sein, dass die Flaechen sich trotzdem
   * nicht beruehren - der 325-px-Test daneben reicht dafuer nicht.
   */
  test("die Tagesindikatoren ueberlappen auch bei 320 px nicht", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${PLANUNG}&tag=${TAG}`);
    await expect(page.getByRole("grid")).toBeVisible();

    const messung = await page.evaluate(() => {
      const kaesten = [...document.querySelectorAll('[data-testid="tagesindikator"]')].map(
        (el) => ({
          datum: el.closest('[role="gridcell"]')?.getAttribute("data-datum") ?? "?",
          r: el.getBoundingClientRect(),
        }),
      );
      const treffer: string[] = [];

      for (let i = 0; i < kaesten.length; i += 1) {
        for (let j = i + 1; j < kaesten.length; j += 1) {
          const a = kaesten[i]!.r;
          const b = kaesten[j]!.r;
          const bw = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const bh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

          if (bw > 0.5 && bh > 0.5) {
            treffer.push(`${kaesten[i]!.datum} x ${kaesten[j]!.datum}`);
          }
        }
      }

      return { anzahl: kaesten.length, treffer };
    });

    expect(messung.anzahl).toBeGreaterThan(10);
    expect(messung.treffer).toEqual([]);
  });

  /*
   * Und der Griff muss den richtigen Tag treffen. Der Klick sitzt am rechten
   * Rand des Indikators - dort, wo die 0,3 px hinzugekommen sind.
   */
  test("bei 320 px oeffnet der Griff am Rand genau seinen Tag", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${PLANUNG}`);
    await expect(page.getByRole("grid")).toBeVisible();

    const ziel = page.locator(
      `[role="gridcell"][data-datum="2026-09-11"] [data-testid="tagesindikator"]`,
    );
    const kasten = await ziel.boundingBox();

    expect(kasten!.width).toBeGreaterThanOrEqual(MINDESTZIEL);

    await page.mouse.click(kasten!.x + kasten!.width - 1, kasten!.y + kasten!.height / 2);

    await expect(page.getByTestId("tagesliste")).toBeVisible();
    await expect(page.getByTestId("tagesliste")).toContainText("11. September 2026");
    expect(new URL(page.url()).searchParams.get("tag")).toBe("2026-09-11");
  });
});

/* ------------------------------------------------------------------------- *
 * EYT-176 Nachtrag: Assistent-Schritt 2 (Live-Retest QA-2026-09-10-01)
 *
 * Der unabhaengige Chrome-Lauf hat an zwei Stellen gemessen, an denen die
 * bestehenden Gates strukturell nicht messen KONNTEN:
 *
 * 1. Die Tageszeilen unter "Tage anpassen (optional)". Der Helfer `assistent`
 *    weiter oben oeffnet den Picker nie - und koennte es auch gar nicht: er
 *    fuellt fuer Schritt 2 KEINE Datumswerte, und `StepPeriod` rendert den
 *    Picker nur bei `pickerOffen && zeitraumGueltig`. Die Zaehlschranke der
 *    Gruppe `label:has(input[type="checkbox"])` stand auf 2 und war durch die
 *    beiden Schalter "Ende offen" und "Uhrzeiten planen" bereits erfuellt -
 *    eine dritte, fehlende Gruppe fiel deshalb nicht auf. Gemessen wurden hier
 *    24 Zeilen zu 156x24 (375), 131x24 (325) und 128,5x24 (320) CSS-Pixeln.
 *
 * 2. Der horizontale Ueberlauf INNERHALB des Drawers. Beide bestehenden
 *    Reflow-Pruefungen messen `document.documentElement`. Der Drawer traegt
 *    aber `overflow-y-auto`; nach CSS 2.1 rechnet ein nicht-sichtbarer Wert auf
 *    einer Achse die andere Achse auf `auto` hoch. Der Ueberlauf bleibt damit
 *    IM Dialog und erreicht das Dokument nie: gemessen `document.scrollWidth`
 *    = 325 bei `dialog.scrollWidth` = 344. Zusaetzlich haelt der Helfer
 *    `inScrollbereich` alles innerhalb eines scrollenden Vorfahren aus der
 *    Taeterliste heraus - der Dialog IST einer.
 *
 * Beide Luecken werden hier geschlossen, ohne eine bestehende Schwelle zu
 * senken: gemessen wird zusaetzlich, nicht anders.
 * ------------------------------------------------------------------------- */

/** Erster Tag des Assistenten-Zeitraums - nach dem Zeitanker, also erlaubt. */
const PICKER_START = "2026-09-07";
const PICKER_ENDE = "2026-09-30";

/**
 * Der Assistent bis Schritt 2 MIT geoeffneter Tagesliste.
 *
 * Anders als `assistent(page, 2)` werden Beginn und Ende wirklich gesetzt:
 * ohne gueltigen Zeitraum rendert `StepPeriod` den Picker auch im geoeffneten
 * Zustand nicht - genau daran ist die bisherige Messung vorbeigelaufen.
 */
async function tagePicker(page: Page): Promise<void> {
  await page.goto(`${PLANUNG}&drawer=neu`);

  const drawer = page.getByRole("dialog", { name: "Einsatz anlegen" });

  await drawer.getByLabel("Titel", { exact: true }).fill("Tage-anpassen Messung");
  await drawer.getByLabel("Auftraggeber", { exact: true }).selectOption({ index: 1 });
  await drawer.getByLabel("Baustelle", { exact: true }).selectOption({ index: 1 });
  await drawer.getByRole("button", { name: "Weiter" }).click();

  await expect(drawer.getByLabel("Beginn", { exact: true })).toBeVisible();
  await drawer.getByLabel("Beginn", { exact: true }).fill(PICKER_START);
  await drawer.getByLabel("Ende", { exact: true }).fill(PICKER_ENDE);
  await drawer.getByRole("button", { name: "Tage anpassen (optional)" }).click();
  await expect(page.getByTestId("tage-picker")).toBeVisible();
}

test.describe("EYT-176 Assistent Schritt 2 - Tage anpassen", () => {
  for (const viewport of BREITEN) {
    test(`bei ${viewport} px erreicht jede Tageszeile von "Tage anpassen" 44x44`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await tagePicker(page);

      const gemessen = await ziele(page, '[data-testid="tage-picker"] label');

      /*
       * Der Zeitraum 07.09. bis 30.09.2026 hat 24 Kalendertage. Die Schranke
       * steht bewusst darunter und nicht auf Gleichheit: sie soll einen
       * verschwundenen Selektor melden, nicht die Kalenderarithmetik
       * nachbauen. Ohne sie waere eine leere Liste stumm gruen.
       */
      expect(gemessen.length, `Tageszeilen bei ${viewport} px`).toBeGreaterThanOrEqual(20);

      // Jede gemessene Zeile IST die Bedienflaeche - das Label umschliesst
      // seine Checkbox. `effektiv` belegt das an allen vier Ecken.
      for (const z of gemessen) {
        expect(z.effektiv, `${z.element} bei ${viewport} px`).toBe(
          "selbst,selbst,selbst,selbst,selbst",
        );
      }

      expect(bericht(viewport, gemessen)).toEqual([]);
    });

    test(`bei ${viewport} px laeuft der Drawer in Schritt 2 nicht horizontal ueber`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await tagePicker(page);

      const gemessen = await page.evaluate(() => {
        const wurzel = document.documentElement;
        const dialog = document.querySelector('[role="dialog"]');

        if (dialog === null) {
          throw new Error("Kein Dialog im Dokument");
        }

        const dialogKasten = dialog.getBoundingClientRect();
        /*
         * Was hier als "operabel" zaehlt: alles, was Klick oder Tastatur
         * annimmt. Der reine Text daneben darf umbrechen und tut das auch -
         * er ist keine Bedienflaeche und gehoert nicht in diese Liste.
         */
        const bedienbar = Array.from(
          dialog.querySelectorAll("input, select, textarea, button, [role='radio']"),
        );
        const hinaus = bedienbar
          .filter((el) => {
            const k = el.getBoundingClientRect();

            return k.width > 0 && k.right > dialogKasten.right + 0.5;
          })
          .map((el) => {
            const k = el.getBoundingClientRect();
            const name =
              el.getAttribute("aria-label") ??
              el.getAttribute("id") ??
              (el.textContent ?? "").trim().slice(0, 30);

            return `${el.tagName.toLowerCase()}#${name} right=${k.right.toFixed(1)} > ${dialogKasten.right.toFixed(1)}`;
          });

        return {
          dialogScrollWidth: dialog.scrollWidth,
          dialogClientWidth: dialog.clientWidth,
          docScrollWidth: wurzel.scrollWidth,
          docClientWidth: wurzel.clientWidth,
          bedienbareAnzahl: bedienbar.length,
          hinaus: [...new Set(hinaus)].slice(0, 6),
        };
      });

      // Ohne diese Schranke waere die Pruefung auch dann gruen, wenn der
      // Schritt gar nicht aufgebaut war.
      expect(gemessen.bedienbareAnzahl).toBeGreaterThan(20);

      expect(
        `${viewport}: dialog scrollWidth=${gemessen.dialogScrollWidth} clientWidth=${gemessen.dialogClientWidth} | doc scrollWidth=${gemessen.docScrollWidth} clientWidth=${gemessen.docClientWidth} | hinaus=[${gemessen.hinaus.join(" | ")}]`,
      ).toBe(
        `${viewport}: dialog scrollWidth=${gemessen.dialogClientWidth} clientWidth=${gemessen.dialogClientWidth} | doc scrollWidth=${gemessen.docClientWidth} clientWidth=${gemessen.docClientWidth} | hinaus=[]`,
      );
    });
  }

  /*
   * Die Vergroesserung darf die Auswahlsemantik nicht verschieben. Der Klick
   * sitzt am UNTEREN Rand der Zeile - genau dort, wo die alte 24-px-Zeile
   * nicht mehr war.
   */
  test("ein Klick im neu hinzugekommenen unteren Bereich schaltet genau diesen Tag", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await tagePicker(page);

    const picker = page.getByTestId("tage-picker");
    const vorher = await picker
      .locator("input[type=checkbox]")
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).checked));
    const zaehlerVorher = await page.getByTestId("arbeitstage").innerText();

    // "Do 10.09.2026" ist ein abgeleiteter Werktag und steht auf true.
    const zeile = picker.locator("label", { hasText: "Do 10.09.2026" });
    const kasten = await zeile.boundingBox();

    expect(kasten!.height).toBeGreaterThanOrEqual(MINDESTZIEL);

    await page.mouse.click(kasten!.x + 20, kasten!.y + kasten!.height - 3);

    const nachher = await picker
      .locator("input[type=checkbox]")
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).checked));
    const geaendert = vorher
      .map((wert, i) => (wert === nachher[i] ? null : i))
      .filter((i): i is number => i !== null);

    // GENAU eine Zeile - die Nachbarn bleiben unangetastet.
    expect(geaendert).toEqual([3]);
    expect(await page.getByTestId("arbeitstage").innerText()).not.toBe(zaehlerVorher);
  });

  test("ein Klick zwischen zwei Zeilen schaltet nichts", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await tagePicker(page);

    const picker = page.getByTestId("tage-picker");
    const vorher = await picker
      .locator("input[type=checkbox]")
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).checked));

    const oben = await picker.locator("label", { hasText: "Mo 07.09.2026" }).boundingBox();
    const unten = await picker.locator("label", { hasText: "Mi 09.09.2026" }).boundingBox();

    // Der Zwischenraum der Gitterzeilen (gap-1 = 4 px). Ist er verschwunden,
    // ueberlappen die Zeilen - dann meldet diese Zusicherung das.
    const luecke = unten!.y - oben!.y - oben!.height;

    expect(luecke).toBeGreaterThan(1);

    await page.mouse.click(oben!.x + 20, oben!.y + oben!.height + luecke / 2);

    const nachher = await picker
      .locator("input[type=checkbox]")
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).checked));

    expect(nachher).toEqual(vorher);
  });

  test("die Tageszeilen bleiben per Tastatur bedienbar", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await tagePicker(page);

    const kasten = page.getByTestId("tage-picker").locator("input[type=checkbox]").nth(3);

    await kasten.focus();
    await expect(kasten).toBeFocused();

    const vorher = await kasten.isChecked();

    await page.keyboard.press("Space");

    expect(await kasten.isChecked()).toBe(!vorher);
  });
});

/* ------------------------------------------------------------------------- *
 * EYT-176 Nachtrag: Ressourcenliste mit langem Namen
 *
 * Der Chrome-Lauf mass auf `/ressourcen` bei 325 und 320 px einen
 * `document.scrollWidth` von rund 363 - der ausloesende Datensatz gehoerte
 * aber nicht zum Seed. Gegen den frischen Seed ist dort KEIN Ueberlauf: 375,
 * 325 und 320 messen jeweils scrollWidth = clientWidth. Der urspruengliche
 * Befund ist damit datenabhaengig.
 *
 * Reproduzierbar ist er trotzdem - ueber den normalen Anlagepfad und ohne
 * jede Sonderbehandlung des konkreten Strings: ein zusammenhaengender langer
 * Name (die Validierung von `POST /api/ressourcen` nimmt ihn an) sprengt die
 * Zeile, weil das Namensfeld der Zeile ein Flex-Kind mit `min-width: auto`
 * ist und deshalb nicht unter seine min-content-Breite schrumpft. Gemessen
 * vor der Reparatur: scrollWidth 630 bei clientWidth 320 - und ebenso bei 375.
 * ------------------------------------------------------------------------- */
const LANGER_RESSOURCENNAME = "Mobiltestressourcemitbesonderslangemzusammenhaengendemnamen";

test.describe("EYT-176 Ressourcenliste", () => {
  for (const viewport of BREITEN) {
    test(`bei ${viewport} px sprengt ein langer Ressourcenname die Seite nicht`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width: viewport, height: 800 });

      /*
       * Je Viewport ein EIGENER Name. Alle drei Laeufe teilen eine Datenbank,
       * und `hasText` sucht auf Teilzeichenketten - ein gemeinsamer Name
       * faende im zweiten Lauf zwei Zeilen statt einer.
       */
      const name = `${LANGER_RESSOURCENNAME}${viewport}`;

      const angelegt = await request.post("/api/ressourcen", {
        data: { kind: "equipment", name, active: true },
      });

      expect(angelegt.status()).toBe(201);

      const id = ((await angelegt.json()) as { id: string }).id;

      try {
        await page.goto("/ressourcen");
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByTestId("ressourcenname").filter({ hasText: name })).toHaveCount(1);

        const gemessen = await page.evaluate(() => {
          const wurzel = document.documentElement;
          const taeter: string[] = [];

          for (const el of document.querySelectorAll("*")) {
            const kasten = el.getBoundingClientRect();

            if (kasten.width > 0 && kasten.right > wurzel.clientWidth + 0.5) {
              taeter.push(
                `${el.tagName.toLowerCase()}.${`${el.className}`.slice(0, 45)} right=${kasten.right.toFixed(1)}`,
              );
            }
          }

          return {
            scrollWidth: wurzel.scrollWidth,
            clientWidth: wurzel.clientWidth,
            taeter: [...new Set(taeter)].slice(0, 5),
          };
        });

        expect(
          `${viewport}: scrollWidth=${gemessen.scrollWidth} clientWidth=${gemessen.clientWidth} ueber=[${gemessen.taeter.join(" | ")}]`,
        ).toBe(`${viewport}: scrollWidth=${viewport} clientWidth=${viewport} ueber=[]`);
      } finally {
        /*
         * `/api/ressourcen` kennt kein DELETE - der Datensatz bleibt also im
         * gemeinsamen Lauf stehen. Er wird deshalb auf einen kurzen, neutralen
         * Namen zurueckgesetzt und stillgelegt, damit keine spaetere Spec eine
         * lange Zeile oder eine aktive Fremdressource vorfindet.
         *
         * `kind` MUSS mit: `UpsertResourceCommand` verlangt es auch beim
         * PATCH. Ohne das Feld antwortet die Route 422 - und das Aufraeumen
         * waere stillschweigend ausgefallen. Der Status wird deshalb geprueft:
         * ein misslungenes Aufraeumen soll auffallen, nicht die naechste Spec
         * vergiften.
         */
        const aufgeraeumt = await request.patch(`/api/ressourcen/${id}`, {
          data: { kind: "equipment", name: `EYT-176 Restposten ${viewport}`, active: false },
        });

        expect(aufgeraeumt.status()).toBe(200);
      }
    });
  }
});

/* ---------------------------------------------------------------------------
 * EYT-176 F1/F2 - ein GUELTIGER langer Ressourcenname in den Planungsflaechen.
 *
 * Der Live-Chrome-Retest EYT-176-LIVE-RETEST-02 hat zwei Flaechen gefunden, an
 * denen derselbe Name, den `/ressourcen` inzwischen vertraegt, weiterhin die
 * Breite sprengt: der Tagesdrawer und Schritt 3 des Einsatzassistenten.
 * Gemessen wurde dort dialog.scrollWidth 551 gegen clientWidth 374 (375 px),
 * 324 (325 px) und 319 (320 px) - immer dieselben 551, denn eine
 * min-content-Breite haengt nicht am Viewport.
 *
 * Warum das DOKUMENT dabei gruen blieb und der bestehende 320-px-Reflowtest den
 * Befund nicht sah: `Dialog.Content` traegt `overflow-y-auto`. Ist eine der
 * beiden Achsen nicht `visible`, rechnet CSS die andere von `visible` auf
 * `auto` - der Drawer scrollt also selbst horizontal und haelt den Ueberlauf
 * vom Dokument fern. Ein Reflowtest auf `documentElement` ist in einem Dialog
 * strukturell blind; deshalb misst dieser Block JEDE Scrollflaeche zwischen
 * Zeile und Dialog einzeln.
 * ------------------------------------------------------------------------- */

interface Zeilenmass {
  /** Wie viele Zeilen den gesuchten Namen tragen - 1 ist die einzige richtige Antwort. */
  readonly anzahl: number;
  /** Wie viele Ressourcenzeilen die Flaeche ueberhaupt zeigt. */
  readonly zeilenGesamt: number;
  readonly text: string;
  readonly dokScrollWidth: number;
  readonly dokClientWidth: number;
  readonly dialogScrollWidth: number;
  readonly dialogClientWidth: number;
  readonly inhaltsRechts: number;
  readonly zeileRechts: number;
  readonly zeileBreite: number;
  readonly zeileHoehe: number;
  readonly kaestchenBreite: number;
  readonly kaestchenHoehe: number;
  readonly nameRechts: number;
  readonly nameBreite: number;
  readonly nameHoehe: number;
  /** Wohin die vier Ecken und die Mitte der Zeile wirklich treffen. */
  readonly treffer: readonly string[];
  /** Scrollflaechen zwischen Zeile und Dialog, die horizontal ueberlaufen. */
  readonly scrollflaechen: readonly string[];
}

/**
 * Misst die Ressourcenzeile mit dem gesuchten Namen innerhalb ihres Dialogs.
 *
 * Der Name ist vor der Reparatur ein nackter Textknoten im Label und hat
 * deshalb gar kein Element, das man messen koennte. Ein `Range` ab hinter der
 * Checkbox misst ihn trotzdem - und misst nach der Reparatur unveraendert
 * dasselbe, wenn dort ein `<span>` steht. So vergleicht der Gegenversuch in
 * Phase 7 wirklich dieselbe Groesse und nicht zwei verschiedene Messverfahren.
 */
async function ressourcenzeile(page: Page, name: string): Promise<Zeilenmass> {
  return page.evaluate((gesucht) => {
    const alleZeilen = Array.from(document.querySelectorAll("label")).filter(
      (label) =>
        label.querySelector('input[type="checkbox"]') !== null &&
        label.closest('[role="dialog"]') !== null,
    );
    const treffer = alleZeilen.filter((label) => (label.textContent ?? "").includes(gesucht));
    const zeile = treffer[0];

    if (zeile === undefined) {
      throw new Error(
        `Keine Ressourcenzeile mit "${gesucht}" im Dialog. Gefunden: ${alleZeilen.length} Zeilen.`,
      );
    }

    const dialog = zeile.closest('[role="dialog"]');

    if (dialog === null) {
      throw new Error("Zeile liegt nicht in einem Dialog.");
    }

    zeile.scrollIntoView({ block: "center", inline: "nearest" });

    const kaestchen = zeile.querySelector('input[type="checkbox"]');

    if (kaestchen === null) {
      throw new Error("Zeile ohne Checkbox.");
    }

    const bereich = document.createRange();

    bereich.selectNodeContents(zeile);
    bereich.setStartAfter(kaestchen);

    const zeilenKasten = zeile.getBoundingClientRect();
    const dialogKasten = dialog.getBoundingClientRect();
    const kaestchenKasten = kaestchen.getBoundingClientRect();
    const nameKasten = bereich.getBoundingClientRect();

    const punkte: readonly [number, number][] = [
      [zeilenKasten.x + 2, zeilenKasten.y + 2],
      [zeilenKasten.right - 2, zeilenKasten.y + 2],
      [zeilenKasten.x + 2, zeilenKasten.bottom - 2],
      [zeilenKasten.right - 2, zeilenKasten.bottom - 2],
      [zeilenKasten.x + zeilenKasten.width / 2, zeilenKasten.y + zeilenKasten.height / 2],
    ];

    /*
     * Jede Scrollflaeche zwischen Zeile und Dialog einzeln. Der Dialog selbst
     * ist eine davon; ein zwischengeschobener Container mit eigenem
     * `overflow` waere sonst der naechste blinde Fleck.
     */
    const scrollflaechen: string[] = [];

    for (let el: Element | null = zeile; el !== null; el = el.parentElement) {
      const stil = getComputedStyle(el);

      if (stil.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 0.5) {
        scrollflaechen.push(
          `${el.tagName.toLowerCase()}[overflow-x:${stil.overflowX}] ${el.scrollWidth}>${el.clientWidth}`,
        );
      }

      if (el === dialog) {
        break;
      }
    }

    return {
      anzahl: treffer.length,
      zeilenGesamt: alleZeilen.length,
      text: (zeile.textContent ?? "").trim(),
      dokScrollWidth: document.documentElement.scrollWidth,
      dokClientWidth: document.documentElement.clientWidth,
      dialogScrollWidth: dialog.scrollWidth,
      dialogClientWidth: dialog.clientWidth,
      // Die INHALTSkante, nicht die Randkante: eine sichtbare Bildlaufleiste
      // gehoert nicht zur nutzbaren Breite.
      inhaltsRechts: dialogKasten.left + dialog.clientWidth,
      zeileRechts: zeilenKasten.right,
      zeileBreite: zeilenKasten.width,
      zeileHoehe: zeilenKasten.height,
      kaestchenBreite: kaestchenKasten.width,
      kaestchenHoehe: kaestchenKasten.height,
      nameRechts: nameKasten.right,
      nameBreite: nameKasten.width,
      nameHoehe: nameKasten.height,
      treffer: punkte.map(([x, y]) => {
        const getroffen = document.elementFromPoint(x, y);

        if (getroffen === null) {
          return "leer";
        }

        return getroffen === zeile || zeile.contains(getroffen)
          ? "selbst"
          : getroffen.tagName.toLowerCase();
      }),
      scrollflaechen: [...new Set(scrollflaechen)],
    };
  }, name);
}

/** Ein Satz, der alle Zusicherungen dieser Flaeche in einem Vergleich buendelt. */
function zeilenbefund(mass: Zeilenmass): string {
  return [
    mass.dokScrollWidth <= mass.dokClientWidth
      ? "dokument ok"
      : `dokument ueber ${mass.dokScrollWidth}>${mass.dokClientWidth}`,
    mass.dialogScrollWidth <= mass.dialogClientWidth
      ? "dialog ok"
      : `dialog ueber ${mass.dialogScrollWidth}>${mass.dialogClientWidth}`,
    mass.scrollflaechen.length === 0
      ? "scrollflaechen ok"
      : `scrollflaechen ${mass.scrollflaechen.join(" / ")}`,
    mass.zeileRechts <= mass.inhaltsRechts + 0.5
      ? "zeile ok"
      : `zeile ueber ${mass.zeileRechts.toFixed(1)}>${mass.inhaltsRechts.toFixed(1)}`,
    mass.nameRechts <= mass.inhaltsRechts + 0.5 && mass.nameBreite > 0 && mass.nameHoehe > 0
      ? "name ok"
      : `name ${mass.nameBreite.toFixed(1)}x${mass.nameHoehe.toFixed(1)} rechts ${mass.nameRechts.toFixed(1)}>${mass.inhaltsRechts.toFixed(1)}`,
    mass.zeileHoehe >= MINDESTZIEL ? "hoehe ok" : `hoehe ${mass.zeileHoehe.toFixed(1)}`,
    mass.zeileBreite >= MINDESTZIEL ? "breite ok" : `breite ${mass.zeileBreite.toFixed(1)}`,
    mass.treffer.every((t) => t === "selbst") ? "treffer ok" : `treffer ${mass.treffer.join(",")}`,
    mass.kaestchenBreite >= 10 && mass.kaestchenHoehe >= 10
      ? "kaestchen ok"
      : `kaestchen ${mass.kaestchenBreite.toFixed(1)}x${mass.kaestchenHoehe.toFixed(1)}`,
  ].join(" | ");
}

const BEFUND_OK =
  "dokument ok | dialog ok | scrollflaechen ok | zeile ok | name ok | hoehe ok | breite ok | treffer ok | kaestchen ok";

/**
 * Legt eine Ressource ueber die Route an, die auch das Stammdatenformular
 * benutzt, und raeumt sie danach auf einen kurzen, stillgelegten Namen zurueck.
 *
 * `/api/ressourcen` kennt kein DELETE, und alle Specs teilen eine Datenbank -
 * ohne dieses Aufraeumen faende die naechste Spec eine fremde lange Zeile vor.
 */
async function mitLangerRessource(
  request: APIRequestContext,
  name: string,
  lauf: (id: string) => Promise<void>,
): Promise<void> {
  const angelegt = await request.post("/api/ressourcen", {
    data: { kind: "equipment", name, active: true },
  });

  expect(angelegt.status()).toBe(201);

  const id = ((await angelegt.json()) as { id: string }).id;

  try {
    await lauf(id);
  } finally {
    const aufgeraeumt = await request.patch(`/api/ressourcen/${id}`, {
      data: { kind: "equipment", name: `EYT-176 Restposten ${id.slice(0, 8)}`, active: false },
    });

    expect(aufgeraeumt.status()).toBe(200);
  }
}

/**
 * Bedienprobe der jetzt umbrechenden Zeile (EYT-176, Phase 6).
 *
 * Drei Fragen, drei Messungen statt einer Behauptung: trifft ein Klick weit
 * neben der 13x13 grossen Checkbox noch diese Zeile, bleibt dabei GENAU eine
 * Ressource geschaltet, und loest der Zwischenraum zwischen zwei Zeilen
 * wirklich nichts aus. Der Umbruch macht die Zeile hoeher - genau deshalb
 * wird unten rechts geklickt und nicht in der Mitte: das ist die Stelle, die
 * es vor der Reparatur gar nicht gab.
 */
async function bedienprobe(
  page: Page,
  liste: Locator,
  name: string,
  flaeche: string,
): Promise<void> {
  const zustand = async (): Promise<boolean[]> =>
    liste
      .locator("input[type=checkbox]")
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).checked));

  const zeile = liste.locator("label").filter({ hasText: name });

  await expect(zeile, `${flaeche}: genau eine Zeile "${name}"`).toHaveCount(1);
  await zeile.scrollIntoViewIfNeeded();

  const kasten = await zeile.boundingBox();

  expect(kasten, `${flaeche}: Zeilenkasten`).not.toBeNull();

  const vorher = await zustand();

  // Zaehlschranke: eine leere Liste wuerde jede Differenzpruefung unten still
  // erfuellen.
  expect(vorher.length, `${flaeche}: Auswahlkaestchen`).toBeGreaterThanOrEqual(2);

  await page.mouse.click(kasten!.x + kasten!.width - 8, kasten!.y + kasten!.height - 6);

  const nachher = await zustand();
  const geaendert = vorher
    .map((wert, i) => (wert === nachher[i] ? null : i))
    .filter((i): i is number => i !== null);

  expect(geaendert.length, `${flaeche}: geschaltete Zeilen`).toBe(1);
  await expect(liste.getByRole("checkbox", { name })).toBeChecked();

  /*
   * Der Zwischenraum wird an der NACHBARZEILE der gemessenen Zeile geprueft,
   * nicht an der ersten beliebigen Luecke der Liste. Der Grund ist gemessen
   * und kein Vorsichtsprinzip: die Liste ist laenger als der Viewport, die
   * erste Luecke lag ausserhalb, und ein Mausklick dort traf nichts mehr im
   * Dialog - Radix wertete das als Klick nach aussen und SCHLOSS den Drawer.
   * Der Test haette damit eine Eigenart der Messstelle gemeldet, nicht das
   * Verhalten des Zwischenraums. Beide Zeilen liegen deshalb nachweislich im
   * Sichtfeld, bevor geklickt wird.
   */
  const alle = liste.locator("label");
  const anzahl = await alle.count();
  const index = await alle.evaluateAll(
    (els, gesucht) => els.findIndex((el) => (el.textContent ?? "").includes(gesucht)),
    name,
  );

  expect(index, `${flaeche}: Index der Zeile`).toBeGreaterThanOrEqual(0);
  expect(anzahl, `${flaeche}: Zeilen fuer die Zwischenraumprobe`).toBeGreaterThanOrEqual(2);

  const partner = index + 1 < anzahl ? index + 1 : index - 1;

  await alle.nth(Math.min(index, partner)).scrollIntoViewIfNeeded();
  await alle.nth(Math.max(index, partner)).scrollIntoViewIfNeeded();

  const eins = await alle.nth(Math.min(index, partner)).boundingBox();
  const zwei = await alle.nth(Math.max(index, partner)).boundingBox();

  expect(eins, `${flaeche}: obere Zeile`).not.toBeNull();
  expect(zwei, `${flaeche}: untere Zeile`).not.toBeNull();

  const sicht = page.viewportSize();

  expect(sicht, `${flaeche}: Viewport`).not.toBeNull();
  expect(eins!.y, `${flaeche}: obere Zeile im Sichtfeld`).toBeGreaterThanOrEqual(0);
  expect(zwei!.y + zwei!.height, `${flaeche}: untere Zeile im Sichtfeld`).toBeLessThanOrEqual(
    sicht!.height,
  );

  // Ist der Zwischenraum verschwunden, ueberlappen die Zeilen - dann meldet
  // diese Zusicherung das, statt den Klick ins Leere laufen zu lassen.
  const luecke = zwei!.y - eins!.y - eins!.height;

  expect(luecke, `${flaeche}: Zwischenraum zwischen zwei Zeilen`).toBeGreaterThan(1);

  const vorLuecke = await zustand();

  await page.mouse.click(eins!.x + 20, eins!.y + eins!.height + luecke / 2);

  expect(await zustand(), `${flaeche}: Klick im Zwischenraum`).toEqual(vorLuecke);
}

test.describe("EYT-176 Langer Ressourcenname im Tagesdrawer", () => {
  for (const viewport of BREITEN) {
    test(`bei ${viewport} px bleibt der Tagesdrawer mit langem Ressourcennamen im Rahmen`, async ({
      page,
      request,
    }) => {
      const name = `${LANGER_RESSOURCENNAME}Tag${viewport}`;

      await mitLangerRessource(request, name, async (id) => {
        await page.setViewportSize({ width: viewport, height: 800 });
        await tagesdrawer(page);

        const drawer = page.getByRole("dialog", { name: "Baustellentag" });
        const liste = drawer.getByTestId("drawer-ressourcen");

        await expect(liste).toBeVisible();
        await expect(liste.getByRole("checkbox", { name })).toHaveCount(1);

        const mass = await ressourcenzeile(page, name);

        // Zaehlschranken: eine verschwundene Zeile oder eine leere Liste soll
        // auffallen, statt still gruen zu werden.
        expect(mass.anzahl, `Zeilen mit "${name}"`).toBe(1);
        expect(mass.zeilenGesamt, "Auswahlzeilen im Tagesdrawer").toBeGreaterThanOrEqual(2);

        // Der gespeicherte Fachwert steht ungekuerzt in der Zeile.
        expect(mass.text).toContain(name);

        expect(`Tagesdrawer ${viewport}: ${zeilenbefund(mass)}`).toBe(
          `Tagesdrawer ${viewport}: ${BEFUND_OK}`,
        );

        await bedienprobe(page, liste, name, `Tagesdrawer ${viewport}`);

        // Der Wert in der Datenbank bleibt unangetastet - keine Kuerzung, keine
        // nachtraegliche Laengenvalidierung zur Layoutrettung.
        const gelesen = await request.get(`/api/ressourcen`);

        expect(gelesen.status()).toBe(200);
        expect(
          ((await gelesen.json()) as { items: { id: string; name: string }[] }).items.find(
            (r) => r.id === id,
          )?.name,
        ).toBe(name);
      });
    });
  }
});

test.describe("EYT-176 Langer Ressourcenname in Assistent-Schritt 3", () => {
  for (const viewport of BREITEN) {
    test(`bei ${viewport} px bleibt Schritt 3 mit langem Ressourcennamen im Rahmen`, async ({
      page,
      request,
    }) => {
      const name = `${LANGER_RESSOURCENNAME}Schritt${viewport}`;

      await mitLangerRessource(request, name, async (id) => {
        await page.setViewportSize({ width: viewport, height: 800 });
        await assistent(page, 3);

        const drawer = page.getByRole("dialog", { name: "Einsatz anlegen" });
        const liste = drawer.getByTestId("ressourcen");

        await expect(liste).toBeVisible();
        await expect(liste.getByRole("checkbox", { name })).toHaveCount(1);

        const mass = await ressourcenzeile(page, name);

        expect(mass.anzahl, `Zeilen mit "${name}"`).toBe(1);
        expect(mass.zeilenGesamt, "Auswahlzeilen in Schritt 3").toBeGreaterThanOrEqual(2);
        expect(mass.text).toContain(name);

        expect(`Assistent Schritt 3 ${viewport}: ${zeilenbefund(mass)}`).toBe(
          `Assistent Schritt 3 ${viewport}: ${BEFUND_OK}`,
        );

        await bedienprobe(page, liste, name, `Assistent Schritt 3 ${viewport}`);

        // Der Zaehler sieht die Auswahl - die Zeile ist also nicht nur
        // angehakt, sondern auch fachlich angekommen.
        await expect(drawer.getByTestId("auswahlzaehler")).toContainText("1 Ressource");

        /*
         * Die Suche filtert die MITARBEITENDEN und laesst die Ressourcen
         * stehen. Beides wird gemessen: dass sie ueberhaupt noch filtert, und
         * dass sie die lange Ressourcenzeile nicht mitnimmt.
         */
        const personenVorher = await drawer.getByTestId("mitarbeitende").locator("li").count();

        expect(personenVorher).toBeGreaterThanOrEqual(2);

        await drawer.getByLabel("Mitarbeitende suchen").fill("zzz-kein-treffer");
        await expect(drawer.getByTestId("mitarbeitende").locator("li")).toHaveCount(0);
        await expect(liste.getByRole("checkbox", { name })).toBeChecked();

        await drawer.getByLabel("Mitarbeitende suchen").fill("");
        await expect(drawer.getByTestId("mitarbeitende").locator("li")).toHaveCount(personenVorher);

        const gelesen = await request.get(`/api/ressourcen`);

        expect(gelesen.status()).toBe(200);
        expect(
          ((await gelesen.json()) as { items: { id: string; name: string }[] }).items.find(
            (r) => r.id === id,
          )?.name,
        ).toBe(name);
      });
    });
  }
});
