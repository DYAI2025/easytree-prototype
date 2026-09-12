import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PLANUNG = "/planung?monat=2026-09";

/** Fokussiert den naechsten Tabstopp und beschreibt, was den Fokus traegt. */
async function tabStops(page: Page, maximum: number) {
  const gesehen: {
    beschreibung: string;
    outlineWidth: string;
    outlineStyle: string;
    boxShadow: string;
  }[] = [];

  for (let i = 0; i < maximum; i += 1) {
    await page.keyboard.press("Tab");

    const treffer = await page.evaluate(() => {
      const el = document.activeElement;

      if (el === null || el === document.body) {
        return null;
      }

      const stil = window.getComputedStyle(el);

      return {
        beschreibung: `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`,
        outlineWidth: stil.outlineWidth,
        outlineStyle: stil.outlineStyle,
        boxShadow: stil.boxShadow,
      };
    });

    if (treffer === null) {
      break;
    }

    gesehen.push(treffer);
  }

  return gesehen;
}

test.describe("barrierefreiheit", () => {
  /*
   * Der Scan deckt AUSSCHLIESSLICH die vier WCAG-Tags ab. Regeln der Kategorie
   * best-practice - darunter empty-table-header - liegen nicht darin; die
   * decken die Komponententests aus TASK-028 ab. "Gruen" heisst hier also
   * "keine wcag2a/2aa-Verstoesse", nicht "axe findet nichts".
   */
  test("die Planungsseite hat keine wcag2a/wcag2aa-Verstoesse", async ({ page }) => {
    await page.goto(PLANUNG);
    await expect(page.getByRole("grid")).toBeVisible();

    const ergebnis = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Vollstaendige Ausgabe statt nur der Anzahl: eine nackte 0 sagt nicht,
    // welche Regel gegriffen haette.
    expect(
      ergebnis.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
    ).toEqual([]);
  });

  test("jeder Tabstopp traegt einen sichtbaren Fokusindikator", async ({ page }) => {
    await page.goto(PLANUNG);
    await expect(page.getByRole("grid")).toBeVisible();

    const stopps = await tabStops(page, 30);

    expect(stopps.length).toBeGreaterThan(0);

    // Mindestens 2px: der Default-Fokusring des Browsers ist duenner. Ohne
    // diese Schwelle koennte die Pruefung nie fehlschlagen - sie wuerde auch
    // dann gruen bleiben, wenn die eigene Fokusregel geloescht waere.
    const ohneIndikator = stopps.filter(
      (s) =>
        (s.outlineStyle === "none" || Number.parseFloat(s.outlineWidth) < 2) &&
        s.boxShadow === "none",
    );

    expect(ohneIndikator.map((s) => s.beschreibung)).toEqual([]);
  });

  test("das Monatsraster hat genau EINEN Tabstopp, nicht 35", async ({ page }) => {
    await page.goto(PLANUNG);

    const imRaster = await page
      .locator('[role="gridcell"][tabindex="0"]')
      .evaluateAll((els) => els.length);

    expect(imRaster).toBe(1);
    expect(await page.locator('[role="gridcell"][tabindex="-1"]').count()).toBe(34);
  });
});
