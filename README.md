# EasyTree Prototype — Admin-Planung

Eigenständiger, baustellenzentrierter Planungs-Prototyp: **Auftraggeber →
Baustelle → Einsatz → Baustellentage → Team/Ressourcen → Tages- und
Serienbearbeitung → Monatskalender → Plan-Kosten.**

> **PROTOTYPE_ONLY — nicht produktionsreif.**
> Kein Auth, ein fester Demo-Mandant (`ORG_DEMO`), keine RLS, kein Deployment,
> keine Produktionsdaten. Tagessätze sind Demo-Werte. Der Prototyp belegt einen
> Bedienfluss, **kein** Mandanten-, Berechtigungs- oder Abrechnungsverhalten.

Sprache: Fachbegriffe, Oberflächentexte und URL-Segmente sind **deutsch**
(`/planung`, `/mitarbeitende`, `/ressourcen`, `/auftraggeber`,
`/api/einsaetze`, `/api/baustellentage`). Code-Bezeichner sind englisch.

## Produktmodell in Kürze

Ein **Einsatz** hängt an einer **Baustelle**, die einem **Auftraggeber**
gehört. Der Einsatz materialisiert **Baustellentage** — Mo–Fr automatisch
abgeleitet, Wochenenden nur auf ausdrücklichen Wunsch. Jeder Tag trägt Team und
Ressourcen; Planzeiten sind optional.

Sieben Invarianten, die den Prototyp ausmachen und die nicht „verbessert"
werden dürfen:

1. **Eine Karte je Baustellentag**, unabhängig von der Teamgröße — nie eine
   Zeile je Mitarbeiter. Mehrere Einsätze an einem Tag stapeln sich, jeder mit
   eigenem Farbrahmen.
2. **Individuell angepasste Folgetage werden nie still überschrieben.** Die
   Serienvorschau markiert sie und schließt sie standardmäßig aus; Einbeziehen
   ist eine Entscheidung je Tag. Es gibt genau zwei Reichweiten: `nur dieser
   Tag` und `dieser und folgende Tage`.
3. **Fehlende Kostengrundlage steht als `fehlt` da, nie als `0,00 €`.** Die
   Summe gilt dann als unvollständig.
4. **Kein Einsatzbeginn und keine Tagesänderung vor dem heutigen lokalen
   Datum** (`Europe/Berlin`, serverseitig erzwungen). Vergangene Tage bleiben
   sichtbar und werden erklärt, nicht versteckt.
5. **Farbe ist Orientierung, nie Statuswahrheit.** Status trägt immer Text.
6. **Kosten sind nie die Einstiegsfläche.** Der Einstieg ist `/planung`.
7. **Aller fachlicher Zustand liegt auf dem Server.** Neuladen und ein zweiter
   Browserkontext zeigen dieselben IDs. Kein `localStorage`, kein
   `sessionStorage` — Ansichtszustand steht in der URL.

## Voraussetzungen

Node `>=22 <23` (`.nvmrc` → `22`), pnpm `10.28.0` über corepack, Docker mit
`docker compose`, Git.

## Schnellstart

```bash
corepack enable && pnpm install --frozen-lockfile
cp .env.example .env.local

docker compose up -d db            # postgres:17-alpine auf 127.0.0.1:55432
pnpm db:migrate && pnpm db:seed

pnpm dev                           # http://localhost:3000 -> /planung?monat=<aktueller Monat>
```

`pnpm db:reset` setzt das Schema zurück, **ohne** zu seeden — der Demo-Stand
entsteht durch `pnpm db:reset && pnpm db:seed`.

## Seiten

| Route | Inhalt |
| --- | --- |
| `/` | leitet auf `/planung?monat=<aktueller Monat>` |
| `/planung?monat=YYYY-MM` | Monatskalender, Einstiegsfläche |
| `/auftraggeber` | Auftraggeber und Baustellen |
| `/mitarbeitende` | Mitarbeitendenstammdaten |
| `/ressourcen` | Fahrzeuge, Maschinen, Geräte |

## Tests

```bash
pnpm test                # Unit + Component (vitest: domain + ui)
pnpm test:integration    # gegen easytree_prototype_test (vitest: integration)
pnpm test:e2e            # Playwright/Chromium gegen den Produktionsbuild
pnpm test:e2e -g "visual"

pnpm format && pnpm lint && pnpm typecheck

pnpm vitest run src/architecture.test.ts    # die fünf Architektur-Guards
```

## Architektur

```
src/domain      reine Fachlogik, kein I/O
src/contracts   Zod-Schemata für Client und Server
src/server      db/ tenant/ clock/ idempotency/ audit/ commands/ queries/ geocoding/ http/
src/app/api     Route Handler, jede route.ts durch defineRoute
src/app, src/ui React; der Client mutiert nur über /api/* via src/lib/api-client.ts
```

Die Richtung ist einseitig und wird maschinell gehalten:
`src/architecture.test.ts` (fünf Guards, TypeScript-Parser) plus
`no-restricted-imports`/`no-restricted-globals` in `eslint.config.mjs`.

## Visuelle Baselines

Zwölf Screenshots in `e2e/visual.spec.ts-snapshots/`, gerendert im gepinnten
Image `mcr.microsoft.com/playwright:v1.63.0-noble` (`linux/amd64` in CI).

> **CI regeneriert Baselines nie automatisch.** `--update-snapshots` läuft in
> keinem Workflow. Eine neue Baseline stammt aus einem CI-Lauf auf dem exakten
> Head, wird von einem Menschen freigegeben und byteweise übernommen — nie neu
> erzeugt, um einen roten Lauf grün zu bekommen.

Lokale macOS-Läufe erzeugen `*-darwin.png`; die sind für die Linux-CI unsichtbar
und deshalb ignoriert.

## Weiterlesen

- [`docs/runbooks/entwicklung.md`](docs/runbooks/entwicklung.md) — vollständiges
  Entwicklungs-Runbook: Datenbank, Tests, Renderumgebung, Rollback-Grenzen.
- [`docs/decisions/HUMAN_INPUT_REQUIRED.md`](docs/decisions/HUMAN_INPUT_REQUIRED.md)
  — die sieben offenen Entscheidungen (H-01…H-07), die nicht still getroffen
  werden dürfen.
- [`docs/plans/2026-09-07-easytree-admin-planning-prototype.md`](docs/plans/2026-09-07-easytree-admin-planning-prototype.md)
  — der kanonische Plan: Anforderungen, Datenmodell, UX-Spezifikation, Aufgaben
  TASK-001…TASK-051, Prüfmatrix.
- [`docs/planabweichungen.md`](docs/planabweichungen.md) — wo die Umsetzung vom
  Plan abweicht und warum.
- [`docs/beobachtungen.md`](docs/beobachtungen.md) — offene Beobachtungen, die
  nicht geschlossen werden, nur weil der nächste Lauf grün war.

## Sicherheitsgrenzen

Kein Deployment, kein Merge nach `master`, keine Produktionsdatenbank, kein
`push --force`, kein `--no-verify`. `GEOCODER_PROVIDER` steht auf `manual` —
ohne bewusste Konfiguration verlässt keine Adresse den Rechner. `.env.example`
enthält ausschließlich nicht-geheime Defaults.
