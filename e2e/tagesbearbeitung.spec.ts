import { expect, test, type Page } from "@playwright/test";

/**
 * AC-07 (Tagesaenderung) und AC-08 (Serienaenderung) im echten Browser gegen
 * echtes PostgreSQL (REQ-F-015, REQ-F-016).
 *
 * Beide Szenarien arbeiten am Seed-Einsatz "Baumpflege Herbstschnitt":
 * Parkanlage Nordring, 07.09.-18.09.2026, zehn Werktage, Team Anna Bergmann,
 * Bernd Kowalski, Carla Nguyen.
 */
const PLANUNG = "/planung?monat=2026-09";
const EINSATZ = "Baumpflege Herbstschnitt";

/** Die zehn Werktage des Seed-Einsatzes in Reihenfolge. */
const TAGE = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
];

function karte(page: Page, datum: string) {
  return page
    .locator(`[role="gridcell"][data-datum="${datum}"]`)
    .getByTestId("tageskarte")
    .filter({ hasText: EINSATZ });
}

async function drawerOeffnen(page: Page, datum: string) {
  await karte(page, datum).click();

  const drawer = page.getByRole("dialog");

  await expect(drawer.getByTestId("tageskopf")).toContainText(EINSATZ);

  return drawer;
}

test.describe("tagesbearbeitung", () => {
  test("AC-07: nur dieser Tag aendert genau einen Tag", async ({ page }) => {
    await page.goto(PLANUNG);

    // Ausgangslage messen statt annehmen.
    for (const tag of TAGE) {
      await expect(karte(page, tag)).toContainText("3 Personen");
    }

    const drawer = await drawerOeffnen(page, TAGE[2]!);

    await drawer.getByRole("checkbox", { name: /Carla Nguyen/ }).uncheck();
    await expect(drawer.getByRole("radio", { name: "Nur dieser Tag" })).toBeChecked();
    await drawer.getByRole("button", { name: "Speichern" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();

    // Jeder nicht adressierte Tag wird EINZELN geprueft. Ein Zaehler ueber
    // alle Karten wuerde eine Verschiebung zwischen zwei Tagen nicht sehen.
    for (const [index, tag] of TAGE.entries()) {
      await expect(karte(page, tag)).toContainText(index === 2 ? "2 Personen" : "3 Personen");
    }

    // Servertruth, nicht Bildschirmgedaechtnis.
    await page.reload();

    for (const [index, tag] of TAGE.entries()) {
      await expect(karte(page, tag)).toContainText(index === 2 ? "2 Personen" : "3 Personen");
    }
  });

  /*
   * Baut AUSDRUECKLICH auf AC-07 auf: der 09.09. ist erst durch jenen Test
   * "individuell angepasst" (origin = day_edit). Genau das verlangt der Plan
   * fuer AC-08. Die Reihenfolge ist durch workers: 1 und fullyParallel: false
   * garantiert; beide Specs teilen eine Datenbank.
   */
  test("AC-08: die Serienaenderung laesst den angepassten Tag aus", async ({ page, request }) => {
    await page.goto(PLANUNG);

    const drawer = await drawerOeffnen(page, TAGE[1]!);

    // Bernd verlaesst das Team ab dem 08.09.
    await drawer.getByRole("checkbox", { name: /Bernd Kowalski/ }).uncheck();
    await drawer.getByRole("radio", { name: "Dieser und folgende Tage dieses Einsatzes" }).check();
    await drawer.getByRole("button", { name: "Vorschau anzeigen ..." }).click();

    const vorschau = page.getByRole("dialog");

    await expect(vorschau.getByRole("table")).toBeVisible();

    const zeilen = vorschau.getByRole("row");

    // Die Vorschau listet den 08.09. bis 18.09. - neun Tage plus Kopfzeile.
    await expect(zeilen).toHaveCount(10);

    const daten = await vorschau.getByRole("row").locator("td:first-child").allTextContents();

    expect(daten).toEqual([
      "08.09.2026",
      "09.09.2026",
      "10.09.2026",
      "11.09.2026",
      "14.09.2026",
      "15.09.2026",
      "16.09.2026",
      "17.09.2026",
      "18.09.2026",
    ]);

    // Der in AC-07 einzeln geaenderte 09.09. ist ausgeschlossen - genau das
    // schuetzt Produktinvariante 2 (A-06, OQ-001 offen).
    const zeileNeunter = vorschau.getByRole("row").filter({ hasText: "09.09.2026" });

    await expect(zeileNeunter).toContainText("individuell angepasst - ausgeschlossen");
    await expect(zeileNeunter.getByRole("checkbox")).not.toBeChecked();

    await vorschau.getByRole("button", { name: "Uebernehmen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.reload();

    // 07.09. war nicht im Zielbereich, 09.09. war ausgeschlossen.
    await expect(karte(page, TAGE[0]!)).toContainText("3 Personen");
    await expect(karte(page, TAGE[2]!)).toContainText("2 Personen");

    for (const tag of [TAGE[1]!, ...TAGE.slice(3)]) {
      await expect(karte(page, tag)).toContainText("2 Personen");
    }

    /*
     * Servertruth namentlich: "2 Personen" allein wuerde auch dann stimmen,
     * wenn am 09.09. Carla fehlte und am 10.09. Bernd - zwei verschiedene
     * Teams mit derselben Zahl.
     */
    const idFuer = async (datum: string): Promise<string> =>
      (await karte(page, datum).getAttribute("data-worksite-day-id")) ?? "";

    const neunter = (await (
      await request.get(`/api/baustellentage/${await idFuer(TAGE[2]!)}`)
    ).json()) as {
      employees: { displayName: string }[];
    };
    const zehnter = (await (
      await request.get(`/api/baustellentage/${await idFuer(TAGE[3]!)}`)
    ).json()) as {
      employees: { displayName: string }[];
    };

    // 09.09. behielt seine Einzelbearbeitung: Carla fehlt, Bernd ist da.
    expect(neunter.employees.map((p) => p.displayName).sort()).toEqual([
      "Anna Bergmann",
      "Bernd Kowalski",
    ]);
    // 10.09. bekam die Serienaenderung: Bernd fehlt, Carla ist da.
    expect(zehnter.employees.map((p) => p.displayName).sort()).toEqual([
      "Anna Bergmann",
      "Carla Nguyen",
    ]);
  });
});
