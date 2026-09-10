import { expect, test, type Page } from "@playwright/test";

/**
 * EYT-174 / UX-081 / UX-082: der Fokus kehrt nach dem Schliessen des
 * Tagesdrawers zu dem Element zurueck, das ihn geoeffnet hat.
 *
 * Der Live-QA-Lauf QA-2026-09-09-01 hat gemessen, dass er stattdessen auf
 * `document.body` landete - nach `Esc` ebenso wie nach `Schliessen`, bei
 * Maus- ebenso wie bei Tastaturbedienung. Ein Nutzer der Tastatur stand danach
 * am Seitenanfang und musste sich durch die ganze Seite zurueckarbeiten.
 *
 * Warum dieser Nachweis im echten Browser stehen muss: der Drawer wird beim
 * Schliessen AUS DEM BAUM genommen (Schliessen ist eine Navigation, siehe
 * B-05), und die Fokusrueckgabe haengt an der Reihenfolge aus Radix-Unmount,
 * Router-Navigation und Neurender. Diese Reihenfolge bildet jsdom nur
 * naeherungsweise ab.
 */
const PLANUNG = "/planung?monat=2026-09";
const EINSATZ = "Baumpflege Herbstschnitt";
const TAG = "2026-09-10";

interface Fokus {
  readonly tag: string;
  readonly testid: string | null;
  readonly worksiteDayId: string | null;
  readonly datum: string | null;
  readonly label: string;
}

/** Beschreibt, was gerade den Fokus traegt - ohne den Fokus zu veraendern. */
async function fokus(page: Page): Promise<Fokus> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;

    if (el === null || el === document.body) {
      return { tag: "body", testid: null, worksiteDayId: null, datum: null, label: "" };
    }

    return {
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid"),
      worksiteDayId: el.getAttribute("data-worksite-day-id"),
      datum: el.closest('[role="gridcell"]')?.getAttribute("data-datum") ?? null,
      label: el.getAttribute("aria-label") ?? (el.textContent ?? "").trim(),
    };
  });
}

function karte(page: Page, datum: string) {
  return page
    .locator(`[role="gridcell"][data-datum="${datum}"]`)
    .getByTestId("tageskarte")
    .filter({ hasText: EINSATZ });
}

/**
 * Faehrt die Tageskarte AUSSCHLIESSLICH per Tastatur an. `.focus()` waere kein
 * Nachweis: es beweist nicht, dass die Karte auf dem Tastaturweg ueberhaupt
 * erreichbar ist, und es setzt den Fokus anders als eine echte Bedienung.
 */
async function tastaturBisKarte(page: Page, worksiteDayId: string): Promise<void> {
  let getroffen = false;

  for (let i = 0; i < 60 && !getroffen; i += 1) {
    await page.keyboard.press("Tab");
    getroffen = await page.evaluate(
      (id) => document.activeElement?.getAttribute("data-worksite-day-id") === id,
      worksiteDayId,
    );
  }

  expect(getroffen, `Tab erreicht die Tageskarte ${worksiteDayId} in 60 Schritten`).toBe(true);
}

async function idDerKarte(page: Page, datum: string): Promise<string> {
  const id = await karte(page, datum).getAttribute("data-worksite-day-id");

  expect(id).toMatch(/^[0-9a-f-]{36}$/);

  return id!;
}

test.describe("fokus-drawer", () => {
  test("EYT-174: per Maus geoeffnet, per Esc geschlossen - Fokus zurueck auf die Tageskarte", async ({
    page,
  }) => {
    await page.goto(PLANUNG);
    await expect(page.getByRole("grid")).toBeVisible();

    const id = await idDerKarte(page, TAG);

    await karte(page, TAG).click();
    await expect(page.getByRole("dialog").getByTestId("tageskopf")).toContainText(EINSATZ);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Der URL-Zustand bleibt bereinigt (B-05) - der Fix darf ihn nicht retten,
    // indem er den Drawer stehen laesst.
    await expect(page).toHaveURL(/\/planung\?monat=2026-09$/);

    const danach = await fokus(page);

    expect(danach.tag).not.toBe("body");
    expect(danach.testid).toBe("tageskarte");
    expect(danach.worksiteDayId).toBe(id);
    expect(danach.datum).toBe(TAG);
  });

  test("EYT-174: per Tastatur geoeffnet, per Esc geschlossen - Fokus zurueck auf dieselbe Karte", async ({
    page,
  }) => {
    await page.goto(PLANUNG);
    await expect(page.getByRole("grid")).toBeVisible();

    const id = await idDerKarte(page, TAG);

    await tastaturBisKarte(page, id);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").getByTestId("tageskopf")).toContainText(EINSATZ);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/planung\?monat=2026-09$/);

    const danach = await fokus(page);

    expect(danach.tag).not.toBe("body");
    expect(danach.worksiteDayId).toBe(id);
  });

  test("EYT-174: ueber den Schliessen-Knopf beendet - Fokus zurueck auf die Tageskarte", async ({
    page,
  }) => {
    await page.goto(PLANUNG);
    await expect(page.getByRole("grid")).toBeVisible();

    const id = await idDerKarte(page, TAG);

    await karte(page, TAG).click();
    await expect(page.getByRole("dialog").getByTestId("tageskopf")).toContainText(EINSATZ);

    await page.getByRole("dialog").getByRole("button", { name: "Dialog schliessen" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/planung\?monat=2026-09$/);

    const danach = await fokus(page);

    expect(danach.tag).not.toBe("body");
    expect(danach.testid).toBe("tageskarte");
    expect(danach.worksiteDayId).toBe(id);
  });

  /**
   * Die Fokusfalle darf durch die Rueckgabe nicht verloren gehen: solange der
   * Drawer offen ist, bleibt der Fokus in ihm.
   */
  test("EYT-174: die Fokusfalle im offenen Drawer bleibt erhalten", async ({ page }) => {
    await page.goto(PLANUNG);
    await expect(page.getByRole("grid")).toBeVisible();

    await karte(page, TAG).click();

    const drawer = page.getByRole("dialog");

    await expect(drawer.getByTestId("tageskopf")).toContainText(EINSATZ);

    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");

      const drin = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');

        return dialog !== null && dialog.contains(document.activeElement);
      });

      expect(drin, `Tab-Schritt ${i + 1} bleibt im Drawer`).toBe(true);
    }
  });

  /**
   * Kompaktform (Plan 6.2): unter 768 px oeffnet die Karte der Tagesliste den
   * Drawer. Diese Liste verschwindet beim Schliessen mit, weil `schliesse()`
   * auch `tag` aus der URL nimmt - der Ausloeser existiert danach nicht mehr.
   * Der Fokus gehoert dann an die Flaeche, ueber die derselbe Tag weiter
   * bedienbar ist, und keinesfalls auf den Seitenanfang.
   */
  test("EYT-174: Mobilform - Fokus faellt nicht auf den Seitenanfang", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${PLANUNG}&tag=${TAG}`);

    await expect(page.getByRole("grid")).toBeVisible();

    const liste = page.getByTestId("tagesliste");

    await expect(liste).toBeVisible();

    const mobilKarte = liste.getByTestId("tageskarte").filter({ hasText: EINSATZ });
    const id = await mobilKarte.getAttribute("data-worksite-day-id");

    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    await mobilKarte.click();
    await expect(page.getByRole("dialog").getByTestId("tageskopf")).toContainText(EINSATZ);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Voraussetzung des Falls, gemessen statt behauptet.
    await expect(page.getByTestId("tagesliste")).toHaveCount(0);

    const danach = await fokus(page);

    expect(danach.tag).not.toBe("body");
    expect(danach.testid).toBe("tagesindikator");
    expect(danach.datum).toBe(TAG);
  });
});
