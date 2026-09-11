# Runbook Entwicklung — EasyTree Prototype

Grundlage: Abschnitt 13 des kanonischen Plans
[`docs/plans/2026-09-07-easytree-admin-planning-prototype.md`](../plans/2026-09-07-easytree-admin-planning-prototype.md).
Jeder Befehl hier ist gegen den **aktuellen** Stand des Repos geprüft, nicht aus
dem Plan übernommen. Wo Repo und Plan auseinandergehen, gilt das Repo; die
Stelle ist unten benannt.

---

## 1. Voraussetzungen

| Werkzeug | Anforderung | Quelle im Repo |
| --- | --- | --- |
| Node | `>=22 <23` | `package.json` (`engines`), `.nvmrc` → `22` |
| pnpm | `10.28.0` | `package.json` (`packageManager`) |
| Docker | laufender Daemon mit `docker compose` | `docker-compose.yml` |
| Git | — | — |

`.npmrc` setzt `engine-strict=true`: eine falsche Node-Hauptversion bricht
`pnpm install` ab, statt still weiterzulaufen.

pnpm wird **nicht** global installiert, sondern über corepack bereitgestellt.

## 2. Repository und Branch

```bash
git clone https://github.com/DYAI2025/easytree-prototype.git
cd easytree-prototype
git checkout feat/admin-planning-prototype
```

Gearbeitet wird ausschließlich auf `feat/admin-planning-prototype`. **Kein
Commit auf `master`.**

## 3. Toolchain

```bash
corepack enable
pnpm install --frozen-lockfile
```

`pnpm-workspace.yaml` gibt `unrs-resolver` und `esbuild` als einzige Pakete
frei, deren Build-Skripte laufen dürfen (nativer Resolver für ESLint, native
Binary für `drizzle-kit`/`tsx`).

## 4. Environment

```bash
cp .env.example .env.local
```

`.env.example` enthält ausschließlich nicht-geheime lokale Defaults:

| Variable | Default | Bedeutung |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:easytree@127.0.0.1:55432/easytree_prototype` | Entwicklungsdatenbank |
| `DATABASE_URL_TEST` | `…/easytree_prototype_test` | Integrationstests; der Name **muss** auf `_test` enden |
| `GEOCODER_PROVIDER` | `manual` | `manual` \| `nominatim` \| `fixture` |
| `GEOCODER_BASE_URL` | leer | nur bei `nominatim`; ohne Wert `https://nominatim.openstreetmap.org` |
| `GEOCODER_USER_AGENT` | leer | Pflicht der Nominatim-Usage-Policy |
| `GEOCODER_ALLOW_FIXTURE` | leer | `1` schaltet den Fixture-Adapter frei |
| `EASYTREE_FIXED_TODAY` | leer | Zeitanker `YYYY-MM-DD` |

Zwei Dinge, die sonst Zeit kosten:

- **`.env.local` ist Pflicht, nicht Komfort.** `db:migrate`, `db:seed` und
  `db:reset` laufen über `node --env-file=.env.local`. Fehlt die Datei, bricht
  Node mit Exit 9 ab, bevor irgendein Skript startet.
- **`GEOCODER_PROVIDER=manual` ist Absicht.** Ohne bewusste Umstellung verlässt
  keine Adresse den Rechner. Geocoding läuft ausnahmslos serverseitig
  (`src/server/geocoding/**`); ein Architektur-Guard hält das fest.

## 5. PostgreSQL starten

```bash
docker compose up -d db
docker compose exec db pg_isready -U postgres -d easytree_prototype
```

`postgres:17-alpine`, Container `easytree-prototype-db`, erreichbar auf
`127.0.0.1:55432`.

> **Abweichung vom Plan §13:** dort steht `docker compose exec db pg_isready`
> ohne `-U`/`-d`. Der Healthcheck in `docker-compose.yml` benutzt beide Flags;
> ohne sie prüft `pg_isready` gegen den Betriebssystem-Benutzer `root` und kann
> irreführend antworten.

`docker/initdb/01-create-test-database.sql` legt `easytree_prototype_test` an —
aber **nur beim ersten Anlegen des Volumes**. Existiert das Volume schon und
fehlt die Testdatenbank, einmal von Hand:

```bash
docker compose exec db psql -U postgres -d easytree_prototype \
  -c 'create database easytree_prototype_test'
```

## 6. Migration, Seed, Reset

```bash
pnpm db:migrate      # Migrationen aus drizzle/ anwenden
pnpm db:seed         # Demo-Daten (PROTOTYPE_ONLY)
pnpm db:reset        # Schema verwerfen, neu anlegen, migrieren - OHNE Seed
pnpm db:generate     # drizzle-kit generate, nur nach Schemaänderung
```

`pnpm db:reset` **seedet nicht**. Der Demo-Stand entsteht erst durch:

```bash
pnpm db:reset && pnpm db:seed
```

Es existiert genau eine Migration (`drizzle/0000_initial.sql`). Ab dem ersten
geteilten Einsatz des Prototyps gilt: nur additive Folgemigrationen
(`0001_…`), kein Editieren von `0000`.

## 7. Entwicklungsserver

```bash
pnpm dev
```

http://localhost:3000 — `/` leitet auf `/planung?monat=<aktueller Monat>` um
(serverseitig aus der Uhr abgeleitet, `dynamic = "force-dynamic"`).

### Seiten

| Route | Inhalt |
| --- | --- |
| `/planung?monat=YYYY-MM` | Monatskalender, Einstiegsfläche |
| `/auftraggeber` | Auftraggeber und ihre Baustellen |
| `/mitarbeitende` | Mitarbeitendenstammdaten |
| `/ressourcen` | Fahrzeuge, Maschinen, Geräte |

Ansichtszustand steht vollständig in der URL:
`?monat=…&tag=…&drawer=neu|tag|kosten&id=…`.

### API

`/api/health` · `/api/auftraggeber[/:id]` · `/api/baustellen[/:id]` ·
`/api/einsaetze[/:id][/kosten]` · `/api/baustellentage/:id[/aenderungen][/aenderungen/vorschau]` ·
`/api/mitarbeitende[/:id]` · `/api/ressourcen[/:id]` · `/api/planung/monat` ·
`/api/geocoding/suche`

Jede Route geht durch `defineRoute` aus `src/server/http/handler.ts`; Fehler
kommen als RFC-7807 `application/problem+json` mit gespiegelter
`x-correlation-id` und ohne Stacktrace.

## 8. Tests

### Unit und Component

```bash
pnpm test                                   # vitest: Projekte domain (node) + ui (jsdom)
pnpm vitest run src/domain/local-date.test.ts -t "parseLocalDate"
TZ=Pacific/Kiritimati pnpm vitest run src/domain/local-date.test.ts
```

### Integration

```bash
pnpm test:integration                       # vitest: Projekt integration
pnpm test:integration -t "create-engagement"
```

Drei Dinge, die hier regelmäßig stolpern lassen:

- `-t` filtert **Testnamen**, keine Pfade. Der oberste `describe` jeder
  Integrationsdatei heißt exakt wie die Datei ohne Endung. Ein falscher Name
  meldet „no test files" statt eines ehrlichen Fehlschlags.
- Der Lauf verwirft das komplette Schema. `tests/integration/env.ts` lässt das
  nur gegen eine Datenbank zu, deren Name auf `_test` endet.
- Alle Integrationsdateien teilen eine Datenbank, deshalb
  `fileParallelism: false`.

### E2E

```bash
pnpm test:e2e                               # Playwright/Chromium, baut vorher
pnpm test:e2e -g "kalender"
```

- `globalSetup` (`e2e/fixtures/seed-helper.ts`) fährt **einmal pro Lauf**
  `pnpm db:reset` und `pnpm db:seed`.
- `webServer` startet `pnpm build && pnpm start` (Timeout 300 s) und probt
  `/api/health` — bewusst nicht die Startseite, die ein migriertes Schema
  bräuchte, das erst `globalSetup` anlegt.
- `reuseExistingServer` ist **immer** `false`. Läuft schon etwas auf dem Port,
  scheitert der Lauf laut, statt still gegen einen fremden Server zu prüfen.
  Lokal deshalb mit freiem Port: `PORT=3100 pnpm test:e2e`.
- Gegen eine bereits laufende Instanz testen: `PLAYWRIGHT_BASE_URL=… pnpm test:e2e`
  (dann startet Playwright keinen eigenen Server).
- `workers: 1`, `fullyParallel: false` — alle Specs teilen eine Datenbank.
- Zeitanker: `EASYTREE_FIXED_TODAY` (Default `2026-09-01`). Ohne ihn laufen die
  Akzeptanzszenarien nach wenigen Tagen in `ENGAGEMENT_START_IN_PAST`.
- Der Bericht ist lokal `list`. Ein HTML-Bericht entsteht nur mit gesetztem
  `CI`; erst dann lohnt `pnpm exec playwright show-report`.

## 9. Visuelle Tests und ihre Renderumgebung

Zwölf Baselines in `e2e/visual.spec.ts-snapshots/`, Schwelle
`maxDiffPixelRatio: 0.01`.

```bash
pnpm test:e2e -g "visual"
```

**Kanonische Renderumgebung ist der CI-Lauf**, nicht die eigene Maschine:

- Image `mcr.microsoft.com/playwright:v1.63.0-noble`, als **Job-Container** der
  CI (`runs-on: ubuntu-latest` hostet nur). Die Tag-Version muss
  `@playwright/test` in `package.json` folgen.
- `ubuntu-latest` löst `system-ui` auf DejaVu Sans auf, das Image hat kein
  DejaVu (Liberation, FreeSans, WenQuanYi). Deshalb der Container — direkt auf
  dem Runner scheiterten 11 von 12 Fällen an genau dieser Schriftdifferenz.
- Browser und Bibliotheken kommen allein aus dem Image
  (`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, Chromium Revision 1243). Deshalb
  **kein** `playwright install --with-deps` — das ruft `apt-get` und hebt genau
  die Umgebung an, die hier festgeschrieben sein soll.
- Gleicher Tag heißt nicht gleiches Binary: CI zieht `linux/amd64`, Apple
  Silicon lokal `linux/arm64`. Die abgenommenen Baselines stammen aus dem
  amd64-Lauf.
- Baselines heißen `*-linux.png`. Ein lokaler macOS-Lauf erzeugt daneben
  `*-darwin.png` — für die Linux-CI unsichtbar und deshalb in `.gitignore`.

Lokal gegen die abgenommenen Baselines pruefen, im kanonischen Image
(Vorschau, **kein** Gate — massgeblich bleibt der CI-Lauf):

```bash
docker run --rm --platform linux/amd64 -v "$PWD:/w" -w /w \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  npx playwright test -g "visual"
```

`--platform linux/amd64` ist noetig, weil Apple Silicon sonst das
arm64-Manifest zieht; die abgenommenen Baselines stammen aus dem amd64-Lauf.

**`--update-snapshots` steht hier bewusst nicht.** Der Schalter hat die
Baselines in TASK-049 einmal erzeugt (die Form ist in `playwright.config.ts`
dokumentiert); wer ihn heute ausfuehrt, ueberschreibt abgenommene Bilder still
mit dem eigenen Lauf — genau das, was die Regel unten ausschliesst.

### Regel für Baselines

**CI regeneriert Baselines nie automatisch.** `--update-snapshots` läuft in
keinem Workflow. Eine neue Baseline entsteht so und nur so:

1. Der Screenshot stammt aus einem CI-Lauf auf dem exakten Head.
2. Ein Mensch sieht ihn an und gibt ihn frei.
3. Die freigegebene Datei wird **byteweise** übernommen, nicht neu erzeugt.

Ein Screenshot-Gate ist blind für vieles: Änderungen unter der Pixelschwelle
bleiben grün. Jede visuelle Prüfung trägt deshalb **vor** dem Bild eine
fachliche Zusicherung im DOM. Ein kaputter Zustand soll an dieser Zusicherung
scheitern, nicht als hübsches neues Bild in die Baseline wandern.

## 10. Vollständige Prüfung (CI-Äquivalent)

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e
```

Sechs Exit-0 entsprechen den CI-Jobs `static`, `unit`, `integration` und `e2e`.
Der fünfte Job `secret-scan` ist lokal nachstellbar:

```bash
git grep -nE '(api[_-]?key|secret|password)[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9_./+-]{8,}' -- . ':!*.example'
```

`git grep` endet bei **keinem** Treffer mit Exit 1 — im Workflow steht die
Bedingung deshalb invertiert. Ein grüner Lauf heißt nur „dieses Muster findet
nichts", nicht „es gibt keine Geheimnisse".

### Vor jedem Commit

1. der fokussierte Lauf der Aufgabe,
2. `pnpm test`,
3. `pnpm test:integration`, sobald DB, Commands, Queries oder Routen berührt
   sind,
4. `pnpm build`, sobald React-Komponenten oder Seiten berührt sind — nur der
   Build zeigt Server/Client-Grenzverletzungen, die jsdom nicht sieht.

## 11. Zurücksetzen und Herunterfahren

```bash
pnpm db:reset && pnpm db:seed      # Demo-Stand wiederherstellen
docker compose down                # Container stoppen, Daten behalten
docker compose down -v             # Volume ebenfalls entfernen
```

Nach `down -v` legt der nächste `up -d db` die Testdatenbank über
`docker/initdb/` wieder mit an.

## 12. Rollback-Grenzen

- **Schema.** Eine Migration, keine Produktionsdaten. Rücknahme:
  `docker compose down -v`, Migration löschen, `pnpm db:generate`.
- **Domain.** Reine Funktionen; `git revert` des Commits, die Tests zeigen den
  Verlust sofort.
- **API.** Route Handler sind additiv; eine Route zu entfernen bricht nur die
  zugehörige Oberfläche.
- **UI.** Jede Fläche ist eine eigene Komponente mit eigenem Test. Der Kalender
  bleibt ohne Drawer bedienbar.
- **Daten.** Revisionen sind append-only — eine fehlerhafte Tagesänderung legt
  eine neue Revision an und überschreibt keine Historie.

## 13. Sicherheitsgrenzen und Prototyp-Grenzen

**Nicht erlaubt:** Deployment, Merge nach `master`, Produktionsdatenbank,
externe Nachrichten, `push --force`, `--no-verify`.

**Was dieser Prototyp nicht belegt:**

- **Kein Auth, ein Demo-Mandant.** Jede Tabelle trägt `org_id`, aufgelöst über
  einen serverseitigen `DemoTenantContext` (fest `ORG_DEMO`). Keine RLS.
  Mandantentrennung ist vorbereitet, nicht nachgewiesen.
- **Tagessätze sind `PROTOTYPE_ONLY`.** Fehlt eine Kostengrundlage, steht dort
  `fehlt` — nie `0,00 €` —, und die Summe gilt als unvollständig.
- **Vergangene Tage sind serverseitig gesperrt** (`422 DAY_IN_PAST_LOCKED`),
  bleiben aber sichtbar und erklärt.
- **Kein Screenreader-Smoke.** axe ersetzt den menschlichen VoiceOver-Durchgang
  nicht; das bleibt eine manuelle Aufgabe.

Sieben Entscheidungen sind ausdrücklich offen und dürfen nicht still getroffen
werden: [`docs/decisions/HUMAN_INPUT_REQUIRED.md`](../decisions/HUMAN_INPUT_REQUIRED.md).

## 14. Architektur-Guards

```bash
pnpm vitest run src/architecture.test.ts
pnpm lint
```

`src/architecture.test.ts` liest die Quellen mit dem TypeScript-Parser und
sichert fünf Invarianten:

1. kein `localStorage`/`sessionStorage` in `src/ui/**` und `src/app/**`;
2. `src/domain/**` importiert nichts aus `src/server/**`, `src/app/**`, `next`,
   `drizzle-orm`, `postgres`;
3. `src/contracts/**` importiert nichts aus `src/server/**` (und keine
   Serverlaufzeit);
4. kein `fetch` gegen einen fremden Host außerhalb `src/server/geocoding/**`;
5. jede `src/app/api/**/route.ts` exportiert ihre HTTP-Methoden als
   `defineRoute`-Aufruf.

`eslint.config.mjs` deckt zusätzlich ab, was ESLint verlässlich ausdrücken
kann: die Import-Grenzen von `src/contracts` und `src/domain`
(`no-restricted-imports`) und die Speichergrenze
(`no-restricted-globals`/`no-restricted-properties`).
