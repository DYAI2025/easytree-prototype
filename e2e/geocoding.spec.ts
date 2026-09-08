import { expect, test, type Page } from "@playwright/test";

/**
 * AC-09: Adresssuche im Browser - Erfolg und Ausfall (REQ-F-018).
 *
 * WICHTIG zur Beweiskraft: dieser Lauf nutzt den FIXTURE-Adapter
 * (`GEOCODER_PROVIDER=fixture`, `GEOCODER_ALLOW_FIXTURE=1` in
 * playwright.config.ts). Er belegt den Weg durch die Oberflaeche, die eigene
 * Route und die Datenbank - er belegt NICHT, dass eine echte
 * Adressdienst-Instanz erreichbar ist oder korrekt antwortet. Ein Live-Provider
 * braucht Zugangsdaten und ist HUMAN_INPUT_REQUIRED (H-04).
 */
const AUFTRAGGEBER = "/auftraggeber";
const KUNDE = "Stadtwerke Musterstadt";

async function baustellenformularOeffnen(page: Page, name: string): Promise<void> {
  await page.goto(AUFTRAGGEBER);
  await page.getByRole("button", { name: `${KUNDE} auswaehlen` }).click();
  await page.getByRole("button", { name: "Neue Baustelle" }).click();

  const formular = page.getByRole("form", { name: "Neue Baustelle" });

  await expect(formular).toBeVisible();
  await formular.getByLabel("Auftraggeber").and(page.locator(":disabled")).isVisible();
  await formular.getByLabel("Name der Baustelle").fill(name);
}

test.describe("geocoding", () => {
  test("AC-09a: ein Treffer der Adresssuche wird mit Koordinaten gespeichert", async ({ page }) => {
    const NAME = `Geocoding-Nachweis ${Date.now()}`;

    await baustellenformularOeffnen(page, NAME);

    const formular = page.getByRole("form", { name: "Neue Baustelle" });

    // "Nordring" und nicht der im Plan genannte Suchtext: der Fixture-Adapter
    // kennt genau die Schluessel nordring, zeppelinstrasse und suedhang und
    // liefert fuer alles andere eine leere Liste. Siehe PA-07.
    await formular.getByLabel("Adresse", { exact: true }).fill("Nordring");
    await formular.getByRole("button", { name: "Adresse suchen" }).click();

    const treffer = page.getByRole("option", { name: "Nordring 12, 14467 Potsdam" });

    await expect(treffer).toBeVisible();
    await treffer.click();

    await formular.getByRole("button", { name: "Baustelle speichern" }).click();
    await expect(page.getByRole("form", { name: "Neue Baustelle" })).toHaveCount(0);

    // Servertruth statt Bildschirmgedaechtnis: neu laden und erneut auswaehlen.
    await page.reload();
    await page.getByRole("button", { name: `${KUNDE} auswaehlen` }).click();

    const eintrag = page
      .getByRole("region", { name: "Baustellen" })
      .locator("li")
      .filter({ hasText: NAME });

    await expect(eintrag).toContainText("Nordring 12");
    await expect(eintrag).toContainText("14467");
    await expect(eintrag).toContainText("Koordinaten 52.4009, 13.0591");
    await expect(eintrag).toContainText("Quelle: fixture");
  });

  test("AC-09b: bei einem Serverfehler bleibt der manuelle Weg nutzbar", async ({ page }) => {
    const NAME = `Manueller Nachweis ${Date.now()}`;

    // Der Ausfall wird an der Grenze erzeugt, nicht im Produktcode: die Route
    // antwortet mit echtem Problem-JSON, die Oberflaeche muss damit umgehen.
    await page.route("**/api/geocoding/suche", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "urn:easytree-prototype:problem:GEOCODER_UNAVAILABLE",
          title: "Der Geocoding-Dienst ist nicht erreichbar.",
          status: 503,
          detail: "Simulierter Ausfall im E2E-Lauf.",
          correlationId: "e2e-geocoding",
        }),
      });
    });

    await baustellenformularOeffnen(page, NAME);

    const formular = page.getByRole("form", { name: "Neue Baustelle" });

    await formular.getByLabel("Adresse", { exact: true }).fill("Nordring");
    await formular.getByRole("button", { name: "Adresse suchen" }).click();

    // Im Formular suchen, nicht auf der ganzen Seite: Next haengt einen eigenen
    // leeren `div role="alert"` als Route-Announcer in den Body, und ein
    // seitenweiter getByRole("alert") ist dadurch mehrdeutig.
    await expect(formular.getByRole("alert")).toContainText(
      "Die Adresssuche ist gerade nicht erreichbar.",
    );

    await formular.getByRole("button", { name: "Adresse manuell eingeben" }).click();
    await formular.getByLabel("Adresse (manuell)").fill("Kastanienweg 3");
    await formular.getByLabel("Postleitzahl (manuell)").fill("14482");
    await formular.getByLabel("Ort (manuell)").fill("Potsdam");
    await formular.getByRole("button", { name: "Baustelle speichern" }).click();

    await expect(page.getByRole("form", { name: "Neue Baustelle" })).toHaveCount(0);

    await page.reload();
    await page.getByRole("button", { name: `${KUNDE} auswaehlen` }).click();

    const eintrag = page
      .getByRole("region", { name: "Baustellen" })
      .locator("li")
      .filter({ hasText: NAME });

    await expect(eintrag).toContainText("Kastanienweg 3");
    await expect(eintrag).toContainText("Keine Koordinaten hinterlegt");
  });
});
