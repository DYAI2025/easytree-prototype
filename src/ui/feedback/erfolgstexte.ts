/**
 * Saetze, mit denen erfolgreiche Schreibaktionen bestaetigt werden (EYT-175).
 *
 * Bewusst PURE Funktionen in einem eigenen, abhaengigkeitsfreien Modul und
 * nicht vier Textliterale in vier Komponenten: die Zusicherungen des Tickets -
 * Name genannt, Anzahl genannt, keine technische Id, kein Revisionsjargon -
 * sind hier einzeln pruefbar, statt nur ueber gerenderte Oberflaeche.
 *
 * Die Werte, die hier hineingehen, stammen ausnahmslos aus der Serverantwort
 * bzw. dem Lesemodell. Dieses Modul RECHNET NICHTS AUS - es formuliert nur.
 * Eine im Client geschaetzte Zahl waere eine Behauptung, keine Bestaetigung.
 */

/** "2026-09-10" -> "10.09.2026". */
function datum(wert: string): string {
  const [jahr, monat, tag] = wert.split("-") as [string, string, string];

  return `${tag}.${monat}.${jahr}`;
}

/**
 * Zahl und Einheit zusammen, damit "1 Baustellentage" gar nicht erst entstehen
 * kann.
 *
 * Das ist AUSDRUECKLICH keine Behebung von EYT-182: die drei bereits im Code
 * liegenden Pluralhelfer (`day-card`, `day-compact`, `step-team`) bleiben
 * unberuehrt. Hier steht nur, was diese neuen Saetze selbst brauchen - eine
 * neue Meldung mit falschem Plural waere ein neuer Fehler, kein bestehender.
 */
function tage(anzahl: number): string {
  return `${anzahl} ${anzahl === 1 ? "Baustellentag" : "Baustellentage"}`;
}

/**
 * UX-020 verlangt beides ausdruecklich: den Einsatz identifizierbar und die
 * Anzahl der erzeugten Baustellentage.
 *
 * `anzahlTage` ist die Laenge von `worksiteDayIds` aus der 201-Antwort - also
 * die Zahl der Tage, die der Server wirklich angelegt hat, nicht die im
 * Assistenten abgeleitete Vorschau.
 */
export function einsatzAngelegt(titel: string, anzahlTage: number): string {
  return `Einsatz „${titel}“ angelegt – ${tage(anzahlTage)} erzeugt.`;
}

/**
 * UX-031. Fachlicher Kontext ist das Datum des Tages; das Datum stammt aus dem
 * Lesemodell, nicht aus der URL.
 *
 * Ueber Revisionen wird bewusst geschwiegen: sie sind das Speicherverfahren
 * (append-only), nicht die Sache, die der Nutzer getan hat.
 */
export function baustellentagGespeichert(localDate: string): string {
  return `Baustellentag ${datum(localDate)} gespeichert.`;
}

/**
 * UX-032/033. `anzahlTage` ist die Laenge von `updatedDayIds` aus der Antwort
 * der Uebernahme - nicht die Zahl der Zieltage aus der Vorschau. Die beiden
 * koennen auseinanderfallen (ausgeschlossene und gesperrte Tage), und nur die
 * erste beschreibt, was tatsaechlich geschrieben wurde.
 */
export function serieUebernommen(anzahlTage: number): string {
  return `Serienänderung übernommen – ${tage(anzahlTage)} geändert.`;
}

/**
 * UX-051. Der Name kommt aus der angelegten Baustelle, wie der Server sie
 * zurueckgibt - nicht aus dem Formularfeld.
 */
export function baustelleAngelegt(name: string): string {
  return `Baustelle „${name}“ angelegt.`;
}
