import { expect, test, type Page } from "@playwright/test";

const PLANUNG = "/planung?monat=2026-09";

/**
 * 21.09.2026 bis 02.10.2026 ergibt zehn Werktage. Der 26. und 27.09. sind
 * Samstag und Sonntag und muessen leer bleiben.
 */
const WERKTAGE = [
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
];
const WOCHENENDE = ["2026-09-26", "2026-09-27"];

/*
 * AC-11 und AC-12 planen bewusst in einen LEEREN Monat.
 * Am 21.09. liegen nach den vorherigen Szenarien bereits drei Karten, und ab
 * der vierten fasst der Stapel zusammen ("+1 weitere") - die Karte waere dann
 * gar nicht im DOM. Das ist gewolltes Verhalten des Kalenders, aber es macht
 * eine Id-Zusicherung auf demselben Tag unzuverlaessig.
 */
const LEERER_MONAT = "/planung?monat=2026-11";

const TITEL_BASIS = "Kronensicherung Herbst";
const AUFTRAGGEBER = "Gruenflaechenamt Ost";
const BAUSTELLE = "Parkallee 7";

async function drawerOeffnen(page: Page) {
  await page.goto(PLANUNG);
  await page.getByRole("button", { name: "Einsatz anlegen" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** Schritt 1 bis 3 mit frisch angelegten Stammdaten. */
async function einsatzAnlegen(
  page: Page,
  optionen: { start: string; ende: string; titel: string },
) {
  await drawerOeffnen(page);

  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Titel", { exact: true }).fill(optionen.titel);

  await dialog.getByRole("button", { name: "Neuen Auftraggeber anlegen" }).click();
  await dialog.getByLabel("Name des Auftraggebers").fill(AUFTRAGGEBER);
  await dialog.getByRole("button", { name: "Auftraggeber speichern" }).click();
  // exact: true, sonst matcht der Teilstring auch "Name des Auftraggebers".
  await expect(dialog.getByLabel("Auftraggeber", { exact: true })).toHaveValue(/.+/);

  await dialog.getByRole("button", { name: "Neue Baustelle anlegen" }).click();
  await dialog.getByLabel("Name der Baustelle").fill(BAUSTELLE);
  await dialog.getByLabel("Adresse").fill("Parkallee 7, 12345 Musterstadt");
  await dialog.getByRole("button", { name: "Baustelle speichern" }).click();
  await expect(dialog.getByLabel("Baustelle", { exact: true })).toHaveValue(/.+/);

  await dialog.getByRole("button", { name: "Weiter" }).click();

  await dialog.getByLabel("Beginn", { exact: true }).fill(optionen.start);
  await dialog.getByLabel("Ende", { exact: true }).fill(optionen.ende);
  // Bewusst eine andere Farbe als die Seed-Einsaetze, damit die Zusicherungen
  // der Kalender-Spec nicht von diesem Einsatz beruehrt werden.
  await dialog.getByRole("radio", { name: "Rose" }).click();

  return dialog;
}

test.describe("einsatz-anlegen", () => {
  test("AC-02/AC-03: Anlage erzeugt Karten an genau den zehn Werktagen", async ({ page }) => {
    const titel = `${TITEL_BASIS} AC-02/AC-03`;
    const dialog = await einsatzAnlegen(page, { start: "2026-09-21", ende: "2026-10-02", titel });

    await expect(dialog.getByTestId("arbeitstage")).toContainText("10 Arbeitstage");
    await dialog.getByRole("button", { name: "Weiter" }).click();

    await expect(dialog.getByTestId("uebersicht")).toContainText("10 Arbeitstage");
    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();

    for (const tag of WERKTAGE) {
      await expect(
        page.locator(`[role="gridcell"][data-datum="${tag}"]`).getByText(titel),
      ).toHaveCount(1);
    }

    for (const tag of WOCHENENDE) {
      await expect(
        page.locator(`[role="gridcell"][data-datum="${tag}"]`).getByText(titel),
      ).toHaveCount(0);
    }
  });

  test("AC-05a: Zuordnung und Ids ueberleben einen Reload (Servertruth)", async ({
    page,
    request,
  }) => {
    const titel = `${TITEL_BASIS} AC-05a`;

    // Die Auswahl wird NAMENTLICH getroffen und die Zusicherung prueft
    // anschliessend genau diese Ids. Nur "zwei Stueck" zu zaehlen wuerde auch
    // dann gruen bleiben, wenn der Server zwei ANDERE Personen gespeichert
    // haette.
    const leute = (await (await request.get("/api/mitarbeitende")).json()) as {
      items: { id: string; displayName: string }[];
    };
    const geraete = (await (await request.get("/api/ressourcen")).json()) as {
      items: { id: string; name: string }[];
    };
    const erwartetePersonen = leute.items.slice(0, 2);
    const erwarteteMittel = geraete.items.slice(0, 2);

    expect(erwartetePersonen).toHaveLength(2);
    expect(erwarteteMittel).toHaveLength(2);

    // Eigener, sonst unbelegter Zeitraum: liegen an einem Tag vier Karten,
    // steckt die vierte hinter dem Disclosure und die Zusicherung wuerde am
    // Ueberlauf scheitern statt an der Sache.
    const dialog = await einsatzAnlegen(page, {
      start: "2026-11-16",
      ende: "2026-11-20",
      titel,
    });

    await dialog.getByRole("button", { name: "Weiter" }).click();

    for (const person of erwartetePersonen) {
      await dialog
        .getByTestId("mitarbeitende")
        .getByRole("checkbox", { name: new RegExp(person.displayName) })
        .check();
    }

    for (const mittel of erwarteteMittel) {
      await dialog
        .getByTestId("ressourcen")
        .getByRole("checkbox", { name: new RegExp(mittel.name) })
        .check();
    }

    await expect(dialog.getByTestId("auswahlzaehler")).toContainText("2 Personen");
    await expect(dialog.getByTestId("auswahlzaehler")).toContainText("2 Ressourcen");

    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.goto(LEERER_MONAT);

    const karten = page.getByTestId("tageskarte").filter({ hasText: titel });

    await expect(karten).toHaveCount(5);

    const idsVorher = await karten.evaluateAll((els) =>
      els.map((el) => ({
        einsatz: el.getAttribute("data-engagement-id"),
        tag: el.getAttribute("data-worksite-day-id"),
      })),
    );

    expect(idsVorher.every((eintrag) => /^[0-9a-f-]{36}$/.test(eintrag.einsatz ?? ""))).toBe(true);
    expect(idsVorher.every((eintrag) => /^[0-9a-f-]{36}$/.test(eintrag.tag ?? ""))).toBe(true);
    expect(new Set(idsVorher.map((eintrag) => eintrag.einsatz)).size).toBe(1);

    await page.reload();

    const nachReload = page.getByTestId("tageskarte").filter({ hasText: titel });

    await expect(nachReload).toHaveCount(5);

    const idsNachher = await nachReload.evaluateAll((els) =>
      els.map((el) => ({
        einsatz: el.getAttribute("data-engagement-id"),
        tag: el.getAttribute("data-worksite-day-id"),
      })),
    );

    expect(idsNachher).toEqual(idsVorher);

    // Servertruth: die persistierte Zuordnung, nicht der Kartenzaehler.
    for (const eintrag of idsNachher) {
      const antwort = await request.get(`/api/baustellentage/${eintrag.tag}`);

      expect(antwort.status()).toBe(200);

      const tag = (await antwort.json()) as {
        engagementId: string;
        employees: { id: string }[];
        resources: { id: string }[];
      };

      expect(tag.engagementId).toBe(idsNachher[0]!.einsatz);
      expect(tag.employees.map((e) => e.id).sort()).toEqual(
        erwartetePersonen.map((p) => p.id).sort(),
      );
      expect(tag.resources.map((r) => r.id).sort()).toEqual(
        erwarteteMittel.map((r) => r.id).sort(),
      );
    }
  });

  /*
   * AC-05b - mit TASK-043 wieder faellig und hier eingeloest.
   *
   * Der Fall war `DEFERRED_DUE_TO_PLAN_DEPENDENCY_CONTRADICTION`, weil
   * TASK-037 den Tagesdrawer verlangte, den der Plan erst in TASK-043 baut.
   * Der Drawer existiert jetzt und ist an der Tageskarte verdrahtet (PA-08).
   *
   * Geprueft werden IDS, nicht Anzahlen: "zwei angehakt" bliebe auch dann
   * gruen, wenn der Server zwei ANDERE Personen gespeichert haette. Und jede
   * nicht zugeordnete Person bzw. Ressource muss ausdruecklich NICHT angehakt
   * sein - sonst wuerde "alles angehakt" als Erfolg durchgehen.
   */
  test("AC-05b: der Tagesdrawer zeigt nach dem Reload dieselben Ids erneut", async ({
    page,
    request,
  }) => {
    const titel = `${TITEL_BASIS} AC-05b`;

    const leute = (await (await request.get("/api/mitarbeitende")).json()) as {
      items: { id: string; displayName: string }[];
    };
    const geraete = (await (await request.get("/api/ressourcen")).json()) as {
      items: { id: string; name: string }[];
    };
    const erwartetePersonen = leute.items.slice(0, 2);
    const erwarteteMittel = geraete.items.slice(0, 2);

    expect(erwartetePersonen).toHaveLength(2);
    expect(erwarteteMittel).toHaveLength(2);

    // Eigener, sonst voellig unbelegter Monat. 2026-12 waere falsch: dort legt
    // e2e/tagesstapel.spec.ts vier Einsaetze auf den 08.12. und zaehlt sie -
    // eine fuenfte Karte aus diesem Test hat jene Zusicherung rot gemacht
    // (gemessen). Alle Specs teilen EINE Datenbank.
    const dialog = await einsatzAnlegen(page, {
      start: "2027-01-11",
      ende: "2027-01-12",
      titel,
    });

    await dialog.getByRole("button", { name: "Weiter" }).click();

    for (const person of erwartetePersonen) {
      await dialog
        .getByTestId("mitarbeitende")
        .getByRole("checkbox", { name: new RegExp(person.displayName) })
        .check();
    }

    for (const mittel of erwarteteMittel) {
      await dialog
        .getByTestId("ressourcen")
        .getByRole("checkbox", { name: new RegExp(mittel.name) })
        .check();
    }

    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.goto("/planung?monat=2027-01");
    await page.reload();

    await page.getByTestId("tageskarte").filter({ hasText: titel }).first().click();

    const tagesdrawer = page.getByRole("dialog");

    await expect(tagesdrawer.getByTestId("tageskopf")).toContainText(titel);

    const angehakt = async (bereich: string): Promise<string[]> =>
      (
        await tagesdrawer
          .getByTestId(bereich)
          .locator('input[type="checkbox"]:checked')
          .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
      ).sort();

    expect(await angehakt("drawer-team")).toEqual(erwartetePersonen.map((p) => p.id).sort());
    expect(await angehakt("drawer-ressourcen")).toEqual(erwarteteMittel.map((r) => r.id).sort());

    const nichtAngehakt = async (bereich: string): Promise<string[]> =>
      (
        await tagesdrawer
          .getByTestId(bereich)
          .locator('input[type="checkbox"]:not(:checked)')
          .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
      ).sort();

    expect(await nichtAngehakt("drawer-team")).toEqual(
      leute.items
        .filter((p) => !erwartetePersonen.some((e) => e.id === p.id))
        .map((p) => p.id)
        .sort(),
    );
    expect(await nichtAngehakt("drawer-ressourcen")).toEqual(
      geraete.items
        .filter((r) => !erwarteteMittel.some((e) => e.id === r.id))
        .map((r) => r.id)
        .sort(),
    );
  });

  test("AC-11: die Einsatz-Id bleibt ueber einen Reload identisch", async ({ page }) => {
    const titel = `${TITEL_BASIS} AC-11`;
    const dialog = await einsatzAnlegen(page, { start: "2026-11-02", ende: "2026-11-06", titel });

    await dialog.getByRole("button", { name: "Weiter" }).click();
    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.goto(LEERER_MONAT);

    const karte = page.getByTestId("tageskarte").filter({ hasText: titel }).first();
    const vorher = await karte.getAttribute("data-engagement-id");

    expect(vorher).toMatch(/^[0-9a-f-]{36}$/);

    await page.reload();

    const nachher = await page
      .getByTestId("tageskarte")
      .filter({ hasText: titel })
      .first()
      .getAttribute("data-engagement-id");

    expect(nachher).toBe(vorher);
  });

  test("AC-12: ein zweiter Browserkontext sieht denselben Einsatz mit derselben Id", async ({
    page,
    browser,
  }) => {
    const titel = `${TITEL_BASIS} AC-12`;
    const dialog = await einsatzAnlegen(page, { start: "2026-11-09", ende: "2026-11-13", titel });

    await dialog.getByRole("button", { name: "Weiter" }).click();
    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.goto(LEERER_MONAT);

    const id = await page
      .getByTestId("tageskarte")
      .filter({ hasText: titel })
      .first()
      .getAttribute("data-engagement-id");

    // Ohne diese Zusicherung waere der Vergleich unten auch dann gruen, wenn
    // das Attribut ganz fehlte - null gegen null.
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const kontext = await browser.newContext();

    try {
      const zweite = await kontext.newPage();

      await zweite.goto(LEERER_MONAT);

      const karte = zweite.getByTestId("tageskarte").filter({ hasText: titel }).first();

      await expect(karte).toBeVisible();
      expect(await karte.getAttribute("data-engagement-id")).toBe(id);
    } finally {
      await kontext.close();
    }
  });

  test("AC-13: ein Start in der Vergangenheit wird abgelehnt", async ({ page }) => {
    const titel = `${TITEL_BASIS} AC-13`;
    // Der Zeitanker des Laufs ist 2026-09-01 (EASYTREE_FIXED_TODAY). Der Plan
    // nennt 2026-09-01 als Vergangenheit; unter diesem Anker ist das HEUTE,
    // also wird ein eindeutig frueheres Datum verwendet.
    const dialog = await einsatzAnlegen(page, { start: "2026-08-24", ende: "2026-09-04", titel });

    await dialog.getByRole("button", { name: "Weiter" }).click();
    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();

    await expect(dialog.getByRole("alert")).toContainText("Vergangenheit");
    await expect(page.getByTestId("tageskarte").filter({ hasText: titel })).toHaveCount(0);
  });
});
