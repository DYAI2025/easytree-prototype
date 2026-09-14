# HUMAN_INPUT_REQUIRED — offene Entscheidungen des Prototypen

Ursprünglich waren hier **sieben** Entscheidungen offen. **Sechs davon sind es
weiterhin**; H-07 (Einsatz-Verlängerung) ist am 13.09.2026 aufgelöst worden —
nicht durch eine stille Implementierungsentscheidung, sondern weil die
kanonische Produktentscheidung dazu bereits existierte (siehe dort). Der
Prototyp verhält sich an jeder noch offenen Stelle bewusst konservativ und
sichtbar, statt die Frage still zu schließen.

Quelle aller sieben ursprünglichen Punkte ist Abschnitt 2 (`HUMAN_INPUT_REQUIRED`) des
kanonischen Plans
[`docs/plans/2026-09-07-easytree-admin-planning-prototype.md`](../plans/2026-09-07-easytree-admin-planning-prototype.md);
die dort genannten `OQ-*`-Nummern stammen aus dem PRD, die `A-*`-Nummern sind
die Interim-Annahmen desselben Abschnitts.

## Wie die zwei Spalten zu lesen sind

| Begriff | Bedeutung |
| --- | --- |
| **PROTOTYPE DEFAULT** | Was dieser Prototyp heute tut. Reversibel, im Code als `PROTOTYPE_ONLY` markiert, **keine** Produktaussage. |
| **FINAL PRODUCT DECISION** | Was ein Mensch entscheiden muss, bevor das Verhalten in ein Produkt übernommen wird. Steht aus. |

Ein grüner Testlauf belegt, dass der PROTOTYPE DEFAULT eingehalten wird — nie,
dass er richtig ist.

---

## H-01 — Überschreibungsregel für individuell angepasste Folgetage

**Frage (OQ-001):** Was passiert bei einer Serienänderung mit Folgetagen, die
vorher einzeln angepasst wurden — übernehmen, überspringen, fragen?

- **PROTOTYPE DEFAULT (A-06):** Folgetage, deren aktuelle Revision
  `origin = 'day_edit'` trägt, werden in der Serienvorschau als „individuell
  angepasst" ausgewiesen und **standardmäßig ausgeschlossen**. Einbeziehen geht
  nur einzeln, per ausdrücklicher Checkbox je Tag. Das ist die
  minimal-invasive, nicht-stille Variante (Kombination der EYT-122-Optionen
  1+2), im Code als `PROTOTYPE_ONLY / OQ-001` markiert.
- **Warum weiter offen:** Die Regel entscheidet, wessen Arbeit gewinnt — die der
  Serie oder die der Einzelkorrektur. Das ist eine Produkt- und keine
  Implementierungsfrage; beide Richtungen sind vertretbar und beide sind für
  Nutzende folgenreich.
- **FINAL PRODUCT DECISION:** ausstehend. Stillschweigendes Überschreiben ist
  bis dahin ein Stop (Plan §16).
- **Quelle:** Plan §2 H-01, Annahme A-06; PRD OQ-001; Task TASK-012/019/044.

## H-02 — Dritte Scope-Option `gesamter Einsatz / gesamte Zeitspanne`

**Frage:** Soll es neben `nur dieser Tag` und `dieser und folgende Tage` eine
dritte Serienreichweite geben, die auch **frühere** Tage erfasst?

- **PROTOTYPE DEFAULT:** **Nicht gebaut.** Die Radiogroup der Serienvorschau
  hat genau zwei Optionen; ein Test sichert `options.length === 2` zu, damit die
  dritte Option nicht still einwandert.
- **Warum weiter offen:** Der Wunsch stammt aus einer Nutzeräußerung, ist aber
  von keiner Single Source of Truth freigegeben — FR-006 nennt ausdrücklich nur
  zwei Optionen. Frühere Tage zu ändern wäre außerdem eine rückwirkende
  Korrektur und hängt damit an OQ-002 (siehe H-06).
- **FINAL PRODUCT DECISION:** Freigabe **und** Semantik für die Vergangenheit
  nötig, bevor gebaut wird.
- **Quelle:** Plan §2 H-02, §16; PRD FR-006, OQ-002; Task TASK-044.

## H-03 — Kostenbasis: Tagessatz oder Stundensatz

**Frage (OQ-014 / FR-020):** Rechnet das Produkt Plankosten je Tag oder je
Stunde?

- **PROTOTYPE DEFAULT (A-03):** **Tagessatz** je Mitarbeiter/Ressource in EUR
  Minor Units, in der Oberfläche als `PROTOTYPE_ONLY Demo-Tagessatz` benannt.
  Fehlt eine Grundlage, steht dort `fehlt` — **nie** `0,00 €` —, und die Summe
  wird als unvollständig gekennzeichnet.
- **Warum weiter offen:** Das Produkt (`DYAI2025/EasyTree`) rechnet mit einem
  Stundensatz; PRD FR-020/OQ-014 lassen die Ableitung ausdrücklich offen. Die
  Wahl ändert Datenmodell, Eingabemasken und jede Summe.
- **FINAL PRODUCT DECISION:** ausstehend. Fehlende Grundlagen als `0` zu
  behandeln oder Vergütung in Kosten umzurechnen ist bis dahin ein Stop.
- **Quelle:** Plan §2 H-03, Annahme A-03, §5.9; PRD FR-020, OQ-014; Task
  TASK-011/046.

## H-04 — Geo-Provider, Lizenz, Datenqualität, Kartenvorschau

**Frage (OQ-013):** Welcher Geocoding-Anbieter wird produktiv genutzt, unter
welcher Lizenz, mit welcher Datenqualität — und gibt es eine Kartenvorschau?

- **PROTOTYPE DEFAULT (A-04):** Drei Adapter, alle **serverseitig**:
  `manual` (Default — ohne bewusste Konfiguration verlässt keine Adresse den
  Rechner), `nominatim` (öffentliche OSM-Instanz als reiner Entwicklungsadapter:
  Pflicht-User-Agent, höchstens eine Anfrage pro Sekunde, kein Autocomplete je
  Tastendruck) und `fixture` für Tests, der ein ausdrückliches
  `GEOCODER_ALLOW_FIXTURE=1` verlangt. Keine Kartenkacheln im Browser, nur
  Koordinatenanzeige und externer Link.
- **Warum weiter offen:** Anbieterwahl ist Lizenz-, Kosten- und
  Datenschutzentscheidung, nicht Technik.
- **FINAL PRODUCT DECISION:** ausstehend. Einen Anbieter einzubinden, der
  **Zugangsdaten** braucht, ist bis dahin ein Stop.
- **Quelle:** Plan §2 H-04, Annahme A-04, §5.8; PRD OQ-013; Task
  TASK-026/041/042.

## H-05 — Pflichtattribute für Fahrzeuge, Maschinen, Geräte

**Frage (OQ-006):** Welche Attribute braucht eine Ressource fachlich wirklich?

- **PROTOTYPE DEFAULT (A-08):** Typen `vehicle | machine | equipment` mit
  `name`, `identifier` (frei, z. B. Kennzeichen oder Inventarnummer), `active`
  und optionalem `daily_cost_minor_units`. Keine weiteren Typattribute.
- **Warum weiter offen:** Ohne den echten Bedarf aus dem Betrieb wäre jedes
  weitere Feld geraten — und ein geratenes Pflichtfeld blockiert später die
  Erfassung.
- **FINAL PRODUCT DECISION:** ausstehend. Attribute über A-08 hinaus sind bis
  dahin ein Stop.
- **Quelle:** Plan §2 H-05, Annahme A-08; PRD OQ-006; Task TASK-017/039.

## H-06 — Bearbeitung vergangener Tage / rückwirkende Korrektur

**Frage (OQ-002):** Dürfen Tage vor dem heutigen lokalen Datum noch geändert
werden?

- **PROTOTYPE DEFAULT (A-07):** **Nein, serverseitig gesperrt.** Ein Einsatz
  darf heute beginnen, nicht davor (`ENGAGEMENT_START_IN_PAST`); Mutationen an
  vergangenen Tagen werden mit `422 DAY_IN_PAST_LOCKED` abgelehnt. Vergangene
  Tage bleiben **sichtbar und auswählbar**, die Sperre wird im Text erklärt
  statt versteckt. Maßgeblich ist das heutige lokale Datum in `Europe/Berlin`
  (Serverzeit); die Regel wird ausschließlich serverseitig durchgesetzt.
- **Warum weiter offen:** Rückwirkende Korrektur ist eine Frage von Nachweis und
  Verantwortung (wer darf was wann ändern), nicht von Bedienbarkeit.
- **FINAL PRODUCT DECISION:** ausstehend. Vergangene Tage editierbar zu machen
  ist bis dahin ein Stop.
- **Quelle:** Plan §2 H-06, Annahme A-07; PRD OQ-002; Task TASK-008/018/019.

## H-07 — Verlängerung eines bestehenden Einsatzes — AUFGELÖST (13.09.2026)

**Status: `RESOLVED_BY_EXISTING_CANONICAL_DECISION`**

**Frage (D-007):** Soll der Zeitraum eines bereits angelegten Einsatzes
nachträglich verlängert werden können?

**Antwort: ja — und zwar schon vor diesem Prototyp.** Der ursprüngliche Eintrag
hat die Frage falsch eingeordnet. Er begründete den Stop mit *„Der
Master-Prompt fordert es nicht"* — das ist eine **Scope-Entscheidung dieses
Prototyp-Plans**, keine offene Produktfrage. Die Produktfrage selbst war zu
diesem Zeitpunkt bereits beantwortet:

- Confluence `49119274` **D-007** („Einsatz ist verlängerbar und anpassbar"),
  Status `CANONICAL_PRODUCT_DECISION / HUMAN_PO_CONFIRMED`;
- dieselbe Seite, **Invariante 12**: „Spätere Verlängerung fügt nur neue Tage
  demselben Einsatz hinzu und verändert bestehende Tage nicht";
- dieselbe Seite, **Drift-Gate-Frage 11** und die Gates
  `LATER_EXTENSION = SAME_ENGAGEMENT_ADDITIONAL_DAYS_ONLY` sowie
  `PREFILL = MATERIALIZED / NO_LIVE_INHERITANCE`;
- **EYT-120**, Akzeptanzkriterium „Derselbe Einsatz kann später verlängert
  werden; nur zusätzliche Tage werden erzeugt" — dort ausdrücklich **im**
  Scope, während die Tages-/Serienänderung an EYT-121/122 abgegeben ist.

Die Verlängerung ist damit implementiert (`update-engagement`,
`PATCH /api/einsaetze/[id]`), und zwar genau in der von D-007 vorgeschriebenen
Form:

- nur **vorwärts**: späteres `endDate` beim Einsatz mit fachlichem Ende,
  späterer `planningHorizonDate` beim offenen Einsatz;
- es entstehen **ausschließlich** die bislang nicht materialisierten Tage des
  Deltas; bestehende `worksite_day`-IDs und deren Revisionen bleiben
  zeilengleich;
- neue Tage bekommen Revision 1 / `origin = 'materialized'` und die
  **persistierte Ausgangskonfiguration** aus
  `engagements.initial_configuration` — ausdrücklich **nicht** den Zustand des
  letzten bestehenden Tages, den D-007 wörtlich als Ratequelle ausschließt;
- keine Live-Vererbung auf bestehende Tage.

**Was hier NICHT entschieden wurde und offen bleibt:**

- **Verkürzen** eines Einsatzes (`ENGAGEMENT_SHRINK_NOT_ALLOWED`, 422) und das
  **Verschieben des Starts** sind weiterhin nicht freigegeben. Beide stehen
  nicht im Vertrag `UpdateEngagementCommand` und sind damit nicht nur
  ungeprüft, sondern strukturell unmöglich.
- Der **Baustellenwechsel** eines bestehenden Einsatzes ebenso wenig.
- **H-01 wird dadurch nicht berührt.** Die alte Begründung befürchtete, die
  Verlängerung werfe „H-01 gleich mit" auf. Das tut sie nicht: neue Tage haben
  per Konstruktion keine frühere Einzelanpassung, die überschrieben werden
  könnte. Die Serienregel bleibt unverändert offen.
- Neue Tage in der **Vergangenheit** entstehen nicht (`DAY_IN_PAST_LOCKED`);
  H-06 bleibt davon unberührt.

- **Quelle:** Confluence `49119274` D-007, Invariante 12, Drift-Gate 11;
  Jira EYT-120; Plan §2 H-07, §5.3, §7 (`engagements.initial_configuration`).

---

## Was dieser Prototyp zusätzlich nicht entscheidet

Diese Punkte sind keine `HUMAN_INPUT_REQUIRED`-Einträge, grenzen die Aussagekraft
aber genauso ein — sie stehen hier, damit niemand sie aus dem Schweigen des
Repos als entschieden liest:

- **Ein Demo-Mandant, kein Login** (A-02). Jede Tabelle trägt `org_id`, aufgelöst
  über einen serverseitigen `DemoTenantContext` (fest `ORG_DEMO`). Kein Auth,
  keine RLS. Mandantentrennung ist strukturell vorbereitet, aber **nicht
  belegt**.
- **Zweite Codebasis neben `DYAI2025/EasyTree`** (Plan §17). Bewusst gewählt,
  Driftrisiko benannt, nicht beseitigt.
- **Kein Screenreader-Smoke** (M-03). Automatisierte axe-Prüfungen ersetzen den
  menschlichen VoiceOver-Durchgang nicht.
