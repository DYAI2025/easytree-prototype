# EasyTree Prototype — Abnahme-Evidenz 2026-09-12

Diese Datei ist Evidenz, keine Werbung. Jede Zahl darin wurde in TASK-051
gemessen oder trägt ausdrücklich ihre Herkunft als früher abgenommener Nachweis.

Drei Evidenzklassen werden durchgehend unterschieden:

| Klasse | Bedeutung |
| --- | --- |
| `MEASURED_IN_TASK_051` | In diesem Durchlauf am 12.09.2026 ausgeführt; Ausgabe unten wörtlich. |
| `ACCEPTED_PRIOR_EVIDENCE` | Früher erbracht und abgenommen; Herkunft (Lauf, Commit, Mensch) ist genannt. In TASK-051 **nicht** wiederholt. |
| `NOT_REEXECUTED` | Bewusst nicht erneut ausgeführt; warum, steht dabei. |

---

## 1. Source binding

| Feld | Wert |
| --- | --- |
| Repository | `DYAI2025/easytree-prototype` |
| Branch | `feat/admin-planning-prototype` |
| Start-HEAD (lokal und remote identisch) | `a27548c6335727bd0f1cbae1608a7298f3bd8f28` |
| Pull Request | [#2](https://github.com/DYAI2025/easytree-prototype/pull/2) — OPEN, nicht gemerged, kein Entwurf |
| Base-Branch | `master` @ `2ff2a43df82b4c75e57c976e7ee348ed91335338` |
| Merge-Base | `b9d9c316d3458fcdcd308ee63c17132910a07dba` |
| Commits auf dem Branch gegenüber `origin/master` | 80 |
| Task-IDs in den Commit-Betreffen | TASK-001 … TASK-050 (50 verschiedene); TASK-051 ist dieser Durchlauf |
| Datum / Zeitzone der Messung | 2026-09-12, `Europe/Berlin` (CEST, `+0200`), Beginn 04:00 Ortszeit |
| Prototyp-Status | `PROTOTYPE_ONLY` — kein Auth, ein Demo-Mandant `ORG_DEMO`, keine RLS, kein Deployment |

Ausgangszustand der Arbeitskopie vor dem ersten TASK-051-Commit, gemessen:

```
git status --short      (leer)
git diff --check        rc=0
git rev-parse HEAD                                  a27548c6335727bd0f1cbae1608a7298f3bd8f28
git rev-parse origin/feat/admin-planning-prototype  a27548c6335727bd0f1cbae1608a7298f3bd8f28
```

Kein verfolgter, nicht ignorierter Quell-Drift. `MEASURED_IN_TASK_051`.

### Messumgebung (lokal)

| Feld | Wert |
| --- | --- |
| Betriebssystem | macOS 26.6 |
| Architektur | `arm64` (Apple Silicon) |
| Node | `v22.23.1` |
| pnpm | `10.28.0` |
| Playwright | `Version 1.63.0` |
| PostgreSQL | `postgres:17-alpine`, Container `easytree-prototype-db`, `127.0.0.1:55432`, Status `Up (healthy)` |
| `GEOCODER_PROVIDER` | `manual` (E2E-Webserver überschreibt auf `fixture` mit `GEOCODER_ALLOW_FIXTURE=1`) |

**Diese Maschine ist arm64 und damit ausdrücklich nicht die kanonische visuelle
Prüfumgebung.** Siehe Abschnitt 4 und 5.

### Zwölf ignorierte `*-darwin.png` in der Arbeitskopie

In `e2e/visual.spec.ts-snapshots/` liegen neben den zwölf verfolgten
Linux-Baselines zwölf **ignorierte** `*-darwin.png` aus einem früheren lokalen
Lauf (mtime 10.09.2026, 22:07–22:08).

```
git check-ignore -v e2e/visual.spec.ts-snapshots/01-planung-september-1440-chromium-darwin.png
.gitignore:26:e2e/**/*-darwin.png	e2e/visual.spec.ts-snapshots/01-planung-september-1440-chromium-darwin.png
```

Sie sind **keine** Repository-Änderung, **keine** abgenommene Baseline und
**keine** visuelle Abnahmeevidenz. Sie wurden in TASK-051 weder gelöscht noch
verändert, gestaged, kopiert noch als visuelle Wahrheit verwendet — siehe den
Vorher/Nachher-Nachweis in Abschnitt 3.

---

## 2. Database reset / seed

Befehl, exakt wie ausgeführt:

```bash
pnpm db:reset && pnpm db:seed
```

| Teilbefehl | Exit |
| --- | --- |
| `pnpm db:reset` | **0** |
| `pnpm db:seed` | **0** |

Reale Abschlusszeilen der Ausgabe:

```
Datenbank zurueckgesetzt und migriert.
Demo-Daten eingespielt (PROTOTYPE_ONLY).
```

Der Lauf schreibt zusätzlich PostgreSQL-`NOTICE`-Objekte nach stderr
(`drop cascades to 12 other objects`, `drop cascades to table
drizzle.__drizzle_migrations`, zweimal `identifier "…" will be truncated to
"…"`, Code `42622`). Das sind **Hinweise, kein Fehlschlag**: Beide Teilbefehle
enden mit Exit 0, und der resultierende Zustand trägt die Demo-Daten aus Plan
Abschnitt 12 — belegt durch `tests/integration/seed.test.ts` (7 Fälle, grün in
Abschnitt 3, Zeile 5). Die Kürzungshinweise betreffen zwei
Fremdschlüsselnamen über 63 Zeichen und sind ein normales Ergebnis der
Migration `drizzle/0000_initial.sql`.

Evidenzklasse: `MEASURED_IN_TASK_051`.

---

## 3. Final local validation

Die sechs Befehle liefen **sequenziell und einzeln**, jeder mit eigener
Exit-Status-Erfassung — nicht als eine `&&`-Kette.

| # | Command | Exit | Actual summary | Evidence class |
| --- | --- | --- | --- | --- |
| 1 | `pnpm format` | **0** | `Checking formatting...` / `All matched files use Prettier code style!` | `MEASURED_IN_TASK_051` |
| 2 | `pnpm lint` | **0** | keine Ausgabe (`eslint . --max-warnings 0` schweigt im Erfolgsfall) | `MEASURED_IN_TASK_051` |
| 3 | `pnpm typecheck` | **0** | keine Ausgabe (`tsc --noEmit` schweigt im Erfolgsfall) | `MEASURED_IN_TASK_051` |
| 4 | `pnpm test` | **0** | `Test Files  36 passed (36)` / `Tests  344 passed (344)` / `Duration  16.18s` | `MEASURED_IN_TASK_051` |
| 5 | `pnpm test:integration` | **0** | `Test Files  19 passed (19)` / `Tests  163 passed (163)` / `Duration  20.87s` | `MEASURED_IN_TASK_051` |
| 6 | `pnpm test:e2e` | **0** | `Running 148 tests using 1 worker` / `148 passed (1.5m)` | `MEASURED_IN_TASK_051` (funktional; **visuell siehe unten**) |

Sechsmal Exit 0. Null Fehlschläge, null Flakes, null übersprungene Tests.

Bekannte, unveränderte Nebenausgabe in Zeile 4: die Vite-Warnung
`Your Vite config uses features that are unsupported by configLoader: 'native'`
(`vitest.config.ts` als CommonJS geladen). Sie ist offen und wird hier
**nicht** als erledigt berichtet; sie beeinflusst den Exit-Status nicht.

### Was der lokale E2E-Lauf über die Bilder aussagt: nichts

Alle zwölf `visual`-Fälle liefen und waren grün:

```
✓  137 … visual › 01 Planung September bei 1440 (409ms)
✓  138 … visual › 02 Planung September bei 768 (317ms)
✓  139 … visual › 03 Planung September bei 375 (303ms)
✓  140 … visual › 04 Planung August mit sechs Kalenderzeilen (417ms)
✓  141 … visual › 06 Einsatzdrawer Schritt 2 mit Kalenderkontext bei 1440 (479ms)
✓  142 … visual › 07 Tagesbearbeitung bei 1440 (575ms)
✓  143 … visual › 09 Kostenansicht im Zustand unvollstaendig (567ms)
✓  144 … visual › 10 Geocoding-Fehlerzustand (614ms)
✓  145 … visual › 11 Sichtbarer Fokus auf einer Tageskarte nach Tab (411ms)
✓  146 … visual › 12 Reflow bei 320 Pixeln (248ms)
✓  147 … visual › 08 Serienvorschau mit individuell angepasstem Folgetag (2.4s)
✓  148 … visual › 05 Zehnter September mit zwei parallelen Einsaetzen und langem Baustellennamen (1.9s)
```

**Dieses Grün ist keine visuelle Abnahme.** Playwright hängt die Plattform an
den Dateinamen: Auf macOS wird `…-chromium-darwin.png` gesucht, versioniert
sind ausschließlich die zwölf `…-chromium-linux.png`. Der Lauf verglich also
gegen die zwölf ignorierten Darwin-Bilder aus einem früheren lokalen Lauf —
ein Vergleich des eigenen Renderers mit sich selbst. Über die abgenommene
Linux/AMD64-Baseline sagt er nichts.

Was der lokale Lauf sehr wohl beiträgt: die **fachlichen DOM-Zusicherungen**,
die in `e2e/visual.spec.ts` vor jedem Screenshot stehen (Rasterzeilenzahl,
`data-vergangen` auf allen 31 Augusttagen, `Revision 1`, `unvollstaendig`,
`fehlt` ohne `0,00`, `scrollWidth === clientWidth === 320`, genau zwei Karten
am 10.09.). Die sind plattformunabhängig und waren grün.

### Darwin-Inventar vor und nach dem lokalen E2E-Lauf

Weder `--update-snapshots` noch `-u` wurden ausgeführt.

```
DARWIN_BEFORE_COUNT=12
E2E_EXIT=0
DARWIN_AFTER_COUNT=12
diff darwin-before.txt darwin-after.txt   →   leer, rc=0
```

Das Inventar führt je Datei SHA-256, mtime und Pfad. Der Diff über beide
Aufnahmen ist **leer**: keine Darwin-Datei wurde angelegt, entfernt oder
verändert. Zusätzlich gemessen nach dem Lauf:

```
git status --short                        (leer)
find . -name '*-actual.png' -o -name '*-diff.png'   (kein Treffer)
ls e2e/visual.spec.ts-snapshots/ | wc -l  24   (12 linux verfolgt + 12 darwin ignoriert)
```

`DARWIN_VISUAL_MUTATION = NO`. Evidenzklasse: `MEASURED_IN_TASK_051`.

---

## 4. CI / render environment

### Läufe für den TASK-051-Evidenz-Commit

`TASK051_EVIDENCE_SHA = f191245289750fb04ba6de073c6eae059a59d690`

**Diese beiden Läufe validieren `TASK051_EVIDENCE_SHA`** — den Commit, der
diese Evidenzdatei und die Statuszeile des Plans einführt.

| Rolle | Run-ID | Event | Conclusion | URL |
| --- | --- | --- | --- | --- |
| Push-CI | `34666797071` | `push` | **success** | <https://github.com/DYAI2025/easytree-prototype/actions/runs/34666797071> |
| PR-CI (PR #2, Merge-Kandidat) | `34666799390` | `pull_request` | **success** | <https://github.com/DYAI2025/easytree-prototype/actions/runs/34666799390> |

Alle fünf Jobs, in **beiden** Läufen:

| Job | Push `34666797071` | PR `34666799390` |
| --- | --- | --- |
| `static (format, lint, typecheck)` | success | success |
| `unit (vitest domain + ui)` | success | success |
| `integration (vitest + postgres 17)` | success | success |
| `secret-scan` | success | success |
| `e2e (playwright chromium)` | success | success |

E2E-Ist-Zahlen, wörtlich aus den Joblogs:

```
push 34666797071 / job 103480209115:  Running 148 tests using 1 worker
                                        148 passed (1.4m)
pr   34666799390 / job 103480216814:  Running 148 tests using 1 worker
                                        148 passed (1.2m)
```

`FINAL_E2E_PASSED = 148`, `FINAL_E2E_FAILED = 0`. In beiden Joblogs ist die
Trefferzahl für `✘`, `✗`, `Error:` und `##[error]` **0**.

**Visuelle Fälle 12 / 12 — als Ableitung gekennzeichnet, nicht als
Einzelablesung.** Der in CI konfigurierte `github`-Reporter schreibt keine
Zeile je bestandenem Test (Trefferzahl für `visual` im Joblog: 0); er meldet
Annotationen nur für Fehlschläge und am Ende die Summenzeile. Die Aussage
„12/12" folgt deshalb aus drei gemessenen Werten: 148 Tests gelaufen, 0
Fehlschläge, und `e2e/visual.spec.ts` enthält genau zwölf `test(`-Fälle. Ein
gescheiterter Screenshot-Vergleich hätte die Summenzeile und den Job rot
gemacht. Die Einzelablesung je Fall liegt lokal vor (Abschnitt 3), stammt dort
aber von der Darwin-Rasterung und ist keine Aussage über die Linux-Baselines.

Der folgende Commit, der diese CI-URLs einträgt, ändert **ausschließlich
Dokumentation** und erhält deshalb weiter unten seinen eigenen
Exact-Head-CI-Lauf. Es wird ausdrücklich **nicht** behauptet, dass die beiden
Läufe oben einen späteren SHA validieren.

### Kanonische Renderumgebung (unverändert)

Die visuelle Wahrheit ist **nicht** diese Entwicklungsmaschine, sondern der
E2E-Job des GitHub-Actions-Laufs auf x86_64:

| Feld | Wert |
| --- | --- |
| Image | `mcr.microsoft.com/playwright:v1.63.0-noble` (Job-Container; `runs-on: ubuntu-latest` hostet nur) |
| Plattform | `linux/amd64` — `uname -m` = `x86_64` |
| Playwright | `1.63.0` (Tag folgt `@playwright/test` in `package.json`) |
| Chromium | Revision `1243` aus `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` |
| Schwelle | `maxDiffPixelRatio: 0.01` |
| Zeitanker | `EASYTREE_FIXED_TODAY=2026-09-01` |

Der Schritt „Render-Umgebung protokollieren" hält in jedem Lauf fest, womit
tatsächlich gerendert wurde. Werte aus den **TASK-051-Läufen selbst**
(`MEASURED_IN_TASK_051`), identisch in Push `34666797071` (Job `103480209115`)
und PR `34666799390` (Job `103480216814`):

```
x86_64
v22.23.2
wqy-zenhei.ttc: "WenQuanYi Zen Hei" "Regular"     (fc-match system-ui)
wqy-zenhei.ttc: "WenQuanYi Zen Hei" "Regular"     (fc-match sans-serif)
chromium-1243
chromium_headless_shell-1243
```

Der PostgreSQL-Service desselben Laufs meldet
`PostgreSQL 17.11 … on x86_64-pc-linux-gnu`.

Dieselben Werte wurden zuvor im Lauf `34659288701` gemessen
(`ACCEPTED_PRIOR_EVIDENCE`); die Renderumgebung ist damit über mehrere Läufe
hinweg unverändert.

`--update-snapshots` läuft in **keinem** Workflow; CI regeneriert Baselines nie
automatisch.

---

## 5. Visual baselines

Zwölf verfolgte Linux-Baselines in `e2e/visual.spec.ts-snapshots/`. Die PNGs
sind **verlinkt, nicht kopiert** — `docs/evidence/` enthält keine Bilddateien.

| # | Testtitel in `e2e/visual.spec.ts` | Viewport | Datei | Status |
| --- | --- | --- | --- | --- |
| 01 | 01 Planung September bei 1440 | 1440×900 | [`01-planung-september-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/01-planung-september-1440-chromium-linux.png) | unverändert und geschützt |
| 02 | 02 Planung September bei 768 | 768×1024 | [`02-planung-september-768-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/02-planung-september-768-chromium-linux.png) | unverändert und geschützt |
| 03 | 03 Planung September bei 375 | 375×812 | [`03-planung-september-375-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/03-planung-september-375-chromium-linux.png) | in `d397963` byteweise befördert |
| 04 | 04 Planung August mit sechs Kalenderzeilen | 1440×900 | [`04-planung-august-sechs-zeilen-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/04-planung-august-sechs-zeilen-1440-chromium-linux.png) | unverändert und geschützt |
| 05 | 05 Zehnter September mit zwei parallelen Einsaetzen und langem Baustellennamen | 1440×900 | [`05-tag-10-09-zwei-einsaetze-langer-name-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/05-tag-10-09-zwei-einsaetze-langer-name-1440-chromium-linux.png) | unverändert und geschützt |
| 06 | 06 Einsatzdrawer Schritt 2 mit Kalenderkontext bei 1440 | 1440×900 | [`06-einsatzdrawer-schritt-2-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/06-einsatzdrawer-schritt-2-1440-chromium-linux.png) | in `d397963` byteweise befördert |
| 07 | 07 Tagesbearbeitung bei 1440 | 1440×1400 (Höhe bewusst, Drawer scrollt intern) | [`07-tagesbearbeitung-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/07-tagesbearbeitung-1440-chromium-linux.png) | in `d397963` byteweise befördert |
| 08 | 08 Serienvorschau mit individuell angepasstem Folgetag | 1440×900 | [`08-serienvorschau-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/08-serienvorschau-1440-chromium-linux.png) | in `d397963` byteweise befördert |
| 09 | 09 Kostenansicht im Zustand unvollstaendig | 1440×900 | [`09-kosten-unvollstaendig-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/09-kosten-unvollstaendig-1440-chromium-linux.png) | in `d397963` byteweise befördert |
| 10 | 10 Geocoding-Fehlerzustand | 1440×900 | [`10-geocoding-fehler-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/10-geocoding-fehler-1440-chromium-linux.png) | in `d397963` byteweise befördert |
| 11 | 11 Sichtbarer Fokus auf einer Tageskarte nach Tab | 1440×900 | [`11-tageskarte-fokus-1440-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/11-tageskarte-fokus-1440-chromium-linux.png) | unverändert und geschützt |
| 12 | 12 Reflow bei 320 Pixeln | 320×800 | [`12-reflow-320-chromium-linux.png`](../../../e2e/visual.spec.ts-snapshots/12-reflow-320-chromium-linux.png) | in `d397963` byteweise befördert |

`VISUAL_LINK_COUNT = 12`.

### HUMAN_VISUAL_REVIEW = PASS

Evidenzklasse: **`ACCEPTED_PRIOR_EVIDENCE` — menschliche Abnahme, keine
Freigabe durch Claude.**

Der Product Owner hat die zwölf finalen Kandidaten im Review-Paket
`Claude outputs/EYT-172-human-review-ffa511e` angesehen und als visuelle
Baselines freigegeben. Commit `d397963` hat daraufhin die sieben freigegebenen
Kandidaten **byteweise** in den verfolgten Linux-Satz übernommen; fünf (01, 02,
04, 05, 11) blieben nachweislich byte-identisch.

Herkunft jeder beförderten Datei: der tatsächliche Screenshot des
Exact-Head-CI-Laufs `34635773836` (PR #2, Head `ffa511e`, Event
`pull_request`), gerendert in `mcr.microsoft.com/playwright:v1.63.0-noble`
(`linux/amd64`, Index-Digest
`sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`),
Playwright 1.63.0, Chromium 1243. Jeder Kandidat war im Review-Paket zwischen
Erstversuch und Wiederholung stabil (0 abweichende Pixel, byte-identisch).
Kein Screenshot wurde neu erzeugt; `--update-snapshots` und `-u` liefen nicht.

Die kanonische visuelle Bestätigung `12 / 12 PASS` stammt aus dem
x86_64-CI-Lauf auf dem exakten Head, nicht aus diesem lokalen Durchlauf.

---

## 6. Test matrix — actual results

Die 21 Zeilen der Prüfmatrix aus Plan Abschnitt 11, gefüllt mit dem
tatsächlichen Stand. Alle genannten Tests liefen in den Zeilen 4–6 von
Abschnitt 3 (`MEASURED_IN_TASK_051`), sofern nicht anders vermerkt.

| # | Requirement / Feature | Planned evidence (Plan §11) | Actual current evidence | Status | Source |
| --- | --- | --- | --- | --- | --- |
| 1 | Lokale Daten, DST, Monats-/Jahresgrenzen | TASK-006, inkl. zwei fremde TZ | `src/domain/local-date.test.ts`, 19 Fälle: „überspringt den DST-Wechsel ohne Tagesverlust", „überschreitet die Jahresgrenze in beide Richtungen", „trifft den Schalttag im Schaltjahr"; zwei fremde Zonen belegt in Zeile 141/142 (`Pacific/Kiritimati` → `2026-09-08`, `Pacific/Niue` → `2026-09-07`) | **PASS** | `pnpm test` |
| 2 | Mo–Fr-Ableitung, Wochenend-Opt-in, Obergrenze | TASK-007 / 035 / 018 / AC-03 | `src/domain/workday-derivation.test.ts` (8 Fälle, inkl. `TOO_MANY_DAYS` und `DAY_OUTSIDE_PERIOD`); `src/ui/engagement/step-period.test.tsx`; `create-engagement` („nimmt einen zugewaehlten Samstag als elften Tag auf"); E2E `AC-02/AC-03` | **PASS** | `pnpm test`, `pnpm test:integration`, `pnpm test:e2e` |
| 3 | Zeitregel (Start heute erlaubt, gestern nicht) | TASK-008 / 018 / AC-13 | `src/domain/engagement-rules.test.ts` („lehnt einen Start vor dem heutigen lokalen Datum ab", „erlaubt einen Start am heutigen Tag"); `create-engagement` („lehnt einen Start in der Vergangenheit ab und legt KEINE Zeile an"); E2E `AC-13`. Abweichung PA-02: AC-13 nutzt `2026-08-24`, weil `2026-09-01` der Zeitanker und damit HEUTE ist | **PASS** | `pnpm test:integration`, `pnpm test:e2e` |
| 4 | Monatsraster 5/6 Zeilen, Spans über Zeilen | TASK-009 / 028 / 029 / 020 / AC-01 / AC-06 | `src/domain/month-grid.test.ts` (12 Fälle, u. a. „braucht fuer 2026-08 sechs Zeilen", „setzt bei acht durchgehenden Tagen die Fortsetzung ueber die Zeilengrenze"); `month-grid.test.tsx`, `span-layer.test.tsx`; `queries` („liefert Spans aus der Servertruth"); E2E `AC-01`, `AC-06` | **PASS** | `pnpm test`, `pnpm test:e2e -g "kalender"` |
| 5 | Eine Karte je Baustellentag | TASK-009 / 029 / 020 / AC-04 | `queries` („erzeugt bei DREI Mitarbeitenden trotzdem GENAU EINE Karte je Tag"); `day-card.test.tsx`; E2E `AC-04` („drei Mitarbeitende ergeben EINE Karte mit '3 Personen'") | **PASS** | `pnpm test:integration`, `pnpm test:e2e -g "kalender"` |
| 6 | Farbe + Textredundanz, Kontrast | TASK-010 / 029 / 032 / 048 | `src/domain/colour-palette.test.ts` (8 Fälle, u. a. „kennt genau acht Orientierungsfarben", „haelt die Schwellen bei 4.5 und 3.0 – sie duerfen nicht abgesenkt werden"); axe-Läufe siehe Zeile 16 | **PASS** | `pnpm vitest run src/domain/colour-palette.test.ts` |
| 7 | Idempotenz (Replay, Key-Reuse) | TASK-036 / 015 / 024 | `idempotency` (6 Fälle, u. a. „meldet einen Konflikt, wenn derselbe Key mit anderem Fingerprint kommt", „serialisiert zwei gleichzeitige Zugriffe auf denselben Key"); `create-engagement` (5 weitere Fälle, inkl. „legt bei ZWEI GLEICHZEITIGEN Anfragen mit demselben Key nur einmal an") | **PASS** | `pnpm test:integration -t "idempotency"` |
| 8 | Atomarität (kein Teilzustand) | TASK-018 / 019 | `create-engagement` („rollt bei einem Fehler NACH dem Tageseinfuegen alles zurueck", „laesst nach einem gescheiterten Versuch einen erneuten Anlauf zu"); `day-change` („aendert bei einem Fehler an einem Zieltag KEINEN einzigen Tag") | **PASS** | `pnpm test:integration -t "create-engagement"` |
| 9 | Kardinalität je Baustelle/Tag | TASK-018 | `create-engagement` („verhindert einen zweiten Einsatz mit ueberlappendem Tag an DERSELBEN Baustelle", „nennt die Konflikttage in der Fehlermeldung", „erlaubt denselben Tag an einer ANDEREN Baustelle") | **PASS** | `pnpm test:integration -t "create-engagement"` |
| 10 | Tagesänderung ohne Nebenwirkung | TASK-012 / 043 / 019 / AC-07 | `day-change` („erzeugt fuer NUR DIESEN TAG eine Revision 2 und laesst alle anderen Tage bei 1"); `day-drawer.test.tsx`; E2E `AC-07` („nur dieser Tag aendert genau einen Tag") | **PASS** | `pnpm test:e2e -g "tagesbearbeitung"` |
| 11 | Serienänderung mit Vorschau und Schutz | TASK-012 / 044 / 019 / AC-08 | `src/domain/series-scope.test.ts` (8 Fälle, u. a. „schliesst individuell angepasste Tage standardmaessig aus"); `series-preview-dialog.test.tsx`; `day-change` („aendert angepasste Folgetage NICHT still mit", „markiert einen zuvor einzeln geaenderten Folgetag als adjusted_excluded"); E2E `AC-08` | **PASS** — verifiziert die **Interim-Regel A-06**, nicht die Produktregel; H-01 bleibt offen | `pnpm test:e2e -g "tagesbearbeitung"` |
| 12 | Stale-Revision | TASK-043 / 019 | `day-change` („meldet STALE_REVISION und legt keine neue Revision an"); `day-drawer.test.tsx` | **PASS** | `pnpm test:integration -t "day-change"` |
| 13 | Geocoder Erfolg/leer/Fehler/ohne Key/Throttle | TASK-026 / 041 / AC-09 | `src/server/geocoding/geocoder.test.ts` (inkl. „liefert bei leerem Ergebnis eine leere Liste, keinen Fehler"); `address-search.test.tsx`; E2E `AC-09a` (Treffer wird mit Koordinaten gespeichert), `AC-09b` (Serverfehler, manueller Weg bleibt nutzbar) | **PASS** für den geplanten Umfang. **Belegt mit `fixture`/`manual`, nicht mit einem Live-Anbieter** (PA-07); Erreichbarkeit und Antwortqualität eines echten Providers sind `NOT_REEXECUTED` und hängen an H-04 | `pnpm test:e2e -g "geocoding"` |
| 14 | Kosten: Summen, `fehlt`, Einheit | TASK-011 / 046 / 020 / AC-10 | `src/domain/cost-calculation.test.ts` (7 Fälle, u. a. „zaehlt eine fehlende Grundlage als fehlt und niemals als 0", „rechnet ausschliesslich mit bigint"); `cost-drawer.test.tsx`; `api-costs`, `queries` („meldet in der Kostenuebersicht fehlende Grundlagen statt 0"); E2E `AC-10a`–`AC-10d` | **PASS** | `pnpm test:e2e -g "kosten"` |
| 15 | Persistenz: Reload, zweiter Browser | TASK-020 / AC-11 / AC-12 | E2E `AC-11` („die Einsatz-Id bleibt ueber einen Reload identisch"), `AC-12` („ein zweiter Browserkontext sieht denselben Einsatz mit derselben Id"), `AC-05a`/`AC-05b`; zusätzlich `e2e/planungs-url-state.spec.ts` (7 Fälle B05-1…B05-N) | **PASS** | `pnpm test:e2e -g "einsatz-anlegen"` |
| 16 | Accessibility (axe, Tastatur, Fokus) | TASK-004 / 028 / 033 / AC-14 | axe (Chromium, `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`) auf allen sechs Flächen aus REQ-NF-002: `/planung` (`a11y.spec.ts:53`), `/` (`smoke.spec.ts:26`), `/mitarbeitende`, `/ressourcen`, `/auftraggeber` (parametrisiert in `tastatur-zoom.spec.ts:512`), Einsatzdrawer (`:526`), Kostenansicht (`:539`); „das Monatsraster hat genau EINEN Tabstopp, nicht 35"; Fokusrückgabe in `fokus-drawer.spec.ts` (5 Fälle); axe in jsdom in `app-shell`, `month-grid`, `primitives` | **PASS** — **ohne** menschlichen Screenreader-Durchgang (M-03), der bleibt manuelle Aufgabe | `pnpm test:e2e -g "a11y"`, `-g "tastatur"` |
| 17 | Responsive 320/375/768/1440, Reduced Motion | TASK-033 / 048 / 049 | E2E `AC-14` („bei 320x800 laeuft das Dokument nirgends horizontal ueber", „bei 375 px sind die Tagesaktionsflaechen mindestens 44x44 gross"); `mobil-vergangenheit.spec.ts` bei 375 und 320; `beruehrziele.spec.ts` (EYT-176); `reducedMotion: "reduce"` in `playwright.config.ts`; Visual 02/03/12 | **PASS** | `pnpm test:e2e -g "visual"` |
| 18 | Lange Namen, mehrere parallele Einsätze | TASK-009 / 029 / 020 / 049 | `queries` („zeigt zwei Einsaetze an verschiedenen Baustellen am selben Tag als zwei Karten mit eigener Farbe"); `day-card.test.tsx`; E2E „zeigt parallele Einsaetze … als getrennte Karten"; Visual 05 misst hart `toHaveCount(2)` und `[data-truncate="true"]` | **PASS**. Offengelegt: Visual 05 stellt den langen Namen per `PATCH` auf der Baustelle des zweiten Einsatzes her; ob das als Nachweis der Prüfansicht 5 zählt, ist laut Spec-Kommentar eine **menschliche Entscheidung** | `pnpm test:e2e -g "visual"` |
| 19 | Leere Teams/Ressourcen | TASK-011 / 036 / 018 | **Leere Ressourcen** sind belegt: `cost-calculation.test.ts` (`resources: []` in mehreren Fällen, „liefert fuer einen Einsatz ohne Tage eine leere, vollstaendige Uebersicht"), `queries`, `day-change`, `api-planning`, `api-engagements` (`resourceIds: []`). **Leeres Team** kommt nur als Vorbedingung vor (`e2e/tagesstapel.spec.ts:60`, `employeeIds: []`) — **kein Test behauptet oder prüft das Verhalten bei leerem Team** | **SOURCE_NEEDED** (Teil „leeres Team") | — |
| 20 | Architektur-Invarianten (kein LocalStorage etc.) | TASK-050 | `src/architecture.test.ts`: 5 Guards / 11 Fälle, grün innerhalb von `pnpm test` (Zeile 4). Details siehe Abschnitt 7 | **PASS** | `pnpm vitest run src/architecture.test.ts` |
| 21 | Seed-Idempotenz | TASK-027 | `seed` (7 Fälle, u. a. „aendert beim ZWEITEN Lauf weder Zeilenzahlen noch IDs", „nutzt durchgehend feste UUIDs mit dem vereinbarten Praefix") | **PASS** | `pnpm test:integration -t "seed"` |

**Auszählung:**

| Kennzahl | Wert |
| --- | --- |
| `TEST_MATRIX_TOTAL` | 21 |
| `TEST_MATRIX_PASS` | 20 |
| `TEST_MATRIX_OPEN_HUMAN` | 0 |
| `TEST_MATRIX_SOURCE_NEEDED` | 1 (Zeile 19, Teil „leeres Team") |
| `TEST_MATRIX_NOT_APPLICABLE_BY_SCOPE` | 0 |

Zeile 19 ist bewusst **nicht** als PASS geführt: Die Gesamtsuite ist grün, aber
für das leere Team lässt sich kein Test benennen, der es *prüft* statt es nur
als Aufbau zu benutzen. Ein grüner Gesamtlauf ist kein Nachweis für eine Zeile
ohne eigenen Beleg.

---

## 7. Architecture guards

| Feld | Wert |
| --- | --- |
| Datei | `src/architecture.test.ts` |
| Invariantenfamilien | **5** |
| Testfälle | **11** |
| Ergebnis in TASK-051 | grün, innerhalb von `pnpm test` (36 Dateien / 344 Tests, Exit 0) — `MEASURED_IN_TASK_051` |

Die fünf Guards, gemessen an der Datei selbst
(`describe` = 5, `it` = 11):

1. kein `localStorage`/`sessionStorage` in `src/ui/**` und `src/app/**` (52 Dateien)
2. `src/domain/**` importiert nichts aus `src/server`, `src/app`, `next`, `drizzle-orm`, `postgres` (8 Dateien)
3. `src/contracts/**` importiert keine Serverschicht und keine Serverlaufzeit (11 Dateien)
4. kein `fetch` gegen einen fremden Host außerhalb `src/server/geocoding/**` (101 Dateien)
5. jede `src/app/api/**/route.ts` exportiert ihre HTTP-Methoden als `defineRoute`-Aufruf (17 Dateien)

Jeder Guard sichert zusätzlich eine nicht leere Dateimenge und eine benannte
Ankerdatei zu — ein Guard, dessen Population still leer läuft, wäre grün und
bewachte nichts.

### Gegenmutation 5/5

Evidenzklasse: **`ACCEPTED_PRIOR_EVIDENCE`** aus Commit `f794f1e`
(TASK-050). In TASK-051 **nicht** wiederholt (`NOT_REEXECUTED`).

Da das Repository alle fünf Invarianten bereits erfüllte, wurde jeder Guard
einmal absichtlich rot gemacht und zurückgenommen. Jede Mutation ließ **genau
einen** der 11 Fälle scheitern:

| Mutation | Rot gewordener Fall |
| --- | --- |
| CM1 `localStorage` in `src/ui/primitives/use-reduced-motion.ts` | „fachlicher Zustand liegt auf dem Server" (zusätzlich ESLint `no-restricted-globals`) |
| CM2 `src/domain/local-date.ts` importiert `../server/db/connection` | „importiert weder Server, App noch Laufzeitbibliotheken" |
| CM3 `src/contracts/common.ts` importiert `../server/db/connection` | „importiert weder Server noch Serverlaufzeitbibliotheken" |
| CM4 `fetch("https://example.com/leak")` in `src/lib/api-client.ts` | „kein fetch gegen einen fremden Host" |
| CM5 `src/app/api/guard-probe/route.ts` mit blankem `GET` | „jede exportierte HTTP-Methode ist ein defineRoute-Aufruf" |

Jede Datei byte-identisch wiederhergestellt (`git diff --quiet` rc=0), die
Sonde entfernt, Suite danach wieder grün (11 passed). Keine Mutation ist
committet.

---

## 8. Human input still required

Sieben Entscheidungen sind **nicht** getroffen und werden hier **nicht**
geschlossen. Quelle und Wortlaut:
[`docs/decisions/HUMAN_INPUT_REQUIRED.md`](../../decisions/HUMAN_INPUT_REQUIRED.md),
abgeleitet aus Plan Abschnitt 2.

Ein grüner Testlauf belegt, dass der PROTOTYPE DEFAULT eingehalten wird — nie,
dass er richtig ist.

| ID | Titel / Frage | PROTOTYPE DEFAULT (heute) | Status |
| --- | --- | --- | --- |
| **H-01** | Überschreibungsregel für individuell angepasste Folgetage (OQ-001): übernehmen, überspringen oder fragen? | A-06 — Folgetage mit `origin = 'day_edit'` werden als „individuell angepasst" ausgewiesen und **standardmäßig ausgeschlossen**; Einbeziehen nur einzeln per Checkbox | **OPEN** |
| **H-02** | Dritte Scope-Option `gesamter Einsatz / gesamte Zeitspanne` — auch frühere Tage? | **Nicht gebaut.** Genau zwei Optionen; ein Test sichert `options.length === 2` | **OPEN** |
| **H-03** | Kostenbasis Tages- oder Stundensatz (OQ-014 / FR-020)? | A-03 — **Tagessatz** in EUR Minor Units, UI-benannt als `PROTOTYPE_ONLY Demo-Tagessatz`; fehlende Grundlage = `fehlt`, nie `0,00 €` | **OPEN** |
| **H-04** | Geo-Provider, Lizenz, Datenqualität, Kartenvorschau (OQ-013)? | A-04 — drei serverseitige Adapter `manual` (Default), `nominatim` (Entwicklungsadapter), `fixture` (verlangt `GEOCODER_ALLOW_FIXTURE=1`); keine Kartenkacheln | **OPEN** |
| **H-05** | Pflichtattribute für Fahrzeuge, Maschinen, Geräte (OQ-006)? | A-08 — `vehicle \| machine \| equipment` mit `name`, `identifier`, `active`, optional `daily_cost_minor_units`; keine weiteren Typattribute | **OPEN** |
| **H-06** | Bearbeitung vergangener Tage / rückwirkende Korrektur (OQ-002)? | A-07 — **serverseitig gesperrt** (`ENGAGEMENT_START_IN_PAST`, `422 DAY_IN_PAST_LOCKED`); vergangene Tage bleiben sichtbar und werden erklärt | **OPEN** |
| **H-07** | Verlängerung eines bestehenden Einsatzes (D-007)? | **Nicht gebaut.** `update-engagement-meta` ändert Titel, Beschreibung, Farbe — keinen Zeitraum; `engagements.initial_configuration` hält die Ausgangskonfiguration vor | **OPEN** |

`OPEN_HUMAN_INPUT = H-01, H-02, H-03, H-04, H-05, H-06, H-07` — **alle sieben
bleiben offen.** In diesem Repository existiert keine autoritative menschliche
Entscheidung zu einem der sieben Punkte; TASK-051 trifft keine.

---

## 9. Known prototype boundaries

Dieser Prototyp ist **nicht produktionsreif**. Was er nicht belegt:

- **Keine Produktions-Authentifizierung.** Kein Login, keine Rollen, keine Berechtigungen.
- **Ein Demo-Mandant.** Jede Tabelle trägt `org_id`, aufgelöst über einen serverseitigen `DemoTenantContext` (fest `ORG_DEMO`).
- **Kein RLS-Nachweis.** Mandantentrennung ist strukturell vorbereitet, aber **nicht** nachgewiesen. Es gibt keine Row-Level-Security.
- **Demo-Kostensätze.** Tagessätze sind erfundene `PROTOTYPE_ONLY`-Fixtures, keine betrieblichen Werte. Die Kostenbasis selbst ist H-03.
- **Prototyp-Geocoder-Politik.** `GEOCODER_PROVIDER` steht auf `manual`; ohne bewusste Konfiguration verlässt keine Adresse den Rechner. Der Nachweis in Abschnitt 6, Zeile 13 nutzt den `fixture`-Adapter, **nicht** einen Live-Anbieter.
- **Kein Deployment.** Es gibt keine Bereitstellung, keine Produktionsdatenbank und keine Behauptung über Produktionsverhalten.
- **Kein Screenreader-Smoke** (M-03). Automatisierte axe-Prüfungen ersetzen den menschlichen VoiceOver-Durchgang nicht.
- **Zweite Codebasis** neben `DYAI2025/EasyTree` (Plan §17). Bewusst gewählt, Driftrisiko benannt, nicht beseitigt.
- **Sieben offene Entscheidungen** H-01…H-07 (Abschnitt 8).
- **Offene Beobachtung B-01:** `deadlock detected` im Integrations-Fixture, `OBSERVED_NOT_REPRODUCED` (08.09.2026). In diesem Lauf nicht aufgetreten (19/19 Dateien, 163/163 Tests grün) — das schließt sie **nicht**.
- **Offene Notiz:** `employees.currency` / `resources.currency` stehen im Schema, kommen in keinem Vertrag vor und sind über keine Route schreibbar (B-04). Heute folgenlos, aber eine Lücke, keine Entscheidung.
- **Offene technische Schuld:** die Vite-`configLoader`-Warnung aus `vitest.config.ts` (Abschnitt 3).

**Es wird ausdrücklich keine Produktionsreife behauptet.**

---

## 10. Rollback

Die Rollback-Grenze von TASK-051 ist eng, weil TASK-051 nichts Ausführbares
anfasst:

- Die TASK-051-Commits sind **reine Dokumentation**: `docs/evidence/2026-09-12-prototype-abnahme/README.md` (neu) und die Statuszeile in `docs/plans/2026-09-07-easytree-admin-planning-prototype.md`.
- **Keine Migration** wird in TASK-051 hinzugefügt. Es bleibt bei der einen Migration `drizzle/0000_initial.sql`.
- **Keine Produktdatenmigration** existiert — es gibt keine Produktionsdaten und keinen Datenbestand außerhalb der reproduzierbaren Demo-Fixtures.
- Kein Produktcode, kein Test, kein Workflow, keine Konfiguration, kein Screenshot wird geändert.

Rücknahme: `git revert` der TASK-051-Commits. Danach steht der Plan wieder auf
seinem vorherigen Status und die Evidenzdatei ist entfernt; das lauffähige
System bleibt in jedem Fall unverändert.

Der Demo-Datenstand wird jederzeit durch `pnpm db:reset && pnpm db:seed`
wiederhergestellt (in Abschnitt 2 ausgeführt, Exit 0).

---

## 11. Final disposition

| Feld | Wert |
| --- | --- |
| `TASK051_LOCAL_GATE` | **PASS** — `pnpm db:reset && pnpm db:seed` Exit 0; alle sechs Validierungsbefehle Exit 0; keine Darwin-Visual-Mutation; Arbeitsbaum sauber |
| `CI` | **PASS** auf `TASK051_EVIDENCE_SHA` (`f191245`): Push `34666797071` und PR `34666799390`, je fünf Jobs `success`, E2E 148 passed / 0 failed (Abschnitt 4). Der Exact-Head-Lauf des nachfolgenden Evidenz-URL-Commits ist davon getrennt |
| `MERGE` | **NOT_AUTHORIZED** — PR #2 bleibt offen; kein Merge nach `master` |
| `PRODUCTION_READY_CLAIMED` | **NO** |

Offene Punkte, die diese Abnahme begleiten und nicht durch sie geschlossen
werden: H-01…H-07 (Abschnitt 8), die Grenzen aus Abschnitt 9 und die eine
`SOURCE_NEEDED`-Zeile der Prüfmatrix (Abschnitt 6, Zeile 19).

### Anmerkung zur Statuszeile des Plans

TASK-051 setzt ausschließlich die Kopfzeile
`Status: draft-with-assumptions` → `Status: ready-for-review` und das Datum
`Last updated:`. Der Selbstprüfungsabschnitt 17 desselben Plans nennt unter
**Final readiness** weiterhin `draft-with-assumptions`. Das ist **Absicht**:
Abschnitt 17 ist die Selbstauskunft des Plans zum Zeitpunkt seiner Erstellung
(07.09.2026) und wird nicht rückwirkend umgeschrieben. Die Diskrepanz steht
hier, damit sie sichtbar ist und nicht als Versehen gelesen wird.
