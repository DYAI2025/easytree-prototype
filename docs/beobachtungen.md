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

## B-03: AC-05 war nur zur Haelfte belegt — REBASELINED (08.09.2026)

**Status: AC-05a `PASS`, AC-05b `DEFERRED_DUE_TO_PLAN_DEPENDENCY_CONTRADICTION`**

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

**AC-05b (faellig mit TASK-043/045):** Tagesdrawer oeffnen und dieselben zwei
Mitarbeitenden und zwei Ressourcen dort ausgewaehlt sehen. Steht als
`test.fixme` in `e2e/einsatz-anlegen.spec.ts` mit genau diesem Verweis.
**Gilt nicht als bestanden.**

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
