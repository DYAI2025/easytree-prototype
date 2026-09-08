# Offene Beobachtungen

Dinge, die einmal aufgetreten sind und nicht geschlossen werden duerfen, nur
weil der naechste Lauf gruen war.

## B-01: `deadlock detected` im Integrations-Fixture (08.09.2026)

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

**Status:** OFFEN, NICHT REPRODUZIERT. Zwei unmittelbar folgende Laeufe von
`pnpm run test:integration` waren gruen (161/161), `pnpm test` ebenfalls
(196/196).

**Was dagegen spricht, es abzuhaken:**
`vitest.config.ts` setzt fuer das Integrationsprojekt `fileParallelism: false`.
Eine einzelne Verbindung kann sich nicht selbst verklemmen - es muss also einen
zweiten Sperrhalter gegeben haben, und der ist bisher unidentifiziert. Solange
das so ist, ist "war nur ein Flake" eine Vermutung, kein Befund.

**Was es NICHT ist:** kein Beleg gegen die Sperrreihenfolge des Produktcodes.
Die verklemmte Anweisung ist ein `truncate ... cascade` der Testvorbereitung,
nicht `pg_advisory_xact_lock`. Der Status des Sperr-Risikos bleibt davon
unberuehrt: `IMPLEMENTED_BUT_CONCURRENCY_NOT_VERIFIED`.

**Naechster Schritt, wenn es wieder auftritt:** waehrend des Laufs
`pg_stat_activity` und `pg_locks` mitschneiden, um den zweiten Sperrhalter zu
benennen.

## B-02: Ab der vierten Karte an einem Tag ist die vierte nicht erreichbar (08.09.2026)

**Was:** `DayCardStack` zeigt hoechstens `MAX_VISIBLE_CARDS_PER_DAY = 3` Karten
und fasst den Rest als Knopf "+n weitere" zusammen. Dieser Knopf hat aktuell
keinen Handler (`onMore={() => {}}` in `planungs-ansicht.tsx`). Die vierte und
jede weitere Karte eines Tages steht damit nicht im DOM und ist ueber die
Oberflaeche nicht erreichbar.

**Wie gefunden:** Der E2E-Lauf zu TASK-037 fand die frisch angelegte Karte am
21.09.2026 nicht - dort lagen bereits drei. Die Zusicherung wurde deshalb in
einen leeren Monat verlegt; das umgeht den Befund, es behebt ihn nicht.

**Status:** OFFEN. Eigene Task, bewusst NICHT in TASK-037 miterledigt: einen
Ueberlauf-Dialog zu bauen ist neue Implementierung, keine Verdrahtungsluecke.

## B-03: AC-05 ist nur zur Haelfte belegt (08.09.2026)

**Was:** Der Plan verlangt fuer AC-05, dass zugeordnete Personen und
Ressourcen nach `page.reload()` "im Tagesdrawer weiterhin gewaehlt" sind.
Einen Tagesdrawer gibt es noch nicht (`onOpen` der Tageskarte ist ein
No-Op).

**Was belegt IST:** Die Persistenz selbst. Nach dem Reload steht "2 Personen /
2 Ressourcen" auf der Karte, und diese Zahlen kommen aus der Datenbank
(`monthPlanningView`). Der Test dafuer ist gruen.

**Was NICHT belegt ist:** die Wiederanzeige derselben Auswahl in einem
Detaildialog. Der Fall steht als `test.fixme` sichtbar offen in
`e2e/einsatz-anlegen.spec.ts` statt still zu fehlen.

**Status:** OFFEN. Eigene Task.
