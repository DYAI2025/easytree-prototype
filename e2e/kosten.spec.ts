import { expect, test, type Page } from "@playwright/test";

/**
 * AC-10: Kostenansicht im Browser (REQ-F-019, REQ-F-020).
 *
 * Die Erwartungswerte werden hier AUS DEN SEED-WERTEN GERECHNET und nicht
 * abgeschrieben - ein abgeschriebener Betrag waere auch dann gruen, wenn die
 * Rechnung falsch ist.
 */
const PLANUNG = "/planung?monat=2026-09";

/** Seed-Tagessaetze in Minor Units (Abschnitt 12 des Plans). */
const SATZ = {
  anna: 32_000,
  bernd: 28_000,
  carla: 24_000,
  dilan: 26_000,
  erik: null,
  hebebuehne: 45_000,
  haecksler: 18_000,
  pritsche: 12_000,
  saegen: 3_000,
} as const;

function euro(minorUnits: number): string {
  const euroTeil = Math.trunc(minorUnits / 100);
  const cent = `${minorUnits % 100}`.padStart(2, "0");

  return `${euroTeil.toLocaleString("de-DE")},${cent} €`;
}

async function kostenOeffnen(page: Page, datum: string, einsatz: string) {
  await page.goto(PLANUNG);

  await page
    .locator(`[role="gridcell"][data-datum="${datum}"]`)
    .getByTestId("tageskarte")
    .filter({ hasText: einsatz })
    .click();

  const tagesdrawer = page.getByRole("dialog");

  await expect(tagesdrawer.getByTestId("tageskopf")).toContainText(einsatz);
  await tagesdrawer.getByRole("button", { name: "Kosten anzeigen" }).click();

  const kosten = page.getByRole("dialog");

  await expect(kosten.getByTestId("kostenkopf")).toContainText(einsatz);

  return kosten;
}

test.describe("kosten", () => {
  test("AC-10a: vollstaendige Saetze ergeben die gerechnete Gesamtsumme", async ({ page }) => {
    // Baumpflege Herbstschnitt: Anna, Bernd, Carla + Hebebuehne, Pritschenwagen
    // an zehn Werktagen.
    const proTag = SATZ.anna + SATZ.bernd + SATZ.carla + SATZ.hebebuehne + SATZ.pritsche;
    const erwartet = proTag * 10;

    const kosten = await kostenOeffnen(page, "2026-09-07", "Baumpflege Herbstschnitt");

    await expect(kosten.getByTestId("kostensumme")).toHaveText(euro(erwartet));
    await expect(kosten.getByTestId("kostenkopf")).toContainText("vollstaendig");
    await expect(kosten.getByTestId("kostenkopf")).not.toContainText("unvollstaendig");
    await expect(kosten.getByTestId("betrag-fehlt")).toHaveCount(0);
    await expect(kosten.getByTestId("kostenfussnote")).toContainText("prototype-daily-rate-v1");
  });

  test("AC-10b: ein satzloser Mitarbeiter erscheint als fehlt und macht die Summe unvollstaendig", async ({
    page,
  }) => {
    // Kronensicherung Allee: Bernd, Dilan, Erik + Haecksler, Motorsaegen-Set an
    // 15 Werktagen. Erik hat keinen Satz - 15 Luecken, und er darf NICHT als 0
    // mitgerechnet werden.
    const proTag = SATZ.bernd + SATZ.dilan + SATZ.haecksler + SATZ.saegen;
    const erwartet = proTag * 15;

    const kosten = await kostenOeffnen(page, "2026-09-14", "Kronensicherung Allee");

    await expect(kosten.getByTestId("kostenkopf")).toContainText(
      "unvollstaendig - 15 Grundlagen fehlen",
    );
    await expect(kosten.getByTestId("kostensumme")).toHaveText(euro(erwartet));

    const luecken = kosten.getByTestId("betrag-fehlt");

    await expect(luecken).toHaveCount(15);
    await expect(luecken.first()).toContainText("fehlt");

    // Der Negativnachweis: in keiner Luecke steht ein Betrag.
    for (const text of await luecken.allTextContents()) {
      expect(text).not.toContain("0,00");
      expect(text).not.toContain("€");
    }
  });

  /*
   * Produktinvariante 7: Kosten sind nie die Landeflaeche. Es gibt keinen
   * Navigationspunkt dorthin, und der Einstieg fuehrt in die Planung.
   */
  test("AC-10c: die Kostenansicht ist nicht die Startseite", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/planung\?monat=\d{4}-\d{2}$/);

    const navigation = page.getByRole("navigation", { name: "Hauptnavigation" });

    await expect(navigation.getByRole("link")).toHaveText([
      "Planung",
      "Mitarbeitende",
      "Ressourcen",
      "Auftraggeber",
    ]);
    await expect(navigation.getByRole("link", { name: /Kosten/ })).toHaveCount(0);
  });
});
