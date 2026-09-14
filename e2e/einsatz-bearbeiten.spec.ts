import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Einsatzbearbeitung im echten Browser gegen echtes PostgreSQL
 * (Confluence 49119274 D-007, Invariante 12; EYT-120).
 *
 * ZUSTANDSHOHEIT: alle Specs teilen EINE Datenbank. Diese Datei arbeitet
 * deshalb ausschliesslich in **August 2027** und legt ihre Einsaetze selbst an.
 * Belegt sind bereits 2026-08 (visual), 2026-09 (Seed), 2026-10/11
 * (einsatz-anlegen), 2026-12 (tagesstapel), 2027-01 (einsatz-anlegen) und
 * 2027-05 (erfolgsmeldung). Ein Eingriff in die September-Seed-Daten haette
 * `kalender`, `kosten` und `tagesbearbeitung` verfaelscht.
 *
 * Der 02.08.2027 ist ein Montag; 02.-06.08. und 09.-13.08. sind je fuenf
 * Werktage, 16.-20.08. die fuenf Werktage danach.
 */
const MONAT = "/planung?monat=2027-08";

interface Angelegt {
  readonly engagementId: string;
  readonly worksiteDayIds: string[];
  readonly localDates: string[];
}

/**
 * Legt einen Einsatz ueber die API an. Bewusst NICHT ueber den Assistenten:
 * die Anlage ist Gegenstand von `einsatz-anlegen.spec.ts`, hier ist sie nur
 * Vorbedingung. Was diese Datei beweist, ist die BEARBEITUNG - und die laeuft
 * vollstaendig ueber die Oberflaeche.
 */
async function einsatzAnlegen(
  request: APIRequestContext,
  optionen: {
    titel: string;
    baustelle: string;
    start: string;
    ende: string;
    key: string;
    beschreibung?: string;
  },
): Promise<Angelegt> {
  const baustellen = await request.get("/api/baustellen");

  expect(baustellen.status()).toBe(200);

  const { items } = (await baustellen.json()) as { items: { id: string; name: string }[] };
  const ziel = items.find((eintrag) => eintrag.name === optionen.baustelle);

  expect(ziel, `Seed-Baustelle "${optionen.baustelle}"`).toBeDefined();

  const antwort = await request.post("/api/einsaetze", {
    headers: { "Idempotency-Key": optionen.key },
    data: {
      worksiteId: ziel!.id,
      title: optionen.titel,
      ...(optionen.beschreibung === undefined ? {} : { description: optionen.beschreibung }),
      startDate: optionen.start,
      endDate: optionen.ende,
      colourKey: "schiefer",
      employeeIds: [],
      resourceIds: [],
    },
  });

  expect(antwort.status(), await antwort.text()).toBe(201);

  return (await antwort.json()) as Angelegt;
}

/** Servertruth des Einsatzes - Titel, Farbe, Zeitraum und seine Tage. */
async function detail(request: APIRequestContext, engagementId: string) {
  const antwort = await request.get(`/api/einsaetze/${engagementId}`);

  expect(antwort.status(), await antwort.text()).toBe(200);

  return (await antwort.json()) as {
    id: string;
    title: string;
    description: string | null;
    colourKey: string;
    endDate: string | null;
    updatedAt: string;
    days: { worksiteDayId: string; localDate: string; revisionNo: number; origin: string }[];
  };
}

function karte(page: Page, datum: string, titel: string) {
  return page
    .locator(`[role="gridcell"][data-datum="${datum}"]`)
    .getByTestId("tageskarte")
    .filter({ hasText: titel });
}

/** Tageskarte -> Tagesdrawer -> Einsatzdrawer. Der Weg, den ein Mensch geht. */
async function einsatzdrawerOeffnen(page: Page, datum: string, titel: string) {
  await karte(page, datum, titel).click();

  const tagesdrawer = page.getByRole("dialog");

  await expect(tagesdrawer.getByTestId("tageskopf")).toContainText(titel);
  await tagesdrawer.getByRole("button", { name: "Einsatz bearbeiten" }).click();

  const einsatzdrawer = page.getByRole("dialog", { name: "Einsatz bearbeiten" });

  await expect(einsatzdrawer.getByTestId("einsatzkopf")).toBeVisible();

  return einsatzdrawer;
}

test.describe("einsatz-bearbeiten", () => {
  test("Metadaten: geaenderter Titel ueberlebt Reload und zweiten Browser", async ({
    page,
    browser,
    request,
  }) => {
    /*
     * Die beiden Titel duerfen einander NICHT enthalten. `filter({ hasText })`
     * matcht als Teilzeichenkette - mit "… A" und "… A geaendert" fand die
     * Zusicherung „der alte Titel ist weg" die Karte immer noch und war nicht
     * erfuellbar (gemessen: Expected 0, Received 1).
     */
    const titel = "Regression Einsatzbearbeitung A";
    const neuerTitel = "Umbenannt Einsatzbearbeitung A";

    const angelegt = await einsatzAnlegen(request, {
      titel,
      baustelle: "Parkanlage Nordring",
      start: "2027-08-02",
      ende: "2027-08-06",
      key: "e2e-bearbeiten-a",
    });

    expect(angelegt.worksiteDayIds).toHaveLength(5);

    await page.goto(MONAT);

    const drawer = await einsatzdrawerOeffnen(page, "2027-08-02", titel);

    // Der Ansichtszustand steht in der URL wie jeder andere (B-05).
    const params = new URL(page.url()).searchParams;

    expect(params.get("drawer")).toBe("einsatz");
    expect(params.get("id")).toBe(angelegt.engagementId);

    await drawer.getByLabel("Titel").fill(neuerTitel);
    await drawer.getByRole("button", { name: "Speichern" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("erfolgsmeldung")).toContainText(neuerTitel);
    // Eine reine Metadatenaenderung ergaenzt KEINEN Tag - der Satz darf das
    // auch nicht behaupten.
    await expect(page.getByTestId("erfolgsmeldung")).not.toContainText("ergänzt");

    await expect(karte(page, "2027-08-02", neuerTitel)).toHaveCount(1);

    await page.reload();
    await expect(karte(page, "2027-08-02", neuerTitel)).toHaveCount(1);
    await expect(karte(page, "2027-08-02", titel)).toHaveCount(0);

    // Servertruth: Titel geaendert, Tage unangetastet.
    const nachher = await detail(request, angelegt.engagementId);

    expect(nachher.title).toBe(neuerTitel);
    expect(nachher.days.map((t) => t.worksiteDayId)).toEqual(angelegt.worksiteDayIds);
    expect(nachher.days.every((t) => t.revisionNo === 1)).toBe(true);

    const kontext = await browser.newContext();

    try {
      const zweite = await kontext.newPage();

      await zweite.goto(MONAT);

      const dort = karte(zweite, "2027-08-02", neuerTitel);

      await expect(dort).toHaveCount(1);
      expect(await dort.getAttribute("data-engagement-id")).toBe(angelegt.engagementId);
    } finally {
      await kontext.close();
    }
  });

  test("Verlaengerung: nur zusaetzliche Tage entstehen, bestehende bleiben identisch", async ({
    page,
    browser,
    request,
  }) => {
    const titel = "Regression Einsatzbearbeitung B";

    const angelegt = await einsatzAnlegen(request, {
      titel,
      baustelle: "Allee am Wasserwerk - Abschnitt West, Baumreihe 1-48",
      start: "2027-08-09",
      ende: "2027-08-13",
      key: "e2e-bearbeiten-b",
    });

    expect(angelegt.localDates).toEqual([
      "2027-08-09",
      "2027-08-10",
      "2027-08-11",
      "2027-08-12",
      "2027-08-13",
    ]);

    await page.goto(MONAT);

    const drawer = await einsatzdrawerOeffnen(page, "2027-08-09", titel);

    // Der Nutzer muss VOR dem Speichern wissen, was passiert.
    await expect(drawer.getByTestId("verlaengerungshinweis")).toContainText(
      "Bestehende Baustellentage bleiben unverändert",
    );
    await expect(drawer.getByTestId("verlaengerungshinweis")).toContainText(
      "zusätzliche Tage werden ergänzt",
    );

    const endeFeld = drawer.getByLabel("Ende");

    await endeFeld.fill("2027-08-20");
    // Der getippte Wert wird zugesichert: ein Datumsfeld formatiert seine
    // Segmente nach der Browsersprache, nicht nach der Seite.
    await expect(endeFeld).toHaveValue("2027-08-20");

    await drawer.getByRole("button", { name: "Speichern" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Die Zahl stammt aus der Serverantwort, nicht aus einer Differenz im Formular.
    await expect(page.getByTestId("erfolgsmeldung")).toContainText("5 Baustellentage");
    await expect(page.getByTestId("erfolgsmeldung")).toContainText("ergänzt");

    // Die fuenf neuen Tage stehen im Kalender ...
    for (const datum of ["2027-08-16", "2027-08-17", "2027-08-18", "2027-08-19", "2027-08-20"]) {
      await expect(karte(page, datum, titel)).toHaveCount(1);
    }

    // ... und das Wochenende dazwischen bleibt leer (D-005).
    for (const datum of ["2027-08-14", "2027-08-15"]) {
      await expect(karte(page, datum, titel)).toHaveCount(0);
    }

    const nachher = await detail(request, angelegt.engagementId);

    expect(nachher.days).toHaveLength(10);
    // Der eigentliche Beweis: dieselbe Einsatz-Id, dieselben fuenf Tages-Ids,
    // dieselben Revisionen - und fuenf neue obendrauf.
    expect(nachher.id).toBe(angelegt.engagementId);
    expect(nachher.days.slice(0, 5).map((t) => t.worksiteDayId)).toEqual(angelegt.worksiteDayIds);
    expect(nachher.days.every((t) => t.revisionNo === 1)).toBe(true);
    expect(nachher.days.every((t) => t.origin === "materialized")).toBe(true);
    expect(nachher.endDate).toBe("2027-08-20");

    await page.reload();
    await expect(karte(page, "2027-08-20", titel)).toHaveCount(1);

    const kontext = await browser.newContext();

    try {
      const zweite = await kontext.newPage();

      await zweite.goto(MONAT);
      await expect(karte(zweite, "2027-08-20", titel)).toHaveCount(1);
      expect(await karte(zweite, "2027-08-20", titel).getAttribute("data-engagement-id")).toBe(
        angelegt.engagementId,
      );
    } finally {
      await kontext.close();
    }
  });

  test("Nebenlaeufigkeit: der zweite Browser ueberschreibt den ersten nicht still", async ({
    page,
    browser,
    request,
  }) => {
    const titel = "Regression Einsatzbearbeitung C";

    const angelegt = await einsatzAnlegen(request, {
      titel,
      baustelle: "Spielplatz Suedhang",
      start: "2027-08-23",
      ende: "2027-08-27",
      key: "e2e-bearbeiten-c",
    });

    const kontext = await browser.newContext();

    try {
      const zweite = await kontext.newPage();

      // BEIDE Drawer werden geoeffnet, BEVOR einer speichert - nur so halten
      // sie denselben Stand.
      await page.goto(MONAT);

      const drawerA = await einsatzdrawerOeffnen(page, "2027-08-23", titel);

      await zweite.goto(MONAT);

      const drawerB = await einsatzdrawerOeffnen(zweite, "2027-08-23", titel);

      await drawerA.getByLabel("Titel").fill("Von A gespeichert");
      await drawerA.getByRole("button", { name: "Speichern" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      // B speichert auf dem inzwischen veralteten Stand.
      await drawerB.getByLabel("Titel").fill("Von B ueberschrieben");
      await drawerB.getByRole("button", { name: "Speichern" }).click();

      const meldung = drawerB.getByRole("alert");

      await expect(meldung).toContainText("Zwischenzeitlich geändert");
      await expect(meldung.getByRole("button", { name: "Neu laden" })).toBeVisible();
      // Der Drawer bleibt offen: nichts wurde gespeichert, also auch kein Erfolg.
      await expect(zweite.getByRole("dialog", { name: "Einsatz bearbeiten" })).toBeVisible();
      await expect(zweite.getByTestId("erfolgsmeldung")).toHaveText("");

      // Servertruth: A hat gewonnen, von B steht nichts drin.
      const nachher = await detail(request, angelegt.engagementId);

      expect(nachher.title).toBe("Von A gespeichert");
    } finally {
      await kontext.close();
    }
  });

  test("Beschreibung: geleerte Beschreibung bleibt nach Reload geleert", async ({
    page,
    browser,
    request,
  }) => {
    const titel = "Regression Einsatzbearbeitung E";

    const angelegt = await einsatzAnlegen(request, {
      titel,
      baustelle: "Parkanlage Nordring",
      start: "2027-08-23",
      ende: "2027-08-27",
      key: "e2e-bearbeiten-e",
      beschreibung: "Baumkontrolle Westseite",
    });

    // Vorbedingung, nicht Behauptung: der Server traegt den Text wirklich.
    expect((await detail(request, angelegt.engagementId)).description).toBe(
      "Baumkontrolle Westseite",
    );

    await page.goto(MONAT);

    const drawer = await einsatzdrawerOeffnen(page, "2027-08-23", titel);
    const feld = drawer.getByLabel("Beschreibung");

    await expect(feld).toHaveValue("Baumkontrolle Westseite");

    await feld.fill("");
    await expect(feld).toHaveValue("");

    await drawer.getByRole("button", { name: "Speichern" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("erfolgsmeldung")).toContainText(titel);

    /*
     * Servertruth, nicht React-State: genau hier log der Befund. Das Speichern
     * meldete Erfolg, weil der Drawer das geleerte Feld gar nicht erst
     * mitsendete - und der Reload holte den alten Text zurueck.
     */
    const nachher = await detail(request, angelegt.engagementId);

    expect(nachher.description).toBeNull();
    // Die Verlaengerungsinvariante bleibt unberuehrt: kein Tag kam dazu.
    expect(nachher.days.map((t) => t.worksiteDayId)).toEqual(angelegt.worksiteDayIds);
    expect(nachher.title).toBe(titel);

    await page.reload();

    const wieder = await einsatzdrawerOeffnen(page, "2027-08-23", titel);

    await expect(wieder.getByLabel("Beschreibung")).toHaveValue("");

    // Zweiter Browserkontext: die Loeschung ist Servertruth, nicht Tab-Zustand.
    const kontext = await browser.newContext();

    try {
      const zweite = await kontext.newPage();

      await zweite.goto(MONAT);

      const dort = await einsatzdrawerOeffnen(zweite, "2027-08-23", titel);

      await expect(dort.getByLabel("Beschreibung")).toHaveValue("");
    } finally {
      await kontext.close();
    }
  });

  test("Verkuerzung wird sichtbar abgelehnt und aendert nichts", async ({ page, request }) => {
    const titel = "Regression Einsatzbearbeitung D";

    const angelegt = await einsatzAnlegen(request, {
      titel,
      baustelle: "Innenhof Gruenblick",
      start: "2027-08-02",
      ende: "2027-08-13",
      key: "e2e-bearbeiten-d",
    });

    const vorher = await detail(request, angelegt.engagementId);

    expect(vorher.days).toHaveLength(10);

    await page.goto(MONAT);

    const drawer = await einsatzdrawerOeffnen(page, "2027-08-02", titel);
    const endeFeld = drawer.getByLabel("Ende");

    // Das Feld erklaert die Regel vorab - der Server setzt sie durch.
    await expect(endeFeld).toHaveAttribute("min", "2027-08-13");

    await endeFeld.fill("2027-08-06");
    await expect(endeFeld).toHaveValue("2027-08-06");
    await drawer.getByRole("button", { name: "Speichern" }).click();

    await expect(drawer.getByRole("alert")).toContainText("nicht verkuerzt werden");
    await expect(page.getByTestId("erfolgsmeldung")).toHaveText("");

    // Kein einziger Tag verschwunden, kein Datum verschoben.
    const nachher = await detail(request, angelegt.engagementId);

    expect(nachher.days.map((t) => t.worksiteDayId)).toEqual(
      vorher.days.map((t) => t.worksiteDayId),
    );
    expect(nachher.endDate).toBe("2027-08-13");
    expect(nachher.updatedAt).toBe(vorher.updatedAt);
  });
});
