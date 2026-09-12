import { describe, expect, it } from "vitest";

import {
  baustelleAngelegt,
  baustellentagGespeichert,
  einsatzAngelegt,
  serieUebernommen,
} from "./erfolgstexte";

/*
 * EYT-175 / UX-020, UX-031, UX-032/033, UX-051.
 *
 * Die Texte der Erfolgsmeldungen liegen als PURE Funktionen hier und nicht in
 * den vier Komponenten: nur so ist jede einzelne Aussage - Name genannt, Anzahl
 * genannt, keine technische Id, kein Revisionsjargon - an der Stelle geprueft,
 * an der sie entsteht, statt vier Mal ueber gerenderte Oberflaeche.
 *
 * Die Zahlen selbst prueft dieses File NICHT auf Herkunft; dass sie aus der
 * Serverantwort stammen und nicht aus einer Client-Schaetzung, sichern die
 * Komponententests und der E2E-Lauf.
 */

/** Eine UUID im Erfolgstext waere ein technischer Bezeichner vor dem Nutzer. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("einsatzAngelegt", () => {
  it("nennt den Einsatz beim fachlichen Namen und die Anzahl der Baustellentage", () => {
    const text = einsatzAngelegt("Baumpflege Herbstschnitt", 4);

    // Die beiden Pflichtangaben aus dem Jira-Vertrag, einzeln gemessen.
    expect(text).toContain("Baumpflege Herbstschnitt");
    expect(text).toContain("4 Baustellentage");
    // Und die Aussage selbst - sonst waere "Baumpflege Herbstschnitt 4
    // Baustellentage" schon gruen, ohne dass etwas angelegt worden waere.
    expect(text).toContain("angelegt");
  });

  it("formuliert den einzelnen Tag im Singular", () => {
    const text = einsatzAngelegt("Sturmschaden Sofortmassnahme", 1);

    expect(text).toContain("1 Baustellentag");
    // Die Probe auf die Probe: "1 Baustellentage" enthaelt "1 Baustellentag"
    // und waere ohne diese Zeile mitgruen.
    expect(text).not.toContain("Baustellentage");
  });

  it("nennt auch den Sonderfall null Tage ehrlich statt ihn zu verschweigen", () => {
    expect(einsatzAngelegt("Leerer Einsatz", 0)).toContain("0 Baustellentage");
  });

  it("nennt keine technische Id", () => {
    expect(einsatzAngelegt("Baumpflege Herbstschnitt", 4)).not.toMatch(UUID);
  });
});

describe("baustellentagGespeichert", () => {
  it("nennt den Tag mit seinem Datum und sagt, dass gespeichert wurde", () => {
    const text = baustellentagGespeichert("2026-09-10");

    expect(text).toContain("10.09.2026");
    expect(text).toContain("gespeichert");
  });

  it("spricht nicht in Revisionstechnik", () => {
    const text = baustellentagGespeichert("2026-09-10").toLowerCase();

    // Plan-Vorgabe des Tickets: Revisionen sind ein Speicherverfahren, keine
    // Erfolgssprache.
    expect(text).not.toContain("revision");
    expect(text).not.toContain("konfiguration");
  });
});

describe("serieUebernommen", () => {
  it("nennt die Anzahl der tatsaechlich geaenderten Tage", () => {
    const text = serieUebernommen(3);

    expect(text).toContain("3 Baustellentage");
    expect(text).toContain("geändert");
  });

  it("formuliert den einzelnen Tag im Singular", () => {
    const text = serieUebernommen(1);

    expect(text).toContain("1 Baustellentag");
    expect(text).not.toContain("Baustellentage");
  });

  /*
   * Der Satz war zuerst "Serienaenderung uebernommen - N Baustellentage
   * geaendert." und hat damit die Fehlerklasse aus EYT-180 NEU eingefuehrt -
   * in einem Text, den es vor EYT-175 gar nicht gab.
   *
   * Beide Richtungen sind Pflicht: die Positivpruefung allein bliebe gruen,
   * wenn beide Schreibweisen im Satz stuenden, die Negativpruefung allein
   * bliebe gruen, wenn das Wort ganz verschwaende.
   */
  it("schreibt die Umlaute aus, statt sie zu transliterieren", () => {
    const text = serieUebernommen(2);

    expect(text).toContain("Serienänderung");
    expect(text).toContain("übernommen");
    expect(text).toContain("geändert");

    expect(text).not.toContain("Serienaenderung");
    expect(text).not.toContain("uebernommen");
    expect(text).not.toContain("geaendert");
  });
});

describe("baustelleAngelegt", () => {
  it("nennt die Baustelle beim Namen", () => {
    const text = baustelleAngelegt("Parkanlage Nordring");

    expect(text).toContain("Parkanlage Nordring");
    expect(text).toContain("angelegt");
  });

  it("nennt keine technische Id", () => {
    expect(baustelleAngelegt("Parkanlage Nordring")).not.toMatch(UUID);
  });
});

/*
 * Dieselbe Fehlerklasse fuer ALLE vier von EYT-175 neu eingefuehrten
 * Erfolgsmeldungen - und ausdruecklich nur fuer diese vier.
 *
 * Das ist KEIN Repository-weiter ASCII-Waechter: ein solcher gehoert zu
 * EYT-180 und wuerde die bestehenden Alttexte aus TASK-048/049 mitreissen, die
 * dieses Ticket nicht anfasst.
 *
 * Die eingesetzten Werte sind BEWUSST umlautfrei und ohne "ae"/"oe"/"ue".
 * Sonst prueft die Zusicherung nicht mehr die eigene Schreibweise der
 * Meldungen, sondern die Schreibweise fremder Stammdaten - der Seed traegt
 * etwa "Innenhof Gruenblick", und dessen Transliteration ist EYT-180, nicht
 * EYT-175.
 */
describe("EYT-175: die neuen Erfolgsmeldungen transliterieren keine Umlaute", () => {
  const meldungen = (): readonly { name: string; text: string }[] => [
    { name: "einsatzAngelegt", text: einsatzAngelegt("Testeinsatz", 4) },
    { name: "einsatzAngelegt (Singular)", text: einsatzAngelegt("Testeinsatz", 1) },
    { name: "baustellentagGespeichert", text: baustellentagGespeichert("2026-09-10") },
    { name: "serieUebernommen", text: serieUebernommen(2) },
    { name: "serieUebernommen (Singular)", text: serieUebernommen(1) },
    { name: "baustelleAngelegt", text: baustelleAngelegt("Testbaustelle") },
  ];

  it.each(meldungen())("$name enthaelt keine transliterierten Umlaute", ({ text }) => {
    /*
     * "eu" ist ein echter deutscher Diphthong ("erzeugt") und keine
     * Transliteration - die Klassen sind ae|oe|ue, in dieser Richtung.
     */
    expect(text).not.toMatch(/ae|oe|ue/);
  });

  it("verwendet im Satz den Gedankenstrich, nicht den Bindestrich", () => {
    expect(serieUebernommen(2)).toContain(" – ");
    expect(einsatzAngelegt("Testeinsatz", 4)).toContain(" – ");
  });
});
