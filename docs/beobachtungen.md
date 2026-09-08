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
