import { expect, test, type Page } from "@playwright/test";

/**
 * B-05: Der Ansichtszustand der Planung steht in der URL.
 *
 * Vertragsquelle sind `CLAUDE.md` ("View state lives in the URL
 * (/planung?monat=…&tag=…&drawer=neu|tag|kosten&id=…)") und Plan 5.6 ("URL ist
 * Zustand … Reload rekonstruiert Ansicht und geoeffneten Drawer aus der URL").
 *
 * Der Nachweis laeuft ABSICHTLICH ueber Reload und Direktaufruf: nur beides
 * zusammen unterscheidet echten URL-Zustand von einem `useState`, das die URL
 * nebenher mitschreibt. Ein Test, der nur auf die URL schaut, waere auch dann
 * gruen, wenn der Drawer nach dem Reload verschwindet.
 */
const PLANUNG = "/planung?monat=2026-09";
const EINSATZ = "Baumpflege Herbstschnitt";
const TAG = "2026-09-07";

function karte(page: Page, datum: string, einsatz: string) {
  return page
    .locator(`[role="gridcell"][data-datum="${datum}"]`)
    .getByTestId("tageskarte")
    .filter({ hasText: einsatz });
}

/** Liest die Server-IDs aus dem Kalender, ohne den Drawer zu oeffnen. */
async function idsLesen(page: Page): Promise<{ worksiteDayId: string; engagementId: string }> {
  await page.goto(PLANUNG);

  const ziel = karte(page, TAG, EINSATZ);
  const worksiteDayId = await ziel.getAttribute("data-worksite-day-id");
  const engagementId = await ziel.getAttribute("data-engagement-id");

  expect(worksiteDayId).toMatch(/^[0-9a-f-]{36}$/);
  expect(engagementId).toMatch(/^[0-9a-f-]{36}$/);

  return { worksiteDayId: worksiteDayId!, engagementId: engagementId! };
}

function query(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

test.describe("planungs-url-state", () => {
  test("B05-1: der Tagesdrawer steht in der URL und ueberlebt den Reload", async ({ page }) => {
    const { worksiteDayId } = await idsLesen(page);

    await karte(page, TAG, EINSATZ).click();

    const drawer = page.getByRole("dialog");

    await expect(drawer.getByTestId("tageskopf")).toContainText(EINSATZ);

    const params = query(page.url());

    expect(params.get("monat")).toBe("2026-09");
    expect(params.get("drawer")).toBe("tag");
    expect(params.get("id")).toBe(worksiteDayId);
    expect(params.get("tag")).toBe(TAG);

    const gemerkt = page.url();

    await page.reload();

    const nachReload = page.getByRole("dialog");

    await expect(nachReload.getByTestId("tageskopf")).toContainText(EINSATZ);
    await expect(nachReload.getByTestId("tageskopf")).toHaveAttribute(
      "data-worksite-day-id",
      worksiteDayId,
    );
    expect(page.url()).toBe(gemerkt);
  });

  test("B05-2: der Kosten-Drawer steht in der URL und ueberlebt den Reload", async ({ page }) => {
    const { engagementId } = await idsLesen(page);

    await karte(page, TAG, EINSATZ).click();
    await expect(page.getByRole("dialog").getByTestId("tageskopf")).toContainText(EINSATZ);

    await page.getByRole("dialog").getByRole("button", { name: "Kosten anzeigen" }).click();

    await expect(page.getByRole("dialog").getByTestId("kostenkopf")).toContainText(EINSATZ);

    const params = query(page.url());

    expect(params.get("monat")).toBe("2026-09");
    expect(params.get("drawer")).toBe("kosten");
    expect(params.get("id")).toBe(engagementId);

    const gemerkt = page.url();

    await page.reload();

    const nachReload = page.getByRole("dialog");

    await expect(nachReload.getByTestId("kostenkopf")).toContainText(EINSATZ);
    await expect(nachReload.getByTestId("kostenkopf")).toHaveAttribute(
      "data-engagement-id",
      engagementId,
    );
    expect(page.url()).toBe(gemerkt);
  });

  test("B05-3: die Einsatzanlage steht in der URL und ueberlebt den Reload", async ({ page }) => {
    await page.goto(PLANUNG);

    await page.getByRole("button", { name: "Einsatz anlegen" }).first().click();

    await expect(page.getByRole("dialog").getByTestId("drawer-schritt")).toHaveText(
      "Schritt 1 von 3",
    );

    const params = query(page.url());

    expect(params.get("monat")).toBe("2026-09");
    expect(params.get("drawer")).toBe("neu");

    await page.reload();

    await expect(page.getByRole("dialog").getByTestId("drawer-schritt")).toHaveText(
      "Schritt 1 von 3",
    );
  });

  test("B05-4: Schliessen entfernt den Drawer-Zustand und behaelt den Monat", async ({ page }) => {
    await page.goto(PLANUNG);

    // Tagesdrawer
    await karte(page, TAG, EINSATZ).click();
    await expect(page.getByRole("dialog").getByTestId("tageskopf")).toContainText(EINSATZ);
    await page.getByRole("dialog").getByRole("button", { name: "Dialog schliessen" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);

    const nachTag = query(page.url());

    expect(nachTag.get("monat")).toBe("2026-09");
    expect(nachTag.get("drawer")).toBeNull();
    expect(nachTag.get("id")).toBeNull();

    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("grid")).toBeVisible();

    // Einsatzdrawer
    await page.getByRole("button", { name: "Einsatz anlegen" }).first().click();
    await expect(page.getByRole("dialog").getByTestId("drawer-schritt")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Dialog schliessen" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);

    const nachNeu = query(page.url());

    expect(nachNeu.get("monat")).toBe("2026-09");
    expect(nachNeu.get("drawer")).toBeNull();

    await page.reload();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("B05-5: ein Drawer-Link laesst sich direkt aufrufen", async ({ page }) => {
    const { worksiteDayId, engagementId } = await idsLesen(page);

    // Direktaufruf, ohne den Drawer in dieser Page je geoeffnet zu haben.
    await page.goto(`/planung?monat=2026-09&tag=${TAG}&drawer=tag&id=${worksiteDayId}`);

    const tagesdrawer = page.getByRole("dialog");

    await expect(tagesdrawer.getByTestId("tageskopf")).toContainText(EINSATZ);
    await expect(tagesdrawer.getByTestId("tageskopf")).toHaveAttribute(
      "data-worksite-day-id",
      worksiteDayId,
    );

    await page.goto(`/planung?monat=2026-09&drawer=kosten&id=${engagementId}`);

    const kostendrawer = page.getByRole("dialog");

    await expect(kostendrawer.getByTestId("kostenkopf")).toContainText(EINSATZ);
    await expect(kostendrawer.getByTestId("kostenkopf")).toHaveAttribute(
      "data-engagement-id",
      engagementId,
    );
  });

  /*
   * Negativpfad: ein unvollstaendiger oder unbekannter Ansichtszustand ist
   * KEIN fachlicher Fehler. Er darf die Planung weder zum Absturz bringen noch
   * eine erfundene Fehlermeldung erzeugen - er wird ignoriert, und der
   * Kalender steht.
   */
  test("B05-N: unbrauchbarer Drawer-Zustand faellt auf den Kalender zurueck", async ({ page }) => {
    const unbrauchbar = [
      "/planung?monat=2026-09&drawer=quatsch",
      "/planung?monat=2026-09&drawer=tag",
      "/planung?monat=2026-09&drawer=tag&id=nicht-uuid",
      "/planung?monat=2026-09&drawer=tag&id=a0000000-0000-4000-8000-0000000fffff",
      "/planung?monat=2026-09&drawer=kosten",
      "/planung?monat=2026-09&drawer=kosten&id=a0000000-0000-4000-8000-0000000fffff",
    ];

    for (const ziel of unbrauchbar) {
      await page.goto(ziel);

      await expect(page.getByRole("grid"), ziel).toBeVisible();
      await expect(page.getByRole("dialog"), ziel).toHaveCount(0);
      // Bewusst auf <main> eingegrenzt: Next haelt am Seitenende einen
      // dauerhaft leeren Route-Announcer mit role="alert" - der ist ein
      // Framework-Artefakt und keine Fehlermeldung der Planung.
      await expect(page.getByRole("main").getByRole("alert"), ziel).toHaveCount(0);
    }
  });

  /*
   * `drawer=neu` ist fuer sich gueltig - nur der Tag daneben taugt nichts. Der
   * Drawer oeffnet trotzdem; der unbrauchbare Tag faellt lautlos weg. Der
   * Kalender ist hier NICHT sichtbar zu erwarten: ein modaler Dialog nimmt den
   * Rest der Seite aus dem Accessibility-Baum.
   */
  test("B05-N: ein unbrauchbarer Tag macht die Einsatzanlage nicht kaputt", async ({ page }) => {
    await page.goto("/planung?monat=2026-09&tag=kein-datum&drawer=neu");

    const drawer = page.getByRole("dialog", { name: "Einsatz anlegen" });

    await expect(drawer.getByTestId("drawer-schritt")).toHaveText("Schritt 1 von 3");
    await expect(drawer.getByRole("alert")).toHaveCount(0);
  });
});
