# Offene Beobachtungen

Dinge, die einmal aufgetreten sind und nicht geschlossen werden duerfen, nur
weil der naechste Lauf gruen war.

## B-01: `deadlock detected` im Integrations-Fixture (08.09.2026)

**Status: `OBSERVED_NOT_REPRODUCED`**

**Was:** Ein voller Gate-Lauf brach mit drei roten Integrationstests ab. Der
Fehler kam nicht aus Produktcode, sondern aus dem Fixture:

```
PostgresError: deadlock detected
  tests/integration/queries.test.ts:34
  33| beforeEach(async () => {
  34|   await handle.sql`truncate table organizations restart identity cascade`
```

Im selben Lauf lief zusaetzlich ein Unit-Test in die Zeitgrenze
(`meldet 0 axe-Violations`, 8966 ms bei 5000 ms Limit).

**Nicht reproduziert.** Zwei unmittelbar folgende Laeufe von
`pnpm run test:integration` waren gruen (161/161), `pnpm test` ebenfalls, und
alle spaeteren Gate-Laeufe ebenso.

**Was dagegen spricht, es abzuhaken:** `vitest.config.ts` setzt fuer das
Integrationsprojekt `fileParallelism: false`. Eine einzelne Verbindung kann
sich nicht selbst verklemmen - es muss also einen zweiten Sperrhalter gegeben
haben, und der ist unidentifiziert. "War nur ein Flake" ist eine Vermutung,
kein Befund. **Keine spekulative Codeaenderung.**

**Strikt getrennt von der Sperrreihenfolge der Serienaenderung.** Die
verklemmte Anweisung ist ein `truncate ... cascade` der Testvorbereitung, nicht
`pg_advisory_xact_lock`. Der Status jenes Risikos bleibt unabhaengig davon
`IMPLEMENTED_BUT_CONCURRENCY_NOT_VERIFIED`. B-01 ist kein Beleg dafuer und kein
Beleg dagegen.

**Naechster Schritt, wenn es wieder auftritt:** waehrend des Laufs
`pg_stat_activity` und `pg_locks` mitschneiden, um den zweiten Sperrhalter zu
benennen.

## B-02: „+n weitere" war ein Control ohne Wirkung — GESCHLOSSEN (08.09.2026)

**Status: `CLOSED`**

**Was war:** `DayCardStack` zeigte hoechstens `MAX_VISIBLE_CARDS_PER_DAY = 3`
Karten und fasste den Rest als Knopf "+n weitere" zusammen. Dieser Knopf hatte
keinen Handler. Die vierte und jede weitere Karte eines Tages stand nicht im
DOM und war ueber die Oberflaeche nicht erreichbar - ein Control, das einen Weg
behauptet, den es nicht gibt.

**Reparatur:** Der Knopf ist jetzt ein echtes Disclosure-Control mit
`aria-expanded`, klappt per Maus und per Tastatur auf und wieder zu und
beschriftet sich im offenen Zustand als "Weniger anzeigen". Kein Dialog, kein
Popover, keine neue Architektur - das Aufklappen geschieht an Ort und Stelle.

**Zweiter Defekt, den erst der Browser gezeigt hat:** Der Tastaturhandler der
Gitterzelle rief `preventDefault()` fuer Enter/Space, egal welches Element in
der Zelle den Fokus hatte. Damit war JEDES interaktive Element in einer
Tageszelle per Tastatur tot - der Disclosure-Knopf ebenso wie jede Tageskarte -
und statt der Aktivierung lief die Einsatzanlage los. Der Handler reagiert
jetzt nur noch, wenn die Zelle selbst das Ziel des Ereignisses ist.

**Nachweis:** sechs Komponententests plus `e2e/tagesstapel.spec.ts` mit vier
Einsaetzen am selben Tag in echtem Chromium (Maus und Tastatur).

## B-03: AC-05 war nur zur Haelfte belegt — GESCHLOSSEN (08.09.2026)

**Status: AC-05a `PASS`, AC-05b `PASS` (mit TASK-043 eingeloest)**

**Der Widerspruch:** TASK-037 verlangt, dass die zugeordneten Mitarbeitenden
und Ressourcen nach `page.reload()` "im Tagesdrawer weiterhin gewaehlt" sind.
Den Tagesdrawer baut derselbe Plan aber erst in TASK-043. Die Anforderung ist
in TASK-037 also nicht erfuellbar. Das ist eine Inkonsistenz in der
Aufgabenreihenfolge - kein Fehler des Produktcodes, keine offene
Human-Entscheidung, und ausdruecklich kein Anlass, TASK-043 still vorzuziehen.

**AC-05a (jetzt, gruen):** Nach der Anlage mit zwei Mitarbeitenden und zwei
Ressourcen und einem `page.reload()` enthaelt die persistierte Servertruth
weiterhin GENAU diese zwei Mitarbeitenden und zwei Ressourcen - geprueft ueber
`GET /api/baustellentage/{id}` gegen die Ids, nicht gegen einen Zaehler. Die
Einsatz-Id und alle fuenf Baustellentag-Ids sind vor und nach dem Reload
identisch.

**AC-05b (eingeloest mit TASK-043, 08.09.2026):** Der Tagesdrawer existiert und
ist an der Tageskarte verdrahtet (PA-08). Der Test ist kein `test.fixme` mehr,
sondern laeuft: Einsatz mit zwei namentlich gewaehlten Personen und zwei
Ressourcen anlegen, `page.reload()`, Tageskarte anklicken, Tagesdrawer lesen.
Geprueft werden IDS ueber das `value`-Attribut der Checkboxen, nicht Anzahlen -
und zusaetzlich, dass jede NICHT zugeordnete Person und Ressource ausdruecklich
nicht angehakt ist. Gegenmutation "alle vorauswaehlen" macht ihn rot (gemessen:
"Expected - 0 / Received + 3"). Gruen in echtem Chromium gegen echtes
PostgreSQL.

## B-04: PATCH ersetzt vollstaendig - Stammdatenformulare loeschten den Kostenhinweis (08.09.2026)

**Status: `CLOSED`**

**Was war:** `upsertEmployee` und `upsertResource` setzen `costNote:
command.costNote ?? null`. Ein weggelassenes Feld wird also als NULL
geschrieben, nicht ignoriert - PATCH ist ein vollstaendiger Ersatz, keine
Teilaenderung. Die neuen Formulare aus TASK-038/039 haben fuer `costNote` kein
Eingabefeld und liessen es weg. Jedes Speichern einer bestehenden Person oder
Ressource loeschte damit still den Hinweis, den der Seed auf
`"PROTOTYPE_ONLY Demo-Fixture"` setzt.

**Gefunden** bei der Rekonstruktion der Serverschicht vor TASK-040, nicht durch
einen roten Test - die vier bzw. drei Faelle der Tasks pruefen nur den
Anlegepfad.

**Reparatur:** Beide Formulare reichen einen vorhandenen `costNote`
unveraendert weiter. Zwei neue Tests pruefen den PATCH-Koerper; die
Gegenmutation (Durchreichen entfernen) macht sie rot
("expected undefined to be 'PROTOTYPE_ONLY Demo-Fixture'").

**Was offen bleibt:** `employees.currency` und `resources.currency` sind
`text not null default 'EUR'` im Schema und kommen in KEINEM Vertrag vor. Sie
sind ueber keine Route schreibbar. Das ist heute folgenlos, weil der Prototyp
nur EUR kennt - es ist aber keine Entscheidung, sondern eine Luecke.

## B-05: Der Drawer-Zustand steht nicht in der URL (08.09.2026)

**Status: `CLOSED` (08.09.2026)** - vorher `OPEN_BY_PRECEDENT`. Der Befund bleibt
unveraendert stehen; die Aufloesung steht darunter.

`CLAUDE.md` nennt als Zustandsvertrag
`/planung?monat=…&tag=…&drawer=neu|tag|kosten&id=…`. Tatsaechlich steht nur
`monat` in der URL; welcher Drawer offen ist, haelt `PlanungsAnsicht` in
`useState` - so seit TASK-034 fuer den Einsatz-Drawer, so bewertet im Product
Gate, und so jetzt auch fuer den Tagesdrawer.

**Warum nicht still nachgezogen:** die Umstellung beruehrt den Einsatz-Drawer,
den Kalender und jede Spec, die einen Drawer oeffnet. Kein Akzeptanzkriterium
von TASK-043 bis TASK-047 verlangt einen teilbaren Drawer-Link; sie verlangen
Servertruth, und die ist unabhaengig davon erfuellt (AC-05b, AC-11, AC-12).

**Was NICHT passiert ist:** kein `localStorage`, kein `sessionStorage`. Der
Formularzustand lebt in der Drawer-Instanz, der Fachzustand im Server.

**Naechster Schritt:** entweder den Vertrag in `CLAUDE.md` auf den gebauten
Stand ziehen oder die URL-Zustaende als eigene Aufgabe nachziehen. Beides ist
eine Produktentscheidung, keine stille Reparatur.

### Aufloesung (08.09.2026)

Der oben notierte "naechste Schritt" hatte zwei Wege offen gelassen. Nur einer
war je zulaessig: `CLAUDE.md` ("View state lives in the URL") und Plan 5.6
("URL ist Zustand … Reload rekonstruiert Ansicht und geoeffneten Drawer aus der
URL") sagen dasselbe. Zwei uebereinstimmende kanonische Quellen sind keine
offene Produktentscheidung - der Vertrag stand, die Implementierung fehlte.
Herunterschreiben des Vertrags war damit ausgeschlossen.

**Ursache:** `PlanungsAnsicht` hielt den offenen Drawer und den adressierten
Tag/Einsatz in `useState`. Die URL trug nur `monat`. Ein Reload verlor den
Drawer, und ein Link auf einen Baustellentag existierte nicht.

**Reparatur:** Der Ansichtszustand wandert in die URL und wird SERVERSEITIG
aufgeloest.

- Neu: `src/ui/calendar/planning-view-state.ts` - pur, ohne Router, Fetch oder
  React. `planungsUrl()` baut die eine kanonische URL
  (`/planung?monat=…&tag=…&drawer=…&id=…`, feste Parameterreihenfolge),
  `resolvePlanungsViewState()` loest sie gegen das bereits geladene
  `MonthPlanningView` auf.
- `src/app/planung/page.tsx` ruft die Aufloesung im Serverrender auf. Deshalb
  steht ein Drawer schon beim Direktaufruf, ohne einen Klick im Client.
- `src/ui/calendar/planungs-ansicht.tsx` SCHREIBT den Zustand nur noch:
  Oeffnen und Schliessen sind `router.push(planungsUrl(...), {scroll:false})`.
  Im React-State bleibt allein der ungespeicherte Serien-Entwurf hinter der
  Vorschau - der laesst sich aus keiner URL rekonstruieren.
- `id` gilt nur, wenn das Lesemodell den Baustellentag bzw. den Einsatz im
  sichtbaren Raster kennt. Damit zeigt ein rekonstruierter Drawer garantiert
  dieselbe Identitaet; der Titel des Kosten-Drawers kommt aus derselben Quelle
  statt aus der URL.
- Unbrauchbarer Zustand ist KEIN fachlicher Fehler: unbekannter `drawer`,
  fehlende oder unbekannte `id`, Tag ausserhalb des Rasters werden ignoriert,
  der Kalender steht. Eine erfundene Fehlermeldung waere schlimmer als der
  stille Rueckfall.
- Ein Monatswechsel laesst den Drawer-Zustand fallen; Schliessen entfernt nur
  die Drawer-Parameter und behaelt `monat`.
- Weiterhin kein `localStorage`/`sessionStorage`.

Nicht angefasst: Datenmodell, API-Vertraege, Kostenrechnung, Tages- und
Serienrevisionen, der getrennte Serienzaehler aus B-04, OQ-001, H-01…H-07.

**Browser-Evidenz** (Playwright/Chromium gegen den Produktionsbuild und echtes
PostgreSQL, `e2e/planungs-url-state.spec.ts`):

| Fall | Nachweis |
| --- | --- |
| B05-1 | Tageskarte oeffnen schreibt `monat`+`tag`+`drawer=tag`+`id`; nach `reload()` steht derselbe Drawer, `tageskopf` traegt dieselbe `data-worksite-day-id`. |
| B05-2 | `Kosten anzeigen` schreibt `drawer=kosten`+Einsatz-`id`; nach `reload()` derselbe Einsatz, `kostenkopf` traegt dieselbe `data-engagement-id`. |
| B05-3 | `Einsatz anlegen` schreibt `drawer=neu`; nach `reload()` steht der Drawer wieder auf Schritt 1 von 3. |
| B05-4 | Schliessen (Tages- und Einsatzdrawer) entfernt `drawer`/`id`, laesst `monat=2026-09` stehen; nach `reload()` bleibt zu. |
| B05-5 | `page.goto()` auf einen nie in dieser Page geoeffneten Tages- bzw. Kosten-Link rekonstruiert beide Drawer mit der richtigen ID. |
| B05-N | Sechs unbrauchbare Zustaende (unbekannter Drawer, `drawer=tag` ohne id, unbekannte ids, `drawer=kosten` ohne id) zeigen den Kalender, keinen Dialog, keine Fehlermeldung; `drawer=neu` mit unbrauchbarem `tag` oeffnet trotzdem sauber. |

Roter Ausgangslauf auf `cb40be1`: B05-1/2/3 scheiterten an `drawer` = `null`,
B05-5 fand nach `goto()` gar keinen Drawer.

**Gegenmutation:** `page.tsx` gibt statt `resolvePlanungsViewState(view, params)`
ein festes `KEIN_DRAWER` weiter - die URL wird weiter geschrieben, nur die
Rekonstruktion faellt weg. Der Build kompiliert (`✓ Compiled successfully`), und
genau die Reload- und Direktlink-Faelle werden echt rot: 6 von 7 Tests
scheitern, uebrig bleibt nur der Negativpfad, der ohnehin keinen Drawer
erwartet. Mutation vollstaendig zurueckgenommen (`diff` gegen die Kopie vor der
Mutation ist leer).
