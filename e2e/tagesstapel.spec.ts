import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Befund B-02: ab der vierten Karte an einem Tag lag die vierte hinter
 * "+n weitere", und der Knopf hatte keinen Handler - die Karte war ueber die
 * Oberflaeche nicht erreichbar.
 *
 * Der Aufbau laeuft ueber die API, nicht durch den Drawer: geprueft wird der
 * Ueberlauf im Kalender, nicht noch einmal die Anlage. Vier Einsaetze am
 * selben Tag brauchen VIER Baustellen - ein Baustellentag ist je Baustelle und
 * Datum eindeutig.
 */
const MONAT = "/planung?monat=2026-12";
/*
 * Jeder Test bekommt seinen EIGENEN Tag und eigene Idempotency-Keys.
 * Beim ersten Versuch teilten sich beide Tests Tag und Keys; der zweite Lauf
 * lief in 409 IDEMPOTENCY_KEY_REUSED, weil derselbe Key mit einem anderen
 * Rumpf (neue Baustellen-Id) kam.
 */
const TAG_MAUS = "2026-12-07";
const TAG_TASTATUR = "2026-12-08";
const FARBEN = ["moos", "ocker", "himmel", "ton"] as const;

async function stapelAufbauen(
  request: APIRequestContext,
  lauf: string,
  tag: string,
): Promise<string[]> {
  const kunde = await request.post("/api/auftraggeber", {
    data: { name: `Stapel-Auftraggeber ${lauf}` },
  });

  expect(kunde.status()).toBe(201);

  const customerId = ((await kunde.json()) as { id: string }).id;
  const titel: string[] = [];

  for (const [index, farbe] of FARBEN.entries()) {
    const baustelle = await request.post("/api/baustellen", {
      data: {
        customerId,
        name: `Stapelbaustelle ${lauf} ${index + 1}`,
        addressLine: `Stapelweg ${index + 1}`,
      },
    });

    expect(baustelle.status()).toBe(201);

    const worksiteId = ((await baustelle.json()) as { id: string }).id;
    const name = `Stapeleinsatz ${lauf} ${index + 1}`;

    const einsatz = await request.post("/api/einsaetze", {
      headers: { "Idempotency-Key": `stapel-${lauf}-${index + 1}-${tag}` },
      data: {
        worksiteId,
        title: name,
        startDate: tag,
        endDate: tag,
        colourKey: farbe,
        employeeIds: [],
        resourceIds: [],
      },
    });

    expect(einsatz.status()).toBe(201);
    titel.push(name);
  }

  return titel;
}

test.describe("tagesstapel", () => {
  test("B-02: der vierte Einsatz eines Tages ist ueber +1 weitere erreichbar", async ({
    page,
    request,
  }) => {
    const titel = await stapelAufbauen(request, "maus", TAG_MAUS);

    await page.goto(MONAT);

    const zelle = page.locator(`[role="gridcell"][data-datum="${TAG_MAUS}"]`);

    // 1. Initial nur die begrenzte Menge.
    await expect(zelle.getByTestId("tageskarte")).toHaveCount(3);
    await expect(zelle.getByText(titel[3]!)).toHaveCount(0);

    // 2. Das Disclosure-Control ist da und sagt seinen Zustand an.
    const mehr = zelle.getByTestId("mehr-karten");

    await expect(mehr).toHaveText("+1 weitere");
    await expect(mehr).toHaveAttribute("aria-expanded", "false");

    // 3. Aktivierung.
    await mehr.click();

    // 4. Die vierte Karte ist sichtbar, fokussierbar und bedienbar.
    await expect(zelle.getByTestId("tageskarte")).toHaveCount(4);
    await expect(mehr).toHaveAttribute("aria-expanded", "true");
    await expect(mehr).toHaveText("Weniger anzeigen");

    const vierte = zelle.getByTestId("tageskarte").filter({ hasText: titel[3]! });

    await expect(vierte).toBeVisible();
    await vierte.focus();
    await expect(vierte).toBeFocused();

    await mehr.click();
    await expect(zelle.getByTestId("tageskarte")).toHaveCount(3);
  });

  test("B-02: das Aufklappen geht auch mit der Tastatur", async ({ page, request }) => {
    const titel = await stapelAufbauen(request, "tastatur", TAG_TASTATUR);

    await page.goto(MONAT);

    const zelle = page.locator(`[role="gridcell"][data-datum="${TAG_TASTATUR}"]`);
    const mehr = zelle.getByTestId("mehr-karten");

    await mehr.focus();
    await expect(mehr).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(zelle.getByTestId("tageskarte")).toHaveCount(4);
    await expect(zelle.getByTestId("tageskarte").filter({ hasText: titel[3]! })).toBeVisible();
  });
});
