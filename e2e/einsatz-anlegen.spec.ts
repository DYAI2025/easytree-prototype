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

  test("AC-05: zugeordnete Personen und Ressourcen ueberleben einen Reload", async ({ page }) => {
    const titel = `${TITEL_BASIS} AC-05`;
    const dialog = await einsatzAnlegen(page, { start: "2026-09-21", ende: "2026-10-02", titel });

    await dialog.getByRole("button", { name: "Weiter" }).click();

    const personen = dialog.getByTestId("mitarbeitende").getByRole("checkbox");
    const mittel = dialog.getByTestId("ressourcen").getByRole("checkbox");

    await personen.nth(0).check();
    await personen.nth(1).check();
    await mittel.nth(0).check();
    await mittel.nth(1).check();

    await expect(dialog.getByTestId("auswahlzaehler")).toContainText("2 Personen");
    await expect(dialog.getByTestId("auswahlzaehler")).toContainText("2 Ressourcen");

    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    const karte = page
      .locator(`[role="gridcell"][data-datum="2026-09-21"]`)
      .getByTestId("tageskarte")
      .filter({ hasText: titel });

    await expect(karte).toContainText("2 Personen");
    await expect(karte).toContainText("2 Ressourcen");

    await page.reload();

    const nachReload = page
      .locator(`[role="gridcell"][data-datum="2026-09-21"]`)
      .getByTestId("tageskarte")
      .filter({ hasText: titel });

    await expect(nachReload).toContainText("2 Personen");
    await expect(nachReload).toContainText("2 Ressourcen");
  });

  /*
   * Der zweite Teil von AC-05 - dieselbe Auswahl NOCH EINMAL im Tagesdrawer
   * sehen - braucht einen Tagesdrawer, den es noch nicht gibt. Das ist neue
   * Implementierung und nicht die in TASK-037 erlaubte Verdrahtungsluecke,
   * deshalb steht der Fall hier sichtbar offen statt still zu fehlen. Der
   * Persistenznachweis selbst steckt bereits im Test darueber: nach dem
   * Reload steht "2 Personen / 2 Ressourcen" auf der Karte, und die kommt
   * aus der Datenbank.
   */
  test.fixme("AC-05 (Rest): der Tagesdrawer zeigt die Auswahl erneut", async ({ page }) => {
    await page.goto(PLANUNG);
    await page.getByTestId("tageskarte").first().click();

    const tagesdrawer = page.getByRole("dialog");

    await expect(tagesdrawer.getByTestId("gewaehlte-personen")).toContainText("2");
    await expect(tagesdrawer.getByTestId("gewaehlte-ressourcen")).toContainText("2");
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
