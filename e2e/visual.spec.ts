import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

/**
 * TASK-049: die zwoelf Pruefansichten aus Abschnitt 6.13 des Plans.
 *
 * Baselines sind KEINE Behauptung ueber richtiges Aussehen - sie frieren nur
 * ein, was ein Mensch einmal angesehen und freigegeben hat. Deshalb gilt hier
 * durchgehend: vor jedem Screenshot steht eine fachliche Zusicherung. Ein
 * kaputter Zustand soll an dieser Zusicherung scheitern, nicht als huebsches
 * neues Bild in die Baseline wandern.
 *
 * ZUSTANDSHOHEIT (wichtig, sonst sind die Bilder nicht reproduzierbar):
 * Alle Specs teilen EINE Datenbank, und mehrere von ihnen schreiben hinein -
 * `einsatz-anlegen.spec.ts` legt zehn zusaetzliche Karten in den 09/2026,
 * `tagesbearbeitung.spec.ts` nimmt dem Seed-Einsatz zwei Teammitglieder weg
 * und erhoeht die sichtbare Revisionsnummer. Ein Screenshot aus
 * `-g "visual"` (frischer Seed) und einer aus dem vollen Lauf waeren damit
 * verschiedene Bilder unter demselben Dateinamen. Diese Datei stellt ihren
 * Ausgangszustand deshalb selbst her (`beforeAll`: derselbe db:reset + db:seed,
 * den auch der globalSetup faehrt) und ist so von der Lauf-Reihenfolge
 * unabhaengig.
 */

const SEPTEMBER = "/planung?monat=2026-09";
const AUGUST = "/planung?monat=2026-08";

/** Plan 6.13 verlangt `animations: 'disabled'` ausdruecklich. */
const BILD = { animations: "disabled" } as const;
const SEITE = { ...BILD, fullPage: true } as const;

const VIEWPORT = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobil: { width: 375, height: 812 },
  schmal: { width: 320, height: 800 },
} as const;

function datenbank(...befehle: readonly string[]): void {
  for (const befehl of befehle) {
    execFileSync("pnpm", [befehl], { stdio: "inherit", env: process.env });
  }
}

/** Liest eine ID aus der Tageskarte - nie aus einer Annahme ueber den Seed. */
async function karteAttribut(
  page: Page,
  datum: string,
  einsatz: string,
  attribut: "data-worksite-day-id" | "data-engagement-id",
): Promise<string> {
  const karte = page
    .locator(`[role="gridcell"][data-datum="${datum}"]`)
    .getByTestId("tageskarte")
    .filter({ hasText: einsatz });

  await expect(karte).toHaveCount(1);

  const wert = await karte.getAttribute(attribut);

  expect(wert, `${attribut} auf der Karte ${einsatz} am ${datum}`).toBeTruthy();

  return wert!;
}

test.describe("visual", () => {
  /*
   * Deutscher Browserkontext fuer alle Baselines. Die Oberflaeche ist deutsch,
   * und die nativen Datumsfelder des Browsers formatieren sich nach der
   * Browsersprache - nicht nach der Seite. Ohne diese Zeile stand in den
   * Kandidaten der ersten Runde `mm/dd/yyyy`.
   *
   * Ob Chromium das im Headless-Lauf tatsaechlich uebernimmt, entscheidet der
   * Browser und nicht dieser Test; der Befund steht im Abschlussbericht.
   * Produktcode wird dafuer NICHT angefasst - eine nachgebaute
   * Datumsformatierung waere eine erfundene Produktentscheidung.
   */
  test.use({ locale: "de-DE", timezoneId: "Europe/Berlin" });

  test.beforeAll(() => {
    // db:reset ist ein Schema-Drop mit anschliessender Migration; zusammen mit
    // dem Seed dauert das laenger als ein Test-Default.
    test.setTimeout(180_000);
    datenbank("db:reset", "db:seed");
  });

  /*
   * Testisolation in BEIDE Richtungen. `beforeAll` macht diese Datei
   * unabhaengig von dem, was vorher lief; `afterAll` gibt die Datenbank im
   * Seed-Zustand zurueck. Ohne das hinterliessen die beiden letzten Tests
   * (umbenannte Baustelle, individuell angepasster Tag) manipulierte
   * Seed-Daten fuer jede Spec, die spaeter laufen koennte.
   */
  test.afterAll(() => {
    datenbank("db:reset", "db:seed");
  });

  test("01 Planung September bei 1440", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.desktop);
    await page.goto(SEPTEMBER);

    await expect(page.getByRole("grid")).toBeVisible();
    // Der Seed traegt vier Einsaetze in den September; ohne diese Zusicherung
    // wuerde ein leerer Kalender klaglos zur Baseline.
    await expect(page.getByTestId("tageskarte").first()).toBeVisible();

    await expect(page).toHaveScreenshot("01-planung-september-1440.png", SEITE);
  });

  test("02 Planung September bei 768", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.tablet);
    await page.goto(SEPTEMBER);

    await expect(page.getByRole("grid")).toBeVisible();
    await expect(page.getByTestId("tageskarte").first()).toBeVisible();

    await expect(page).toHaveScreenshot("02-planung-september-768.png", SEITE);
  });

  test("03 Planung September bei 375", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.mobil);
    await page.goto(SEPTEMBER);

    await expect(page.getByRole("grid")).toBeVisible();

    /*
     * Plan 6.2 fuer < 768 px: Kompaktform statt Desktop-Karten. Die Baseline
     * der ersten Runde zeigte hier das Desktop-Raster in einer horizontalen
     * Scrollregion (Befund V049-01) - diese Zusicherung verhindert, dass so
     * etwas noch einmal unbemerkt zur Wahrheit wird.
     */
    const zehnter = page.locator('[role="gridcell"][data-datum="2026-09-10"]');

    await expect(zehnter.getByTestId("tagesindikator")).toBeVisible();
    await expect(zehnter.getByTestId("tageskarte").first()).not.toBeVisible();

    await expect(page).toHaveScreenshot("03-planung-september-375.png", SEITE);
  });

  test("04 Planung August mit sechs Kalenderzeilen", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.desktop);
    await page.goto(AUGUST);

    const raster = page.getByRole("grid");

    await expect(raster).toBeVisible();
    // Die Pruefansicht IST die sechszeilige Monatsform. Sieben Zeilen sind die
    // Kopfzeile plus sechs Wochen - faende der Test fuenf, waere das Bild
    // wertlos und der Test muss scheitern.
    await expect(raster.getByRole("row")).toHaveCount(7);

    /*
     * Der ganze August liegt vor dem Zeitanker 2026-09-01 und muss deshalb den
     * Vergangenheitszustand tragen (Plan 6.3, Befund V049-02). In der ersten
     * Runde sah dieser Monat aus wie jeder Zukunftsmonat.
     */
    await expect(
      page.locator('[role="gridcell"][data-datum^="2026-08-"][data-vergangen="true"]'),
    ).toHaveCount(31);
    await expect(page.locator('[role="gridcell"][data-datum="2026-08-17"]')).toHaveAttribute(
      "title",
      /gesperrt/,
    );

    await expect(page).toHaveScreenshot("04-planung-august-sechs-zeilen-1440.png", SEITE);
  });

  test("06 Einsatzdrawer Schritt 2 mit Kalenderkontext bei 1440", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.desktop);
    // Der Schritt steht bewusst NICHT in der URL (siehe B-05): der Drawer wird
    // per Deep-Link geoeffnet und dann durch Schritt 1 bedient.
    await page.goto(`${SEPTEMBER}&drawer=neu`);

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("drawer-schritt")).toHaveText("Schritt 1 von 3");

    await dialog.getByLabel("Titel", { exact: true }).fill("Kronensicherung Allee");
    // Vorhandene Stammdaten waehlen statt neue anlegen: dieser Test darf die
    // gemeinsame Datenbank nicht veraendern.
    await dialog.getByLabel("Auftraggeber", { exact: true }).selectOption({
      label: "Stadtwerke Musterstadt",
    });
    await dialog.getByLabel("Baustelle", { exact: true }).selectOption({
      label: "Parkanlage Nordring",
    });
    await dialog.getByRole("button", { name: "Weiter" }).click();

    await expect(dialog.getByTestId("drawer-schritt")).toHaveText("Schritt 2 von 3");
    /*
     * Plan 6.13 (6): "Kalenderkontext daneben weiterhin sichtbar". Ab 1024 px
     * liegt der Drawer UEBER dem Kalender, er ersetzt ihn nicht.
     *
     * Bewusst ein CSS-Locator und NICHT getByRole("region"): neben einem
     * offenen Radix-Dialog traegt der Rest des Dokuments `aria-hidden`, der
     * Kalender ist dann aus dem Accessibility-Baum verschwunden (dieselbe
     * Falle wie bei role="grid" in e2e/tastatur-zoom.spec.ts). Das ist
     * korrekte Modal-Semantik und kein Fehler - hier geht es um die SICHTBARE
     * Flaeche, und die misst toBeVisible ueber CSS.
     */
    await expect(page.locator('[aria-label="Monatskalender"]')).toBeVisible();

    await expect(page).toHaveScreenshot("06-einsatzdrawer-schritt-2-1440.png", SEITE);
  });

  test("07 Tagesbearbeitung bei 1440", async ({ page }) => {
    /*
     * Breite 1440 wie im Plan, aber bewusst 1400 statt 900 hoch.
     *
     * Der Drawer scrollt INTERN; bei 900 px endete die Baseline der ersten
     * Runde mitten in "Aenderung anwenden auf", und die eigentlich zu
     * pruefenden Bedienelemente - Scope-Radiogroup, "Speichern", "Kosten
     * anzeigen" - lagen ausserhalb des Bildes. `fullPage` half nicht: es
     * verlaengert das Dokument, nicht den eigenen Scrollbereich des Dialogs.
     * Die Hoehe ist fest und damit reproduzierbar; der Plan schreibt fuer
     * diese Ansicht nur die Breite vor.
     */
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto(SEPTEMBER);

    const id = await karteAttribut(
      page,
      "2026-09-10",
      "Baumpflege Herbstschnitt",
      "data-worksite-day-id",
    );

    await page.goto(`${SEPTEMBER}&tag=2026-09-10&drawer=tag&id=${id}`);

    const drawer = page.getByRole("dialog");

    await expect(drawer.getByTestId("tageskopf")).toContainText("Baumpflege Herbstschnitt");
    await expect(drawer.getByTestId("drawer-team")).toBeVisible();
    // Auf frischem Seed ist jeder Baustellentag unveraendert. Stuende hier eine
    // hoehere Revision, haette ein anderer Lauf in die Daten geschrieben und
    // das Bild waere nicht reproduzierbar.
    await expect(drawer.getByTestId("tageskopf")).toContainText("Revision 1");

    /*
     * Die Bedienstruktur MUSS im Bild stehen, sonst prueft die Baseline den
     * halben Drawer. Diese drei Zusicherungen sind der Nachweis dafuer - sie
     * scheitern, wenn die gewaehlte Hoehe eines Tages nicht mehr reicht.
     */
    await expect(drawer.getByRole("radiogroup", { name: "Aenderung anwenden auf" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Speichern" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Kosten anzeigen" })).toBeVisible();

    await expect(page).toHaveScreenshot("07-tagesbearbeitung-1440.png", SEITE);
  });

  test("09 Kostenansicht im Zustand unvollstaendig", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.desktop);
    await page.goto(SEPTEMBER);

    // "Kronensicherung Allee" traegt Erik Sommer ohne Tagessatz - das ist der
    // im Seed angelegte Luecken-Fall.
    const id = await karteAttribut(
      page,
      "2026-09-14",
      "Kronensicherung Allee",
      "data-engagement-id",
    );

    await page.goto(`${SEPTEMBER}&tag=2026-09-14&drawer=kosten&id=${id}`);

    const kosten = page.getByRole("dialog");

    await expect(kosten.getByTestId("kostenkopf")).toContainText("unvollstaendig");
    await expect(kosten.getByTestId("betrag-fehlt").first()).toContainText("fehlt");
    // Produktinvariante 3: fehlende Grundlage ist "fehlt", niemals 0,00 EUR.
    for (const text of await kosten.getByTestId("betrag-fehlt").allTextContents()) {
      expect(text).not.toContain("0,00");
    }

    await expect(page).toHaveScreenshot("09-kosten-unvollstaendig-1440.png", SEITE);
  });

  test("10 Geocoding-Fehlerzustand", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.desktop);

    // Der Ausfall entsteht an der Netzgrenze, nicht im Produktcode - genau wie
    // in e2e/geocoding.spec.ts (AC-09b).
    await page.route("**/api/geocoding/suche", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "urn:easytree-prototype:problem:GEOCODER_UNAVAILABLE",
          title: "Der Geocoding-Dienst ist nicht erreichbar.",
          status: 503,
          detail: "Simulierter Ausfall im Visual-Lauf.",
          correlationId: "e2e-visual-geocoding",
        }),
      });
    });

    await page.goto("/auftraggeber");
    await page.getByRole("button", { name: "Stadtwerke Musterstadt auswaehlen" }).click();
    await page.getByRole("button", { name: "Neue Baustelle" }).click();

    const formular = page.getByRole("form", { name: "Neue Baustelle" });

    await expect(formular).toBeVisible();
    // Der Name bleibt konstant - ein Date.now() im Namen waere ein volatiler
    // Wert im Bild und muesste maskiert werden.
    await formular.getByLabel("Name der Baustelle").fill("Baustelle mit Adressfehler");
    await formular.getByLabel("Adresse", { exact: true }).fill("Nordring");
    await formular.getByRole("button", { name: "Adresse suchen" }).click();

    // Im Formular suchen: Next haengt einen eigenen leeren div role="alert" als
    // Route-Announcer in den Body.
    await expect(formular.getByRole("alert")).toContainText(
      "Die Adresssuche ist gerade nicht erreichbar.",
    );
    // Nichts wird gespeichert - der Test legt keine Baustelle an.

    await expect(page).toHaveScreenshot("10-geocoding-fehler-1440.png", SEITE);
  });

  test("11 Sichtbarer Fokus auf einer Tageskarte nach Tab", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.desktop);
    await page.goto(SEPTEMBER);

    await expect(page.getByRole("grid")).toBeVisible();

    // Echte Tastaturnavigation statt .focus(): der Plan verlangt den Fokus
    // "nach Tab", und nur der Tabweg beweist, dass die Karte ueberhaupt
    // erreichbar ist.
    let getroffen = false;

    for (let i = 0; i < 30 && !getroffen; i += 1) {
      await page.keyboard.press("Tab");
      getroffen = await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") === "tageskarte",
      );
    }

    expect(getroffen, "Tab erreicht eine Tageskarte innerhalb von 30 Schritten").toBe(true);

    // Welche Karte, ist Teil der Reproduzierbarkeit: der erste Kartenknopf im
    // Dokument gehoert zum 07.09.
    const beschriftung = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label") ?? "",
    );

    expect(beschriftung).toContain("Baumpflege Herbstschnitt");

    await expect(page).toHaveScreenshot("11-tageskarte-fokus-1440.png", SEITE);
  });

  test("12 Reflow bei 320 Pixeln", async ({ page }) => {
    await page.setViewportSize(VIEWPORT.schmal);
    await page.goto(SEPTEMBER);

    await expect(page.getByRole("grid")).toBeVisible();

    // TASK-048 hat belegt, dass hier nichts horizontal ueberlaeuft. Das Bild
    // darf diesen Stand nur zeigen, wenn er auch gilt.
    const ueberlauf = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(ueberlauf).toEqual({ scrollWidth: 320, clientWidth: 320 });

    // Plan 6.2: unter 768 px traegt die Zelle die Kompaktform, nicht die
    // Desktop-Karten. Das Bild darf den alten Zustand nicht wieder einfrieren.
    await expect(
      page.locator('[role="gridcell"][data-datum="2026-09-10"]').getByTestId("tagesindikator"),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("12-reflow-320.png", SEITE);
  });

  /*
   * Pruefansicht 8 steht ABSICHTLICH hinter den lesenden Tests: sie aendert
   * einen Baustellentag wirklich.
   *
   * Die Baseline der ersten Runde zeigte neun Zeilen "unveraendert" - also
   * genau den Fall, den Produktinvariante 2 NICHT interessant macht. Der
   * belegenswerte Zustand ist der andere: ein individuell angepasster Folgetag
   * wird in der Vorschau als "ausgeschlossen" gefuehrt und ist nur einzeln
   * wieder einbeziehbar (A-06, OQ-001 bleibt offen).
   *
   * Hergestellt wird er ueber die Oberflaeche selbst - erst eine Aenderung mit
   * Scope "Nur dieser Tag" auf dem 09.09., dann die Serienvorschau ab dem
   * 08.09. Kein Eingriff in Seed, Domaene oder Produktionssemantik; OQ-001
   * wird dabei nicht entschieden, sondern nur abgebildet.
   */
  test("08 Serienvorschau mit individuell angepasstem Folgetag", async ({ page }) => {
    test.setTimeout(180_000);
    datenbank("db:reset", "db:seed");

    await page.setViewportSize(VIEWPORT.desktop);
    await page.goto(SEPTEMBER);

    // Schritt 1: den 09.09. individuell anpassen (Scope "Nur dieser Tag").
    const neunter = await karteAttribut(
      page,
      "2026-09-09",
      "Baumpflege Herbstschnitt",
      "data-worksite-day-id",
    );

    await page.goto(`${SEPTEMBER}&tag=2026-09-09&drawer=tag&id=${neunter}`);

    const tagesdrawer = page.getByRole("dialog");

    await expect(tagesdrawer.getByTestId("tageskopf")).toContainText("Baumpflege Herbstschnitt");
    await tagesdrawer.getByRole("checkbox", { name: /Carla Nguyen/ }).uncheck();
    await expect(tagesdrawer.getByRole("radio", { name: "Nur dieser Tag" })).toBeChecked();
    await tagesdrawer.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Schritt 2: Serienaenderung ab dem 08.09. - der 09.09. ist jetzt der
    // angepasste Folgetag.
    const achter = await karteAttribut(
      page,
      "2026-09-08",
      "Baumpflege Herbstschnitt",
      "data-worksite-day-id",
    );

    await page.goto(`${SEPTEMBER}&tag=2026-09-08&drawer=tag&id=${achter}`);

    const drawer = page.getByRole("dialog");

    await expect(drawer.getByTestId("tageskopf")).toContainText("Baumpflege Herbstschnitt");
    await drawer.getByRole("checkbox", { name: /Bernd Kowalski/ }).uncheck();
    await drawer.getByRole("radio", { name: "Dieser und folgende Tage dieses Einsatzes" }).check();
    await drawer.getByRole("button", { name: "Vorschau anzeigen ..." }).click();

    const vorschau = page.getByRole("dialog");

    await expect(vorschau.getByRole("table")).toBeVisible();
    await expect(vorschau.getByTestId("serien-zusammenfassung")).toBeVisible();
    await expect(vorschau.getByTestId("serien-zaehler")).toBeVisible();

    // Der belegenswerte Zustand, hart gemessen: der angepasste Tag ist
    // ausgeschlossen und NICHT vorausgewaehlt ...
    const zeileNeunter = vorschau.getByRole("row").filter({ hasText: "09.09.2026" });

    await expect(zeileNeunter).toContainText("individuell angepasst - ausgeschlossen");
    await expect(zeileNeunter.getByRole("checkbox")).not.toBeChecked();
    // ... und daneben steht mindestens ein normaler Zieltag.
    await expect(vorschau.getByRole("row").filter({ hasText: "10.09.2026" })).toContainText(
      "unveraendert",
    );
    // Der Prototyp-Hinweis zu OQ-001 gehoert mit ins Bild.
    await expect(vorschau).toContainText("OQ-001");

    // Der Entwurf bleibt ein Entwurf: "Uebernehmen" wird NICHT gedrueckt.
    await expect(page).toHaveScreenshot("08-serienvorschau-1440.png", SEITE);
  });

  /*
   * Plan 6.13 (5) verlangt den 10.09.2026 mit ZWEI parallelen Einsaetzen UND
   * dem langen Baustellennamen. Im Seed schliessen sich beide Eigenschaften
   * aus: am 10.09. liegen "Baumpflege Herbstschnitt" (Parkanlage Nordring) und
   * "Sturmschaden Sofortmassnahme" (Innenhof Gruenblick); die lang benannte
   * Baustelle "Allee am Wasserwerk - Abschnitt West, Baumreihe 1-48" gehoert zu
   * "Kronensicherung Allee" und startet erst am 14.09.
   *
   * Vier Wege wurden gemessen und sind alle versperrt:
   *
   *  - Einen DRITTEN Einsatz dazulegen macht aus "zwei parallelen Einsaetzen"
   *    drei und veraendert damit die Planforderung.
   *  - Einen der beiden WEGNEHMEN geht nicht: die API kennt ueberhaupt keine
   *    DELETE-Route (gemessen ueber alle 17 route.ts: nur GET, POST, PATCH).
   *  - Den Zustand auf leerem Schema NEU aufbauen geht nicht: `db:reset` ohne
   *    `db:seed` laesst `organizations` leer, und `customers.org_id` ist ein
   *    NOT-NULL-Fremdschluessel darauf. Gemessen: POST /api/auftraggeber
   *    antwortet dann 500. Die Organisation legt ausschliesslich `seed()` an,
   *    und zwar in derselben Funktion wie die vier Einsaetze - eine Trennung
   *    gaebe es nur durch eine Aenderung am Seed, und die ist untersagt.
   *  - Eine Baustelle STILLLEGEN blendet ihre Karten nicht aus: die
   *    Monatsabfrage joint `worksites` ohne `active`-Praedikat.
   *
   * Bleibt genau ein Weg ueber vorhandene oeffentliche Routen: die Baustelle
   * des zweiten Einsatzes am 10.09. wird per PATCH umbenannt. Danach sind am
   * 10.09. genau zwei Einsaetze sichtbar, und einer davon gehoert zur
   * Baustelle mit dem langen Namen.
   *
   * OFFENGELEGT, weil es die Sichtpruefung betrifft: der lange Name sitzt
   * dadurch auf der Baustelle des Sturmschaden-Einsatzes, nicht auf der
   * urspruenglichen Allee-Baustelle - die traegt denselben Namen weiterhin,
   * ist aber erst ab 14.09. im Raster und im Ausschnitt dieses Bildes nicht zu
   * sehen. Was das Bild zeigt, ist echt: das Produkt rendert zwei gestapelte
   * Karten und kuerzt einen langen Baustellennamen. Ob diese Vorbereitung als
   * Nachweis fuer Pruefansicht 5 zaehlt, ist eine menschliche Entscheidung.
   *
   * Der Test steht ABSICHTLICH als letzter der Datei: er benennt Seed-Daten um.
   */
  test("05 Zehnter September mit zwei parallelen Einsaetzen und langem Baustellennamen", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);

    const LANGE_BAUSTELLE = "Allee am Wasserwerk - Abschnitt West, Baumreihe 1-48";

    // Eigener Ausgangszustand, damit dieser Test nicht davon abhaengt, was die
    // elf Tests davor angefasst haben.
    datenbank("db:reset", "db:seed");

    const baustellen = await request.get("/api/baustellen");

    expect(baustellen.status()).toBe(200);

    const { items } = (await baustellen.json()) as {
      items: readonly { id: string; name: string }[];
    };
    const innenhof = items.find((eintrag) => eintrag.name === "Innenhof Gruenblick");

    expect(innenhof, "Seed-Baustelle 'Innenhof Gruenblick'").toBeDefined();

    const umbenannt = await request.patch(`/api/baustellen/${innenhof!.id}`, {
      data: { name: LANGE_BAUSTELLE },
    });

    expect(umbenannt.status(), await umbenannt.text()).toBe(200);

    await page.setViewportSize(VIEWPORT.desktop);
    await page.goto(SEPTEMBER);

    const zelle = page.locator('[role="gridcell"][data-datum="2026-09-10"]');
    const karten = zelle.getByTestId("tageskarte");

    // Die Planforderung, hart gemessen: GENAU zwei, nicht "mindestens zwei".
    await expect(karten).toHaveCount(2);
    await expect(karten.filter({ hasText: LANGE_BAUSTELLE })).toHaveCount(1);
    // Der lange Name muss auch wirklich gekuerzt dargestellt werden, sonst
    // prueft das Bild die Namenskuerzung gar nicht.
    await expect(zelle.locator('[data-truncate="true"]').first()).toBeVisible();

    /*
     * Der ganze Kalender bei 1440, nicht mehr nur die Zelle.
     *
     * Die erste Runde lieferte hier einen 154x130-Ausschnitt - fachlich
     * richtig, fuer eine menschliche Sichtpruefung aber zu klein. Der 10.09.
     * ist im Monatskontext ohnehin eindeutig zu finden, und der Kontext zeigt
     * zusaetzlich, dass die Namenskuerzung neben den uebrigen Karten
     * konsistent aussieht.
     */
    await expect(page).toHaveScreenshot("05-tag-10-09-zwei-einsaetze-langer-name-1440.png", SEITE);
  });
});
