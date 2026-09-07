import { expect, test } from "@playwright/test";

/**
 * Die Seed-Daten stammen aus Abschnitt 12 des Plans und werden einmal je Lauf
 * ueber globalSetup eingespielt.
 */
test.describe("kalender", () => {
  test("AC-01: September 2026 zeigt 35 Tageszellen", async ({ page }) => {
    await page.goto("/planung?monat=2026-09");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("September 2026");
    await expect(page.getByRole("gridcell")).toHaveCount(35);
    // Acht Spaltenkoepfe: Kalenderwoche plus sieben Wochentage.
    await expect(page.getByRole("columnheader")).toHaveCount(8);
    await expect(page.getByRole("rowheader")).toHaveCount(5);
  });

  test("AC-04: drei Mitarbeitende ergeben EINE Karte mit '3 Personen'", async ({ page }) => {
    await page.goto("/planung?monat=2026-09");

    // Baumpflege Herbstschnitt startet am 2026-09-07 mit Anna, Bernd und Carla.
    const zelle = page.locator('[role="gridcell"][data-datum="2026-09-07"]');
    const karten = zelle.getByTestId("tageskarte");

    await expect(karten).toHaveCount(1);
    await expect(karten.first()).toContainText("Baumpflege Herbstschnitt");
    await expect(karten.first()).toContainText("3 Personen");
    await expect(karten.first()).toContainText("2 Ressourcen");
  });

  test("AC-06: mehrtaegiger Einsatz hat Segmente in zwei Zeilen mit gleicher Farbe", async ({
    page,
  }) => {
    await page.goto("/planung?monat=2026-09");

    // Baumpflege laeuft 07.-18.09. und damit ueber zwei Kalenderzeilen.
    const segmente = page.locator('[data-testid="span-segment"][data-farbe="moos"]');
    await expect(segmente).toHaveCount(2);

    const zeilen = await segmente.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-zeile")),
    );
    expect(new Set(zeilen).size).toBe(2);

    // Die Information steckt in den Karten, nicht im Balken.
    await expect(segmente.first()).toHaveAttribute("aria-hidden", "true");
    for (const datum of ["2026-09-07", "2026-09-14", "2026-09-18"]) {
      await expect(
        page.locator(`[role="gridcell"][data-datum="${datum}"]`).getByTestId("tageskarte").first(),
      ).toContainText("Baumpflege Herbstschnitt");
    }
  });

  test("zeigt parallele Einsaetze an verschiedenen Baustellen als getrennte Karten", async ({
    page,
  }) => {
    await page.goto("/planung?monat=2026-09");

    // 10.09.: Baumpflege (Nordring) und Sturmschaden (Innenhof).
    const karten = page
      .locator('[role="gridcell"][data-datum="2026-09-10"]')
      .getByTestId("tageskarte");

    await expect(karten).toHaveCount(2);
    const farben = await karten.evaluateAll((els) => els.map((e) => e.getAttribute("data-farbe")));
    expect(new Set(farben).size).toBe(2);
  });

  test("enthaelt den zugewaehlten Samstag 19.09.", async ({ page }) => {
    await page.goto("/planung?monat=2026-09");

    await expect(
      page.locator('[role="gridcell"][data-datum="2026-09-19"]').getByTestId("tageskarte"),
    ).toHaveCount(1);
  });
});
