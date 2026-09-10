import { expect, test, type Page } from "@playwright/test";

/*
 * EYT-175 / UX-020 im echten Browser.
 *
 * Der Live-QA-Lauf QA-2026-09-09-01 hat gemessen, dass `POST /api/einsaetze`
 * mit `201` antwortet, die Daten korrekt liegen - und die Oberflaeche danach
 * schweigt: kein sichtbarer Erfolgstext, kein `[role="status"]`.
 *
 * Genau dieser Weg braucht den Browsernachweis. Die Komponententests fahren
 * denselben Assistenten in jsdom, aber nur hier laeuft er gegen den echten
 * Server, die echte Idempotenz und den echten Produktionsbuild - und nur hier
 * ist die genannte Tagesanzahl mit dem tatsaechlich persistierten Zustand
 * abgeglichen.
 *
 * Mai 2027 ist bewusst gewaehlt: alle Specs teilen EINE Datenbank, und dieser
 * Monat ist in keiner anderen belegt (2026-08 bis 2026-12, 2027-01 und 2027-03
 * sind vergeben). Ein fremder Einsatz im selben Monat wuerde die Zaehlung unten
 * verfaelschen.
 */
const MONAT = "2027-05";
const PLANUNG_START = "/planung?monat=2026-09";

/** 03.05.2027 (Mo) bis 07.05.2027 (Fr) - fuenf Werktage, kein Wochenende dabei. */
const START = "2027-05-03";
const ENDE = "2027-05-07";
const ERWARTETE_TAGE = 5;

const AUFTRAGGEBER = "Erfolgsmeldung Auftraggeber";
const BAUSTELLE = "Erfolgsmeldung Baustelle";

/** Der immer vorhandene Live-Bereich der Erfolgsmeldung. */
function meldung(page: Page) {
  return page.getByTestId("erfolgsmeldung");
}

/**
 * Schritt 1 und 2 der Einsatzanlage mit frisch angelegten Stammdaten.
 *
 * Eigene Stammdaten statt Seed-Auswahl: die Auswahlfelder tragen sonst je nach
 * Reihenfolge der Specs unterschiedlich viele Optionen, und der Test haette
 * eine Abhaengigkeit, die nichts mit EYT-175 zu tun hat.
 */
async function assistentBisSchritt3(
  page: Page,
  optionen: { titel: string; start: string; ende: string },
) {
  await page.goto(PLANUNG_START);
  await page.getByRole("button", { name: "Einsatz anlegen" }).first().click();

  const dialog = page.getByRole("dialog");

  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Titel", { exact: true }).fill(optionen.titel);

  await dialog.getByRole("button", { name: "Neuen Auftraggeber anlegen" }).click();
  await dialog.getByLabel("Name des Auftraggebers").fill(AUFTRAGGEBER);
  await dialog.getByRole("button", { name: "Auftraggeber speichern" }).click();
  // exact: true, sonst matcht der Teilstring auch "Name des Auftraggebers".
  await expect(dialog.getByLabel("Auftraggeber", { exact: true })).toHaveValue(/.+/);

  await dialog.getByRole("button", { name: "Neue Baustelle anlegen" }).click();
  await dialog.getByLabel("Name der Baustelle").fill(BAUSTELLE);
  await dialog.getByLabel("Adresse").fill("Erfolgsweg 1, 12345 Musterstadt");
  await dialog.getByRole("button", { name: "Baustelle speichern" }).click();
  await expect(dialog.getByLabel("Baustelle", { exact: true })).toHaveValue(/.+/);

  await dialog.getByRole("button", { name: "Weiter" }).click();

  await dialog.getByLabel("Beginn", { exact: true }).fill(optionen.start);
  await dialog.getByLabel("Ende", { exact: true }).fill(optionen.ende);
  await dialog.getByRole("button", { name: "Weiter" }).click();

  return dialog;
}

test.describe("erfolgsmeldung", () => {
  test("UX-020: die Anlage wird sichtbar und programmatisch bestaetigt - mit Name und Tagesanzahl", async ({
    page,
    request,
  }) => {
    const titel = "Erfolgsmeldung Einsatzanlage";

    /*
     * Der Live-Bereich muss SCHON VOR der Aktion im Dokument stehen. Erschien
     * er erst mit seinem Text, waere er fuer assistive Technik neuer Inhalt
     * statt einer Aenderung - und typischerweise stumm.
     */
    await page.goto(PLANUNG_START);
    await expect(meldung(page)).toHaveAttribute("role", "status");
    await expect(meldung(page)).toHaveAttribute("aria-live", "polite");
    await expect(meldung(page)).toHaveText("");

    /*
     * Und der leere Bereich darf das Layout NICHT anfassen - sonst verschoebe
     * er jedes der zwoelf Bilder der Sichtpruefung.
     *
     * Gemessen statt begruendet: `position: absolute` heisst, dass das Element
     * kein Flex-Item der umgebenden Spalte ist. Damit zaehlt weder seine Hoehe
     * noch ein zusaetzliches `gap` - genau das, was `sr-only` leistet.
     */
    const geometrie = await meldung(page).evaluate((el) => ({
      position: getComputedStyle(el).position,
      hoehe: el.getBoundingClientRect().height,
    }));

    expect(geometrie.position).toBe("absolute");
    expect(geometrie.hoehe).toBeLessThanOrEqual(1);

    const dialog = await assistentBisSchritt3(page, { titel, start: START, ende: ENDE });

    await expect(dialog.getByTestId("uebersicht")).toContainText(`${ERWARTETE_TAGE} Arbeitstage`);
    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();

    // Der Drawer ist weg - und die Meldung steht trotzdem. Das ist die
    // Architekturregel des Tickets, hier am Produkt gemessen.
    await expect(page.getByRole("dialog")).toBeHidden();

    const bereich = meldung(page);

    await expect(bereich).toBeVisible();
    await expect(bereich).toHaveAttribute("role", "status");
    await expect(bereich).toHaveAttribute("aria-live", "polite");
    // Die beiden Pflichtangaben aus dem Jira-Vertrag.
    await expect(bereich).toContainText(titel);
    await expect(bereich).toContainText(`${ERWARTETE_TAGE} Baustellentage`);
    // Keine technischen Ids vor dem Nutzer.
    await expect(bereich).not.toHaveText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);

    /*
     * Und jetzt die Gegenprobe gegen die SERVERTRUTH: die genannte Zahl muss
     * die Zahl der wirklich persistierten Baustellentage sein. Ohne diesen
     * Abgleich waere die Zusicherung oben auch dann gruen, wenn die Zahl im
     * Client geraten worden waere.
     */
    const antwort = await request.get(`/api/planung/monat?monat=${MONAT}`);

    expect(antwort.status()).toBe(200);

    const ansicht = (await antwort.json()) as {
      cards: readonly { title: string; worksiteDayId: string }[];
    };
    const eigene = ansicht.cards.filter((karte) => karte.title === titel);

    expect(new Set(eigene.map((karte) => karte.worksiteDayId)).size).toBe(ERWARTETE_TAGE);
  });

  test("UX-020: ein abgelehnter Einsatz erzeugt KEINE Erfolgsmeldung", async ({ page }) => {
    const titel = "Erfolgsmeldung Vergangenheitsfall";

    /*
     * Ein echter, serverseitiger Fehlerweg - kein gestellter: der Zeitanker des
     * Laufs ist 2026-09-01 (EASYTREE_FIXED_TODAY), ein Start am 24.08.2026
     * liegt eindeutig davor und wird mit ENGAGEMENT_START_IN_PAST abgelehnt.
     */
    const dialog = await assistentBisSchritt3(page, {
      titel,
      start: "2026-08-24",
      ende: "2026-09-04",
    });

    await dialog.getByRole("button", { name: "Einsatz anlegen" }).click();

    // Der bestehende Fehlerweg bleibt sichtbar ...
    await expect(dialog.getByRole("alert")).toContainText("Vergangenheit");

    // ... und daneben wird kein Erfolg behauptet. Der Bereich existiert, ist
    // aber leer - das ist der Unterschied zu "nicht vorhanden".
    await expect(meldung(page)).toHaveText("");
    await expect(page.getByTestId("tageskarte").filter({ hasText: titel })).toHaveCount(0);
  });
});
