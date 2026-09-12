import { expect, test, type Page } from "@playwright/test";

/**
 * Nachweise fuer die beiden Vertragsabweichungen, die die erste
 * Candidate-Runde von TASK-049 sichtbar gemacht hat:
 *
 * V049-01 - Plan 6.2 verlangt unter 768 px ein kompaktes Raster mit
 *           Farbpunkten und Zaehler; die Karten erscheinen erst nach Auswahl
 *           in einer Tagesliste unter dem Raster. Gezeigt wurde stattdessen
 *           das Desktop-Kartenlayout in einer horizontalen Scrollregion.
 * V049-02 - Plan 6.3 verlangt fuer Tage vor heute eine Schraffur und den
 *           erklaerenden Text "gesperrt". Beides fehlte vollstaendig.
 *
 * Der Zeitanker ist `EASYTREE_FIXED_TODAY=2026-09-01` (playwright.config.ts),
 * der ganze August 2026 liegt damit in der Vergangenheit.
 */
const SEPTEMBER = "/planung?monat=2026-09";
const AUGUST = "/planung?monat=2026-08";

const SCHMAL = [
  { name: "375", breite: 375 },
  { name: "320", breite: 320 },
] as const;

async function ueberlauf(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

test.describe("mobil", () => {
  for (const { name, breite } of SCHMAL) {
    test(`bei ${name} px traegt die Tageszelle den Kompaktindikator statt der Desktop-Karten`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      await page.goto(SEPTEMBER);
      await expect(page.getByRole("grid")).toBeVisible();

      const zelle = page.locator('[role="gridcell"][data-datum="2026-09-10"]');

      // Der Indikator ist da ...
      await expect(zelle.getByTestId("tagesindikator")).toBeVisible();
      // ... und die vollen Karten sind es NICHT. `toBeVisible` misst CSS, also
      // genau die Umschaltung am md-Umbruch.
      await expect(zelle.getByTestId("tageskarte")).toHaveCount(2);
      await expect(zelle.getByTestId("tageskarte").first()).not.toBeVisible();
    });

    test(`bei ${name} px ist die Anzahl paralleler Einsaetze als Text lesbar`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      await page.goto(SEPTEMBER);

      const indikator = page
        .locator('[role="gridcell"][data-datum="2026-09-10"]')
        .getByTestId("tagesindikator");

      /*
       * Am 10.09. liegen zwei parallele Einsaetze (Nordring + Innenhof).
       *
       * Gemessen wird der SICHTBARE Text ueber innerText, nicht textContent:
       * das Wort "Einsaetze" steht auf dieser Breite ausserhalb des Layouts,
       * und textContent enthielte es trotzdem - die Zusicherung waere dann
       * gruen, ohne dass irgendjemand die Zahl sieht.
       */
      const sichtbar = await indikator.evaluate((el) => (el as HTMLElement).innerText.trim());

      expect(sichtbar).toBe("2");
      // Der volle Wortlaut bleibt im zugaenglichen Namen erhalten.
      await expect(indikator).toHaveAttribute(
        "aria-label",
        "Donnerstag, 10. September 2026, 2 Einsaetze, Tagesliste anzeigen",
      );
    });

    test(`bei ${name} px macht die Tagesauswahl die Tagesliste sichtbar`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      await page.goto(SEPTEMBER);

      // Vor der Auswahl gibt es keine Liste.
      await expect(page.getByTestId("tagesliste")).toHaveCount(0);

      await page
        .locator('[role="gridcell"][data-datum="2026-09-10"]')
        .getByTestId("tagesindikator")
        .click();

      const liste = page.getByTestId("tagesliste");

      await expect(liste).toBeVisible();
      // Die Auswahl ist NICHT nur farblich erkennbar: die Liste nennt den Tag
      // im Klartext, und der Indikator meldet sie ueber aria-pressed.
      await expect(liste.getByRole("heading", { level: 2 })).toHaveText(
        "Donnerstag, 10. September 2026",
      );
      await expect(
        page.locator('[role="gridcell"][data-datum="2026-09-10"]').getByTestId("tagesindikator"),
      ).toHaveAttribute("aria-pressed", "true");

      // Die Auswahl steht in der URL, ueberlebt also einen Reload (B-05).
      expect(new URL(page.url()).searchParams.get("tag")).toBe("2026-09-10");
      await page.reload();
      await expect(page.getByTestId("tagesliste")).toBeVisible();
    });

    test(`bei ${name} px bleiben die Tageskarten ueber die Tagesliste bedienbar`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      await page.goto(`${SEPTEMBER}&tag=2026-09-10`);

      const liste = page.getByTestId("tagesliste");
      const karten = liste.getByTestId("tageskarte");

      await expect(karten).toHaveCount(2);
      await expect(karten.first()).toBeVisible();

      // Aus der Liste heraus oeffnet die Karte den Baustellentag.
      await karten.filter({ hasText: "Baumpflege Herbstschnitt" }).click();
      await expect(page.getByRole("dialog").getByTestId("tageskopf")).toContainText(
        "Baumpflege Herbstschnitt",
      );
    });

    test(`bei ${name} px laeuft das Dokument nirgends horizontal ueber`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      await page.goto(SEPTEMBER);
      await expect(page.getByRole("grid")).toBeVisible();

      expect(await ueberlauf(page)).toEqual({ scrollWidth: breite, clientWidth: breite });

      // Auch mit geoeffneter Tagesliste, die zusaetzliche Breite einbringt.
      await page
        .locator('[role="gridcell"][data-datum="2026-09-10"]')
        .getByTestId("tagesindikator")
        .click();
      await expect(page.getByTestId("tagesliste")).toBeVisible();

      expect(await ueberlauf(page)).toEqual({ scrollWidth: breite, clientWidth: breite });
    });

    test(`bei ${name} px bleibt die Bedienflaeche der Zelle mindestens 44 px hoch`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      await page.goto(SEPTEMBER);

      const indikatoren = page.getByTestId("tagesindikator");
      const anzahl = await indikatoren.count();

      expect(anzahl).toBeGreaterThan(0);

      const zuKlein: string[] = [];

      for (let i = 0; i < anzahl; i += 1) {
        const kasten = await indikatoren.nth(i).boundingBox();

        if (kasten !== null && kasten.height < 44) {
          zuKlein.push(`${i}: ${kasten.height.toFixed(1)}`);
        }
      }

      expect(zuKlein).toEqual([]);
    });
  }

  test("ab 1024 px bleibt das Desktop-Kartenlayout unveraendert", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SEPTEMBER);

    const zelle = page.locator('[role="gridcell"][data-datum="2026-09-10"]');

    // Umgekehrte Zusicherung zur Mobilform: hier tragen die Zellen die Karten,
    // und der Kompaktindikator ist unsichtbar.
    await expect(zelle.getByTestId("tageskarte").first()).toBeVisible();
    await expect(zelle.getByTestId("tagesindikator")).not.toBeVisible();
    await expect(page.getByTestId("tagesliste")).toHaveCount(0);
  });
});

test.describe("vergangenheit", () => {
  test("markiert im August 2026 jeden Tag des Monats als vergangen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(AUGUST);
    await expect(page.getByRole("grid")).toBeVisible();

    // Der ganze August liegt vor dem Zeitanker 2026-09-01.
    const augusttage = page.locator('[role="gridcell"][data-datum^="2026-08-"]');

    await expect(augusttage).toHaveCount(31);
    await expect(
      page.locator('[role="gridcell"][data-datum^="2026-08-"][data-vergangen="true"]'),
    ).toHaveCount(31);
  });

  test("zeichnet auf vergangenen Tagen ein sichtbares Muster", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(AUGUST);

    const vergangen = page.locator('[role="gridcell"][data-datum="2026-08-17"]');
    const zukunft = page.locator('[role="gridcell"][data-datum="2026-09-02"]');

    // Gemessen wird der tatsaechlich berechnete Stil, nicht die Klasse: nur so
    // ist belegt, dass das Muster im Browser wirklich gezeichnet wird.
    const musterVergangen = await vergangen.evaluate((el) => getComputedStyle(el).backgroundImage);
    const musterZukunft = await zukunft.evaluate((el) => getComputedStyle(el).backgroundImage);

    expect(musterVergangen).toContain("repeating-linear-gradient");
    expect(musterZukunft).toBe("none");
  });

  test("erklaert den Zustand mit dem Wort gesperrt", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(AUGUST);

    await expect(page.locator('[role="gridcell"][data-datum="2026-08-17"]')).toHaveAttribute(
      "title",
      /gesperrt/,
    );
  });

  test("laesst vergangene Tage adressierbar - gesperrt ist keine Deaktivierung", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(AUGUST);

    const zelle = page.locator('[role="gridcell"][data-datum="2026-08-17"]');

    await expect(zelle).not.toHaveAttribute("aria-disabled", "true");

    // Die Zelle nimmt weiterhin den Fokus und reagiert auf die Tastatur.
    await zelle.focus();
    await expect(zelle).toBeFocused();
  });

  test("markiert im September nur die Tage vor dem Zeitanker", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(SEPTEMBER);

    // Zeitanker 2026-09-01: der 31.08. ist vergangen, heute und danach nicht.
    await expect(page.locator('[role="gridcell"][data-datum="2026-08-31"]')).toHaveAttribute(
      "data-vergangen",
      "true",
    );
    await expect(
      page.locator('[role="gridcell"][data-datum="2026-09-01"][data-vergangen="true"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[role="gridcell"][data-datum="2026-09-10"][data-vergangen="true"]'),
    ).toHaveCount(0);
  });
});
