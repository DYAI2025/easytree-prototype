# Planabweichungen

Abweichungen vom kanonischen Plan
`docs/plans/2026-09-07-easytree-admin-planning-prototype.md`. Jede Zeile nennt,
was der Plan sagt, was stattdessen geschah und warum.

## PA-01: TASK-037 brauchte zwei Reparaturen mehr als vorgesehen

Der Plan erlaubt in TASK-037 Schritt 3 ausschliesslich Verdrahtungsluecken, die
der rote Browserlauf konkret benennt, und nennt dafuer drei erwartete:
`router.refresh()`, `data-engagement-id`, Fehlerbanner fuer 422.

Der rote Lauf hat zwei WEITERE Luecken belegt, die genauso Verdrahtung sind:

1. **Baustellenname musste in `StepWorksiteAuswahl` mitgefuehrt werden.**
   Eine inline angelegte Baustelle lebt nur im lokalen Zustand von
   `StepWorksite`. Der Drawer suchte ihren Namen in den beim Oeffnen geladenen
   Stammdaten, fand ihn nicht, und Schritt 3 rendete nie.
2. **Abgeleitete `localDates` mussten aus Schritt 2 an die Zusammenfassung
   weitergereicht werden.** Schritt 2 zeigte "10 Arbeitstage", die
   Zusammenfassung "0 Arbeitstage" - `StepPeriod` rechnete die Tage aus,
   reichte sie aber nicht weiter.

`data-engagement-id` war bereits gesetzt und musste nicht nachgezogen werden.

Beides ist reine Weitergabe bereits vorhandener Daten, keine neue Fachlichkeit.
Aus diesem Befund wurde nichts weiter abgeleitet.

Ausserdem in TASK-037: `engagement-drawer.tsx` steht im Plan in der Dateiliste
von TASK-034, wurde dort aber nicht gebaut und ist in TASK-037 entstanden.

## PA-02: AC-13 nutzt ein anderes Datum als der Plan

Der Plan nennt fuer AC-13 den Start `2026-09-01` als "Vergangenheit relativ zum
Testdatum". Der Zeitanker des Laufs ist `EASYTREE_FIXED_TODAY=2026-09-01` -
damit ist der 01.09. HEUTE und gerade nicht Vergangenheit. Der Test nutzt
`2026-08-24`. Die Produktlogik bleibt unveraendert; die Regel wurde nicht
gelockert, sondern mit einem eindeutigen Datum geprueft.

## PA-03: AC-05 ist in AC-05a und AC-05b geschnitten

Siehe `docs/beobachtungen.md`, B-03. TASK-037 verlangt einen Tagesdrawer, den
derselbe Plan erst in TASK-043 baut. Das ist ein Widerspruch in der
Aufgabenreihenfolge. AC-05a (Persistenz) ist jetzt gruen belegt, AC-05b
(Wiederanzeige im Tagesdrawer) ist auf TASK-043/045 rebaselined.

## PA-04: „leerer Tagessatz sendet `null`" ist am Vertrag gemessen nicht sendbar

TASK-038 Schritt 1 verlangt: „leerer Tagessatz sendet `null` (nicht `0`)".

Gemessen gegen den echten Vertrag (`UpsertEmployeeCommand.safeParse`):

```
null          => FAIL Invalid input
absent        => OK   {"displayName":"Erik"}
empty string  => FAIL Invalid input
string 25000  => OK   {"displayName":"Erik","dailyCostMinorUnits":"25000n"}
```

`MinorUnitsSchema.optional()` laesst ausschliesslich `undefined` zu. Ein
literales `null` im Body wuerde der Server mit `VALIDATION_FAILED` ablehnen -
das Formular waere gegen die reale Route unbenutzbar.

Das serverseitig belegte Wire-Format fuer „kein Satz" ist deshalb das
**fehlende Feld**; die Datenbank speichert daraufhin NULL. Belegt in
`tests/integration/api-master-data.test.ts`: ein POST ohne
`dailyCostMinorUnits` fuehrt in der Liste zu `dailyCostMinorUnits === null`.

Die Regel selbst ist unveraendert und wird weiter geprueft: es wird **niemals
0** gesendet. Der Test assertiert beides - das Feld fehlt, und im Koerper steht
weder `0` noch `"0"`. Gegenmutation `koerper.dailyCostMinorUnits = satz ?? "0"`
macht ihn rot (gemessen), Ruecknahme per `diff` verifiziert.
