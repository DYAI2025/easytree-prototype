import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * TASK-048 - Tastatur- und Zoom-Audit (AC-14, REQ-NF-002, REQ-NF-003).
 *
 * Vier Zusicherungen, die der Prototyp bisher nirgends belegt hat:
 *
 * 1. Ein VOLLSTAENDIGER Einsatz entsteht ausschliesslich mit der Tastatur.
 *    Kein `click`, kein `mouse`, kein `fill`, kein `check` - die Kontrollen
 *    werden ertabbt und mit Enter, Space, Pfeiltasten und echten Anschlaegen
 *    bedient. Ein Test, der die Daten per API anlegt und nur den letzten Knopf
 *    per Tastatur drueckt, wuerde nichts ueber Bedienbarkeit aussagen.
 * 2. Bei 320x800 laeuft das DOKUMENT nicht horizontal ueber - auf der Planung,
 *    mit offenem Einsatzdrawer und in der Kostenansicht.
 * 3. Bei 375 px sind die Tagesaktionsflaechen mindestens 44x44 CSS-Pixel -
 *    gemessen mit `getBoundingClientRect`, nicht an Klassennamen abgelesen.
 * 4. axe findet auf den fuenf Flaechen aus Plan TASK-048 keinen wcag2a/2aa-
 *    Verstoss.
 *
 * Die Drawer werden ueber die URL geoeffnet und nicht angeklickt. Das geht
 * erst, seit der Ansichtszustand in der URL steht (B-05), und haelt diese
 * Datei frei von Mausinteraktion.
 */
const PLANUNG = "/planung?monat=2026-09";

/** Eigener, sonst unbelegter Monat: alle anderen Specs planen in 2026-08..2027-01. */
const TASTATUR_MONAT = "2027-03";
const TASTATUR_TITEL = "Tastaturanlage AC-14";
const TASTATUR_START = "2027-03-01";
const TASTATUR_ENDE = "2027-03-05";
/** Reihenfolge der Segmente von `input[type=date]`; Chromium rendert sie in der UI-Sprache. */
const TASTATUR_START_TASTEN = "03012027";
const TASTATUR_ENDE_TASTEN = "03052027";
const TASTATUR_TAGE = ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05"];

const PERSON = "Anna Bergmann";
const RESSOURCE = "Hebebuehne HB-18";

/** WCAG 2.5.5: 44x44 CSS-Pixel. Diese Zahl wird nicht verhandelt. */
const MINDESTFLAECHE = 44;

interface Fokus {
  readonly tag: string;
  readonly typ: string | null;
  readonly rolle: string | null;
  readonly label: string;
  readonly wert: string | null;
}

/** Beschreibt, was gerade den Fokus traegt - ohne den Fokus zu veraendern. */
async function fokus(page: Page): Promise<Fokus> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;

    if (el === null || el === document.body) {
      return { tag: "body", typ: null, rolle: null, label: "", wert: null };
    }

    const eingabe = el as HTMLInputElement;
    const label =
      eingabe.labels?.[0]?.textContent?.trim() ??
      el.getAttribute("aria-label") ??
      (el.textContent ?? "").trim();

    return {
      tag: el.tagName.toLowerCase(),
      typ: el.getAttribute("type"),
      rolle: el.getAttribute("role"),
      label,
      wert: typeof eingabe.value === "string" ? eingabe.value : null,
    };
  });
}

/**
 * Tabbt, bis das gesuchte Bedienelement den Fokus traegt.
 *
 * Prueft VOR dem ersten Tab: das Ziel kann schon fokussiert sein. Findet die
 * Suche nichts, nennt der Fehler die tatsaechlich besuchten Stationen - sonst
 * waere ein kaputter Tabpfad nicht zu diagnostizieren.
 */
async function tabBis(
  page: Page,
  treffer: (f: Fokus) => boolean,
  was: string,
  maximum = 60,
): Promise<Fokus> {
  const besucht: string[] = [];

  for (let i = 0; i < maximum; i += 1) {
    const jetzt = await fokus(page);

    if (treffer(jetzt)) {
      return jetzt;
    }

    besucht.push(`${jetzt.tag}/${jetzt.typ ?? "-"}/"${jetzt.label.slice(0, 40)}"`);
    await page.keyboard.press("Tab");
  }

  throw new Error(`Kein Tabstopp fuer ${was}. Besucht: ${besucht.join(" -> ")}`);
}

/**
 * Zeichnet jede echte Zeigereingabe auf.
 *
 * Tastaturaktivierung erzeugt in Chromium ein `click` mit `detail === 0` und
 * NIE ein `pointerdown`/`mousedown`. Ein leeres Protokoll ist damit der
 * Laufzeitbeweis dafuer, dass die Anlage ohne Maus zustande kam.
 */
async function zeigerProtokollStarten(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const protokoll: string[] = [];

    (window as unknown as { __zeiger: string[] }).__zeiger = protokoll;

    for (const typ of ["mousedown", "mouseup", "mousemove", "pointerdown", "pointerup", "click"]) {
      document.addEventListener(
        typ,
        (ereignis) => {
          const maus = ereignis as MouseEvent;

          if (typ === "click" && maus.detail === 0) {
            return;
          }

          protokoll.push(`${typ}(detail=${maus.detail}, trusted=${ereignis.isTrusted})`);
        },
        true,
      );
    }
  });
}

async function zeigerProtokoll(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __zeiger: string[] }).__zeiger ?? []);
}

/** Alle Elemente eines Selektors mit ihren echten Browsermassen. */
async function masse(
  page: Page,
  selektor: string,
): Promise<{ beschreibung: string; breite: number; hoehe: number }[]> {
  return page.evaluate((sel) => {
    return (
      Array.from(document.querySelectorAll(sel))
        /*
         * Nur SICHTBARE Elemente sind Bedienflaechen.
         *
         * Seit der Kompaktform (Plan 6.2) stehen die Desktop-Tageskarten
         * unterhalb des md-Umbruchs auf `display:none`; ihr Rechteck ist dann
         * 0x0. Sie als "zu klein" zu zaehlen behauptete einen Fehlgriff auf
         * einer Flaeche, die auf dem Telefon gar nicht existiert - der Test
         * mass eine Darstellung, die niemand sieht.
         *
         * Das ist KEINE Lockerung: die Schwelle bleibt bei 44 px, und die
         * Bedienflaechen, die auf dieser Breite wirklich da sind - der
         * Kompaktindikator und die Karten der Tagesliste - werden unten
         * ausdruecklich mitgemessen.
         */
        .filter((el) => {
          const kasten = el.getBoundingClientRect();

          return kasten.width > 0 && kasten.height > 0;
        })
        .map((el) => {
          const kasten = el.getBoundingClientRect();

          return {
            beschreibung: `${sel} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`,
            breite: kasten.width,
            hoehe: kasten.height,
          };
        })
    );
  }, selektor);
}

/**
 * Meldet den horizontalen Ueberlauf des DOKUMENTS und - falls vorhanden - die
 * Elemente, die ueber den Viewport hinausragen. Eine nackte Zahl waere nicht
 * reparierbar.
 */
async function ueberlauf(
  page: Page,
): Promise<{ scrollWidth: number; clientWidth: number; taeter: string[] }> {
  return page.evaluate(() => {
    const wurzel = document.documentElement;
    const taeter: string[] = [];

    /*
     * Ein Element darf ueber den Viewport hinausragen, WENN es in einem
     * absichtlich scrollbaren Bereich liegt - der Kalender und die
     * Kostentabellen tun das. Gemeldet wird nur, was das DOKUMENT breit
     * macht: also Elemente ohne scrollenden Vorfahren.
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

    for (const el of Array.from(document.querySelectorAll("*"))) {
      const kasten = el.getBoundingClientRect();

      if (kasten.width > 0 && kasten.right > wurzel.clientWidth + 0.5 && !inScrollbereich(el)) {
        taeter.push(
          `${el.tagName.toLowerCase()}.${`${el.className}`.slice(0, 60)} right=${kasten.right.toFixed(1)}`,
        );
      }
    }

    return {
      scrollWidth: wurzel.scrollWidth,
      clientWidth: wurzel.clientWidth,
      taeter: taeter.slice(0, 10),
    };
  });
}

/** Die Id eines geseedeten Einsatzes - fuer den Direktaufruf der Kostenansicht. */
async function einsatzId(page: Page): Promise<string> {
  await page.goto(PLANUNG);

  const id = await page
    .locator('[role="gridcell"][data-datum="2026-09-07"]')
    .getByTestId("tageskarte")
    .first()
    .getAttribute("data-engagement-id");

  expect(id).toMatch(/^[0-9a-f-]{36}$/);

  return id!;
}

test.describe("tastatur-und-zoom", () => {
  test("AC-14: ein vollstaendiger Einsatz entsteht ausschliesslich per Tastatur", async ({
    page,
    request,
  }) => {
    /*
     * Die verbotenen Aufrufe stehen absichtlich zusammengesetzt da: als
     * Klartext wuerde die Liste sich selbst finden und die Pruefung waere
     * immer rot.
     */
    const verboten = [
      ["c", "lick("],
      ["page.mo", "use"],
      ["dis", "patchEvent"],
      [".f", "ill("],
      [".ch", "eck("],
      [".sel", "ectOption("],
      [".ho", "ver("],
      [".t", "ap("],
    ].map((teile) => teile.join(""));
    // `test.info().file` statt `import.meta.url`: Playwright uebersetzt die Specs
    // nach CJS, dort gibt es kein `import.meta`.
    const quelle = readFileSync(test.info().file, "utf8");

    expect(verboten.filter((muster) => quelle.includes(muster))).toEqual([]);

    await zeigerProtokollStarten(page);

    const leute = (await (await request.get("/api/mitarbeitende")).json()) as {
      items: { id: string; displayName: string }[];
    };
    const geraete = (await (await request.get("/api/ressourcen")).json()) as {
      items: { id: string; name: string }[];
    };
    const person = leute.items.find((p) => p.displayName === PERSON);
    const ressource = geraete.items.find((r) => r.name === RESSOURCE);

    expect(person).toBeDefined();
    expect(ressource).toBeDefined();

    await page.goto(`/planung?monat=${TASTATUR_MONAT}`);
    await expect(page.getByRole("grid")).toBeVisible();

    // --- Drawer oeffnen -----------------------------------------------------
    await tabBis(
      page,
      (f) => f.tag === "button" && f.label === "Einsatz anlegen",
      "Einsatz anlegen",
    );
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Titel", { exact: true })).toBeVisible();

    // --- Schritt 1: Titel, Auftraggeber, Baustelle ---------------------------
    await tabBis(page, (f) => f.label === "Titel", "Titelfeld");
    await page.keyboard.type(TASTATUR_TITEL);

    await tabBis(page, (f) => f.tag === "select" && f.label === "Auftraggeber", "Auftraggeber");
    // Typeahead des nativen select: ein Anschlag waehlt den ersten Treffer.
    await page.keyboard.type("S");
    expect((await fokus(page)).wert).toMatch(/^[0-9a-f-]{36}$/);

    await tabBis(page, (f) => f.tag === "select" && f.label === "Baustelle", "Baustelle");
    await page.keyboard.type("P");
    expect((await fokus(page)).wert).toMatch(/^[0-9a-f-]{36}$/);

    await tabBis(page, (f) => f.tag === "button" && f.label === "Weiter", "Weiter (Schritt 1)");
    await page.keyboard.press("Enter");
    await expect(dialog.getByTestId("drawer-schritt")).toContainText("Schritt 2");

    // --- Schritt 2: Zeitraum und Farbe --------------------------------------
    await tabBis(page, (f) => f.label === "Beginn", "Beginndatum");
    await page.keyboard.type(TASTATUR_START_TASTEN);
    // Scheitert laut, falls die Segmentreihenfolge des Browsers abweicht -
    // sonst plante der Test stillschweigend andere Tage.
    expect((await fokus(page)).wert).toBe(TASTATUR_START);

    await tabBis(page, (f) => f.label === "Ende", "Endedatum");
    await page.keyboard.type(TASTATUR_ENDE_TASTEN);
    expect((await fokus(page)).wert).toBe(TASTATUR_ENDE);

    await expect(dialog.getByTestId("arbeitstage")).toContainText("5 Arbeitstage");

    const ersteFarbe = await dialog
      .locator('[role="radio"][data-state="checked"]')
      .getAttribute("aria-label");

    await tabBis(page, (f) => f.rolle === "radio", "Farbauswahl");
    await page.keyboard.press("ArrowRight");

    /*
     * Wartende Zusicherung statt einmaligem getAttribute: die Auswahl wandert
     * ueber einen React-Zustand, der erst im naechsten Render im DOM steht.
     *
     * Sie ist zugleich die Sachaussage: nach EINEM Pfeildruck muss eine ANDERE
     * Farbe gewaehlt sein. Vor TASK-048 wanderte nur der Fokus weiter, gewaehlt
     * blieb die erste Farbe.
     */
    await expect(dialog.locator('[role="radio"][data-state="checked"]')).not.toHaveAttribute(
      "aria-label",
      ersteFarbe!,
    );

    const zweiteFarbe = await dialog
      .locator('[role="radio"][data-state="checked"]')
      .getAttribute("aria-label");

    expect(zweiteFarbe).not.toBe(ersteFarbe);

    await tabBis(page, (f) => f.tag === "button" && f.label === "Weiter", "Weiter (Schritt 2)");
    await page.keyboard.press("Enter");
    await expect(dialog.getByTestId("drawer-schritt")).toContainText("Schritt 3");

    // --- Schritt 3: Team, Ressourcen, anlegen -------------------------------
    await tabBis(
      page,
      (f) => f.tag === "input" && f.typ === "checkbox" && f.label.includes(PERSON),
      `Checkbox ${PERSON}`,
    );
    await page.keyboard.press("Space");

    await tabBis(
      page,
      (f) => f.tag === "input" && f.typ === "checkbox" && f.label.includes(RESSOURCE),
      `Checkbox ${RESSOURCE}`,
    );
    await page.keyboard.press("Space");

    await expect(dialog.getByTestId("auswahlzaehler")).toContainText("1 Person");
    await expect(dialog.getByTestId("auswahlzaehler")).toContainText("1 Ressource");

    await tabBis(page, (f) => f.tag === "button" && f.label === "Einsatz anlegen", "Anlegen");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog")).toBeHidden();

    // Laufzeitbeweis VOR der naechsten Navigation: ein `goto` setzt das
    // Protokoll zurueck.
    expect(await zeigerProtokoll(page)).toEqual([]);

    // --- Servertruth --------------------------------------------------------
    await page.goto(`/planung?monat=${TASTATUR_MONAT}`);

    const karten = page.getByTestId("tageskarte").filter({ hasText: TASTATUR_TITEL });

    await expect(karten).toHaveCount(TASTATUR_TAGE.length);

    for (const tag of TASTATUR_TAGE) {
      await expect(
        page.locator(`[role="gridcell"][data-datum="${tag}"]`).getByText(TASTATUR_TITEL),
      ).toHaveCount(1);
    }

    const tagIds = await karten.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-worksite-day-id")),
    );

    for (const tagId of tagIds) {
      expect(tagId).toMatch(/^[0-9a-f-]{36}$/);

      const antwort = await request.get(`/api/baustellentage/${tagId}`);

      expect(antwort.status()).toBe(200);

      const detail = (await antwort.json()) as {
        employees: { id: string }[];
        resources: { id: string }[];
      };

      expect(detail.employees.map((e) => e.id)).toEqual([person!.id]);
      expect(detail.resources.map((r) => r.id)).toEqual([ressource!.id]);
    }
  });

  test("AC-14: bei 320x800 laeuft das Dokument nirgends horizontal ueber", async ({ page }) => {
    const id = await einsatzId(page);

    await page.setViewportSize({ width: 320, height: 800 });

    const flaechen: readonly [string, string][] = [
      ["planung", PLANUNG],
      ["einsatzdrawer", `${PLANUNG}&drawer=neu`],
      ["kostenansicht", `${PLANUNG}&tag=2026-09-07&drawer=kosten&id=${id}`],
    ];

    for (const [name, url] of flaechen) {
      await page.goto(url);

      /*
       * Neben einem offenen Radix-Dialog traegt das Raster `aria-hidden`; die
       * Rolle `grid` ist dann nicht mehr auffindbar. Deshalb wartet jede
       * Flaeche auf ihr EIGENES Merkmal statt pauschal auf das Raster.
       */
      if (name === "planung") {
        await expect(page.getByRole("grid")).toBeVisible();
      } else {
        await expect(page.getByRole("dialog")).toBeVisible();
      }

      if (name === "einsatzdrawer") {
        await expect(page.getByRole("dialog").getByLabel("Titel", { exact: true })).toBeVisible();
      }

      if (name === "kostenansicht") {
        await expect(page.getByTestId("kostensumme")).toBeVisible();
      }

      const gemessen = await ueberlauf(page);

      expect(
        `${name}: scrollWidth=${gemessen.scrollWidth} clientWidth=${gemessen.clientWidth} ueber=[${gemessen.taeter.join(" | ")}]`,
      ).toBe(`${name}: scrollWidth=320 clientWidth=320 ueber=[]`);
    }
  });

  test("AC-14: bei 375 px sind die Tagesaktionsflaechen mindestens 44x44 gross", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    // Mit ausgewaehltem Tag, damit die Tagesliste - die Bedienflaeche der
    // Kompaktform - wirklich im Dokument steht und mitgemessen wird.
    await page.goto(`${PLANUNG}&tag=2026-09-10`);
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(page.getByTestId("tagesliste")).toBeVisible();

    const flaechen = [
      ...(await masse(page, '[role="gridcell"]')),
      ...(await masse(page, '[data-testid="tageskarte"]')),
      ...(await masse(page, '[data-testid="mehr-karten"]')),
      ...(await masse(page, "header nav a")),
      ...(await masse(page, '[data-testid="monatswerkzeuge"] button')),
      // Die beiden Flaechen, ueber die auf dieser Breite ueberhaupt bedient
      // wird (Plan 6.2): der Kompaktindikator in der Zelle und die Karten der
      // Tagesliste darunter.
      ...(await masse(page, '[data-testid="tagesindikator"]')),
      ...(await masse(page, '[data-testid="tagesliste"] [data-testid="tageskarte"]')),
    ];

    // Ohne diese Schranke waere die Pruefung auch dann gruen, wenn gar nichts
    // gemessen wurde.
    expect(flaechen.length).toBeGreaterThan(40);
    // Und ohne diese waere sie gruen, wenn die Kompaktform verschwaende: die
    // sichtbaren Indikatoren muessen tatsaechlich gemessen worden sein.
    expect(
      flaechen.filter((f) => f.beschreibung.includes("tagesindikator")).length,
    ).toBeGreaterThan(0);
    expect(flaechen.filter((f) => f.beschreibung.includes("tagesliste")).length).toBeGreaterThan(0);

    const zuKlein = flaechen
      .filter((f) => f.breite < MINDESTFLAECHE || f.hoehe < MINDESTFLAECHE)
      .map((f) => `${f.beschreibung} ${f.breite.toFixed(1)}x${f.hoehe.toFixed(1)}`);

    expect([...new Set(zuKlein)]).toEqual([]);
  });

  for (const [name, pfad] of [
    ["mitarbeitende", "/mitarbeitende"],
    ["ressourcen", "/ressourcen"],
    ["auftraggeber", "/auftraggeber"],
  ] as const) {
    test(`AC-14: axe findet auf ${name} keinen wcag2a/wcag2aa-Verstoss`, async ({ page }) => {
      await page.goto(pfad);
      await expect(page.getByRole("main")).toBeVisible();

      const ergebnis = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(
        ergebnis.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
      ).toEqual([]);
    });
  }

  test("AC-14: axe findet im Einsatzdrawer keinen wcag2a/wcag2aa-Verstoss", async ({ page }) => {
    await page.goto(`${PLANUNG}&drawer=neu`);
    await expect(page.getByRole("dialog").getByLabel("Titel", { exact: true })).toBeVisible();

    const ergebnis = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      ergebnis.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
    ).toEqual([]);
  });

  test("AC-14: axe findet in der Kostenansicht keinen wcag2a/wcag2aa-Verstoss", async ({
    page,
  }) => {
    const id = await einsatzId(page);

    await page.goto(`${PLANUNG}&tag=2026-09-07&drawer=kosten&id=${id}`);
    await expect(page.getByTestId("kostensumme")).toBeVisible();

    const ergebnis = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      ergebnis.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
    ).toEqual([]);
  });
});
