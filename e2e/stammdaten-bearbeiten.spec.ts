import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Regressionsnachweis fuer die BEREITS VORHANDENE Stammdatenbearbeitung
 * (REQ-F-012, REQ-F-013; EYT-5, EYT-23).
 *
 * Diese Flaechen sind nicht Gegenstand der Einsatzbearbeitung - genau deshalb
 * stehen sie hier: der MVP-Slice behauptet, dass alle vier Editierbereiche auf
 * echter Servertruth laufen, und fuer Mitarbeitende und Ressourcen gab es
 * bisher ueberhaupt keine Browser-Journey. Nur Integrationstests zu haben
 * heisst, die Oberflaeche NICHT geprueft zu haben.
 *
 * ZUSTANDSHOHEIT: diese Datei legt ihre eigenen Datensaetze an, statt
 * Seed-Daten umzubenennen. Alle Specs teilen EINE Datenbank, und zwei andere
 * haengen messbar an den Seed-Stammdaten:
 *
 *  - `einsatz-anlegen.spec.ts` nimmt `items.slice(0, 2)` aus den nach Namen
 *    sortierten Listen;
 *  - `kosten.spec.ts` rechnet Betraege aus den Seed-Tagessaetzen.
 *
 * Deshalb beginnen beide Namen mit "Z": sie sortieren hinter jeden Seed-Namen
 * (Anna … Erik bzw. Haecksler … Transporter) und verschieben damit kein
 * `slice`. Die Tagessaetze der Seed-Datensaetze werden nicht angefasst.
 */
const PERSON = "Zita Regressionspruefung";
const PERSON_ROLLE_VORHER = "Aushilfe";
const PERSON_ROLLE_NACHHER = "Baumkontrolle";

const RESSOURCE = "Zugmaschine Regressionstest";
const RESSOURCE_KENNUNG_VORHER = "P-ZR 100";
const RESSOURCE_KENNUNG_NACHHER = "P-ZR 742";

/** Liest die Servertruth einer Liste - nicht den Bildschirminhalt. */
async function serverEintrag<T extends { id: string }>(
  page: Page,
  pfad: string,
  treffer: (eintrag: T) => boolean,
): Promise<T> {
  const antwort = await page.request.get(pfad);

  expect(antwort.status(), await antwort.text()).toBe(200);

  const { items } = (await antwort.json()) as { items: T[] };
  const eintrag = items.find(treffer);

  expect(eintrag, `${pfad}: gesuchter Eintrag`).toBeDefined();

  return eintrag!;
}

/**
 * Oeffnet dieselbe Seite in einem ZWEITEN Browserkontext - eigene Cookies,
 * eigener Speicher. Nur das unterscheidet "der Server weiss es" von "dieser
 * Tab erinnert sich".
 */
async function imZweitenKontext<T>(
  browser: Browser,
  pfad: string,
  pruefung: (seite: Page) => Promise<T>,
): Promise<T> {
  const kontext = await browser.newContext();

  try {
    const seite = await kontext.newPage();

    await seite.goto(pfad);

    return await pruefung(seite);
  } finally {
    await kontext.close();
  }
}

test.describe("stammdaten-bearbeiten", () => {
  test("Mitarbeitende: eine geaenderte Rollenbezeichnung ueberlebt Reload und zweiten Browser", async ({
    page,
    browser,
  }) => {
    await page.goto("/mitarbeitende");

    // 1. Eine Person anlegen, die ab jetzt eine BESTEHENDE Person ist.
    await page.getByRole("button", { name: "Neue Person anlegen" }).click();

    const neu = page.getByRole("button", { name: "Speichern" });

    await page.getByLabel("Name", { exact: true }).fill(PERSON);
    await page.getByLabel("Rollenbezeichnung").fill(PERSON_ROLLE_VORHER);
    await neu.click();

    const zeile = page.getByTestId("mitarbeitendenliste").locator("li").filter({ hasText: PERSON });

    await expect(zeile).toHaveCount(1);
    await expect(zeile).toContainText(PERSON_ROLLE_VORHER);

    const angelegt = await serverEintrag<{ id: string; displayName: string; roleLabel: string }>(
      page,
      "/api/mitarbeitende",
      (eintrag) => eintrag.displayName === PERSON,
    );

    expect(angelegt.roleLabel).toBe(PERSON_ROLLE_VORHER);

    // 2. Bearbeiten - der eigentliche Gegenstand dieses Tests.
    await zeile.getByRole("button", { name: `${PERSON} bearbeiten` }).click();

    /*
     * Beim Bearbeiten ERSETZT das Formular den Zeileninhalt. Der Name steht
     * danach nur noch als input-VALUE da, nicht mehr als Text - und
     * `filter({ hasText })` sieht Text, keine Werte. Die Zeile ist in diesem
     * Moment also nicht mehr auffindbar (gemessen: "element(s) not found").
     * Gezielt wird deshalb auf das offene Formular; es gibt genau eines.
     */
    const formular = page.locator("form");

    await expect(formular).toHaveCount(1);

    const rolle = formular.getByLabel("Rollenbezeichnung");

    await expect(rolle).toHaveValue(PERSON_ROLLE_VORHER);
    await rolle.fill(PERSON_ROLLE_NACHHER);
    await formular.getByRole("button", { name: "Speichern" }).click();

    // `zeile` loest nach dem Schliessen des Formulars wieder auf.
    await expect(zeile).toContainText(PERSON_ROLLE_NACHHER);

    // 3. Servertruth, nicht Bildschirmgedaechtnis: die ID bleibt dieselbe.
    const gespeichert = await serverEintrag<{ id: string; displayName: string; roleLabel: string }>(
      page,
      "/api/mitarbeitende",
      (eintrag) => eintrag.displayName === PERSON,
    );

    expect(gespeichert.id).toBe(angelegt.id);
    expect(gespeichert.roleLabel).toBe(PERSON_ROLLE_NACHHER);

    // 4. Reload.
    await page.reload();

    const nachReload = page
      .getByTestId("mitarbeitendenliste")
      .locator("li")
      .filter({ hasText: PERSON });

    await expect(nachReload).toContainText(PERSON_ROLLE_NACHHER);
    await expect(nachReload).not.toContainText(PERSON_ROLLE_VORHER);

    // 5. Zweiter Browserkontext.
    await imZweitenKontext(browser, "/mitarbeitende", async (zweite) => {
      const dort = zweite
        .getByTestId("mitarbeitendenliste")
        .locator("li")
        .filter({ hasText: PERSON });

      await expect(dort).toHaveCount(1);
      await expect(dort).toContainText(PERSON_ROLLE_NACHHER);
      await expect(dort).not.toContainText(PERSON_ROLLE_VORHER);
    });
  });

  test("Ressourcen: eine geaenderte Kennung eines Fahrzeugs ueberlebt Reload und zweiten Browser", async ({
    page,
    browser,
  }) => {
    await page.goto("/ressourcen");

    // Fahrzeug als repraesentativer Pfad der drei Typen (A-08). Weitere
    // Typattribute werden hier NICHT erfunden - das bleibt H-05/OQ-006.
    await page.getByRole("button", { name: "Neue Ressource anlegen" }).click();
    // exact: true - ohne das matcht "Typ" auch "Demo-Tagessatz (Prototyp)"
    // und Playwright bricht mit einer strict-mode-Verletzung ab.
    await page.getByLabel("Typ", { exact: true }).selectOption({ label: "Fahrzeug" });
    await page.getByLabel("Name", { exact: true }).fill(RESSOURCE);
    await page.getByLabel("Kennung").fill(RESSOURCE_KENNUNG_VORHER);
    await page.getByRole("button", { name: "Speichern" }).click();

    const gruppe = page.getByRole("group", { name: "Fahrzeuge" });
    const zeile = gruppe.locator("li").filter({ hasText: RESSOURCE });

    await expect(zeile).toHaveCount(1);
    await expect(zeile).toContainText(RESSOURCE_KENNUNG_VORHER);

    const angelegt = await serverEintrag<{ id: string; name: string; identifier: string }>(
      page,
      "/api/ressourcen",
      (eintrag) => eintrag.name === RESSOURCE,
    );

    expect(angelegt.identifier).toBe(RESSOURCE_KENNUNG_VORHER);

    await zeile.getByRole("button", { name: `${RESSOURCE} bearbeiten` }).click();

    // Dieselbe Falle wie bei den Mitarbeitenden: das Formular ersetzt den
    // Zeileninhalt, der Name ist dann nur noch ein input-Wert.
    const formular = page.locator("form");

    await expect(formular).toHaveCount(1);

    const kennung = formular.getByLabel("Kennung");

    await expect(kennung).toHaveValue(RESSOURCE_KENNUNG_VORHER);
    await kennung.fill(RESSOURCE_KENNUNG_NACHHER);
    await formular.getByRole("button", { name: "Speichern" }).click();

    await expect(zeile).toContainText(RESSOURCE_KENNUNG_NACHHER);

    const gespeichert = await serverEintrag<{
      id: string;
      name: string;
      identifier: string;
      kind: string;
    }>(page, "/api/ressourcen", (eintrag) => eintrag.name === RESSOURCE);

    expect(gespeichert.id).toBe(angelegt.id);
    expect(gespeichert.identifier).toBe(RESSOURCE_KENNUNG_NACHHER);
    // Der Typ bleibt, was er war - die Bearbeitung ist kein Typwechsel.
    expect(gespeichert.kind).toBe("vehicle");

    await page.reload();

    const nachReload = page
      .getByRole("group", { name: "Fahrzeuge" })
      .locator("li")
      .filter({ hasText: RESSOURCE });

    await expect(nachReload).toContainText(RESSOURCE_KENNUNG_NACHHER);
    await expect(nachReload).not.toContainText(RESSOURCE_KENNUNG_VORHER);

    await imZweitenKontext(browser, "/ressourcen", async (zweite) => {
      const dort = zweite
        .getByRole("group", { name: "Fahrzeuge" })
        .locator("li")
        .filter({ hasText: RESSOURCE });

      await expect(dort).toHaveCount(1);
      await expect(dort).toContainText(RESSOURCE_KENNUNG_NACHHER);
      await expect(dort).not.toContainText(RESSOURCE_KENNUNG_VORHER);
    });
  });

  /*
   * B-04: `PATCH` ersetzt vollstaendig. Die Formulare haben fuer `costNote`
   * kein Feld und reichen einen vorhandenen Wert deshalb ausdruecklich durch -
   * sonst loeschte jedes Speichern den Hinweis still. Der Befund ist als
   * GESCHLOSSEN dokumentiert; hier steht der Browsernachweis dafuer, den es
   * bisher nur als Komponententest gab.
   */
  test("Mitarbeitende: Speichern loescht den nicht angezeigten Kostenhinweis nicht", async ({
    page,
  }) => {
    const seedPerson = await serverEintrag<{
      id: string;
      displayName: string;
      costNote: string | null;
    }>(page, "/api/mitarbeitende", (eintrag) => eintrag.displayName === "Dilan Yildiz");

    // Voraussetzung des Falls, gemessen statt angenommen.
    expect(seedPerson.costNote).toBe("PROTOTYPE_ONLY Demo-Fixture");

    await page.goto("/mitarbeitende");

    const zeile = page
      .getByTestId("mitarbeitendenliste")
      .locator("li")
      .filter({ hasText: "Dilan Yildiz" });

    await zeile.getByRole("button", { name: "Dilan Yildiz bearbeiten" }).click();

    // Auch hier ersetzt das Formular den Zeileninhalt; gespeichert wird ohne
    // jede Aenderung. Entscheidend ist der Speichervorgang, nicht sein Inhalt.
    const formular = page.locator("form");

    await expect(formular).toHaveCount(1);
    await formular.getByRole("button", { name: "Speichern" }).click();

    await expect(zeile.getByRole("button", { name: "Dilan Yildiz bearbeiten" })).toBeVisible();

    const danach = await serverEintrag<{
      id: string;
      displayName: string;
      costNote: string | null;
    }>(page, "/api/mitarbeitende", (eintrag) => eintrag.displayName === "Dilan Yildiz");

    expect(danach.costNote).toBe("PROTOTYPE_ONLY Demo-Fixture");
  });
});
