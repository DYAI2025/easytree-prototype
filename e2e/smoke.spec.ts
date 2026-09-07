import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("die Startseite antwortet und hat genau ein main#hauptinhalt", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.ok()).toBe(true);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main#hauptinhalt")).toBeVisible();
  });

  test("der Skip-Link ist das erste Tab-Ziel und zeigt auf den Hauptinhalt", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");

    await expect(focused).toHaveAttribute("href", "#hauptinhalt");
    await expect(focused).toHaveText("Zum Hauptinhalt");
    // sr-only darf das Element nicht aus dem Tabfluss nehmen.
    await expect(focused).toBeVisible();
  });

  test("die Startseite meldet 0 axe-Violations im echten Browser", async ({ page }) => {
    await page.goto("/");

    // Anders als in jsdom ist color-contrast hier auswertbar und bleibt aktiv;
    // dies ist die einzige Stelle, an der die Kontrastzusage der Tokens misst.
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();

    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
