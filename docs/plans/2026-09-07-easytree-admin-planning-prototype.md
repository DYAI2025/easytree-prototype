# EasyTree Admin Planning Prototype Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Jede Code-Task ist TDD-first (failing test → minimal implementation → focused run → broader run → commit). Skills: @test-driven-development, @systematic-debugging, @finishing-a-development-branch.

Plan path: `docs/plans/2026-09-07-easytree-admin-planning-prototype.md` (Repository `DYAI2025/easytree-prototype`)
Status: `draft-with-assumptions` (ausführbar ab TASK-001; blockierte Teil-Features sind einzeln markiert)
Owner/Executor: coding agent
Last updated: 2026-09-07 (Europe/Berlin)

**Goal:** Ein lauffähiger, serverseitig persistierender, baustellenzentrierter Admin-Planungsprototyp (Monatskalender September 2026, Einsatz-Anlage mit materialisierten Baustellentagen, Team/Ressourcen, Tages-/Serienbearbeitung, Geocoding-Adapter, Plan-Kostenübersicht) als eigenständige Codebasis im leeren Repository `easytree-prototype`.

**Architecture:** Eine Next.js-16-App (App Router, React 19, TypeScript) mit Route Handlers als API, reiner Domänenschicht (`src/domain`, ohne I/O), Zod-Contracts (`src/contracts`, von Client und Server geteilt), Drizzle-ORM auf PostgreSQL 17 (Docker) als einzige operative Wahrheit, revisionsgebundenen Tageskonfigurationen (append-only), Idempotenz- und Audit-Tabellen sowie einem serverseitigen, austauschbaren Geocoder-Adapter. UI mit Tailwind v4 + Radix-Primitives (shadcn-Muster, Code im Repo) und den EasyTree-Basisdesign-Tokens.

**Tech Stack:** pnpm 10 · Node 22 · Next 16.3 · React 19.2 · TypeScript 5.9 · Zod 4 · Drizzle ORM 0.45 + drizzle-kit · postgres.js · PostgreSQL 17 (Docker) · Tailwind 4.3 · Radix UI · react-hook-form 7 · Vitest 4 (+ Testing Library, jsdom, axe-core) · Playwright 1.63 (+ @axe-core/playwright) · GitHub Actions.

---

<!-- GOAL_START -->
Goal: Baustellenzentrierter EasyTree-Admin-Planungsprototyp mit echter Persistenz

Ziel.
Ein Coding-Agent baut im leeren Repository `DYAI2025/easytree-prototype` einen eigenständigen, voll lauffähigen Vertical Slice der EasyTree-Admin-Planung: Auftraggeber → Baustelle → Einsatz → Baustellentage → Einsatzteam/Ressourcen → Tages-/Serienbearbeitung → Monatskalender → Plan-Kostenübersicht. Alle fachlichen Zustände liegen serverseitig in PostgreSQL; Reload und zweiter Browserkontext zeigen dieselben IDs. Der Prototyp folgt der Produktsemantik von PRD v2.0 und dem Human-PO-Vertrag vom 06.09.2026, ohne offene Produktentscheidungen zu schließen.

Scope.
Repository `DYAI2025/easytree-prototype`, Branch `master` @ `5a3550fb543bbfbcc55c2c0c38b493ad31e43fd4` (leer bis auf den Master-Prompt). Arbeit auf Branch `feat/admin-planning-prototype`; kein Commit direkt auf `master`. Stack: Next 16 App Router + Route Handlers, Drizzle/PostgreSQL 17 (Docker), Vitest, Playwright. Ein Demo-Mandant, keine Anmeldung (PROTOTYPE_ONLY). Kein Code aus `DYAI2025/EasyTree` wird übernommen außer den Basisdesign-Tokens (CSS-Variablen) mit Herkunftsvermerk.

Bedingungen (hart).
- Baustellentag erscheint im Kalender genau einmal, unabhängig von der Teamgröße.
- WorksiteDay-Identität `(org, worksite, local_date)` ist eindeutig und stabil; Tageskonfigurationen sind append-only Revisionen.
- Serverseitige Zeitregel: kein Einsatzstart und keine Tagesmutation vor dem aktuellen lokalen Datum (Europe/Berlin).
- Montag–Freitag automatisch; Wochenenden opt-in; geplante Uhrzeiten optional (Vorbelegung 08:00–18:00 nur bei aktivierter Erfassung).
- Serienänderung: `nur dieser Tag` und `dieser und folgende Tage` mit Vorschau + Bestätigung; individuell angepasste Folgetage werden nie still überschrieben.
- Kosten: fehlende Grundlagen erscheinen als `fehlt`, nie als 0; Demo-Tagessätze sind PROTOTYPE_ONLY.
- Geocoding nur serverseitig über Adapter; keine Secrets im Client; Manual-Fallback ohne Provider.
- Farbe nie einziger Informationsträger; Tastatur, Fokus, Screenreader-Semantik, 320-px-Reflow (≈200 % Zoom) sind Testkriterien.
- Kein LocalStorage als fachliche Wahrheit.

Akzeptanzkriterien.
- AC-01…AC-14 aus Abschnitt 3 sind als E2E-/Integrationstests grün (`pnpm test`, `pnpm test:integration`, `pnpm test:e2e`).
- `pnpm lint && pnpm typecheck && pnpm test` grün; CI-Workflow grün auf dem Feature-Branch.
- Seed erzeugt reproduzierbar die Demo-Daten aus Abschnitt 12.

Explizit out-of-scope.
- Veröffentlichung/Publish-Workflow, Mitarbeiter-Client (Heute/Woche/Melden/Zeiten/Ich), Zeitbuchung.
- Konfliktprüfung/Deckungslücken, Kompetenzen, Urlaub/Krankheit, Wetter, Export, CRM/Payroll, Auth/Mehrmandantenlogin.
- Dritte Scope-Option `gesamter Einsatz`, Einsatz-Verlängerung, rückwirkende Korrekturen (HUMAN_INPUT_REQUIRED).

Done-Definition.
Ein frischer Klon + `docker compose up -d` + `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` zeigt unter `/planung?monat=2026-09` den September 2026 mit den Seed-Einsätzen; alle Tasks TASK-001…TASK-051 sind mit ihren Validierungsbefehlen abgeschlossen; E2E inkl. Reload, zweitem Browserkontext, axe-Scan und Screenshot-Baselines liegen im Repo; offene Human-Entscheidungen sind in `docs/decisions/HUMAN_INPUT_REQUIRED.md` gelistet.

Reference-Doc:
Confluence 7766017 (PRD v2.0), 46727169 (Glossar), 46170121, 41484289, 5505026, 31948801, 47284236, 49119274 (Anti-Drift-Vertrag), 9306113; Jira EYT-120/121/122; dieser Plan.
<!-- GOAL_END -->

---

## 1. Evidence and source boundary

Alle Angaben in diesem Abschnitt wurden am 2026-09-07 live gelesen (Confluence via Atlassian-MCP, Jira via JQL, GitHub via `git ls-remote`/Clone). Nicht gelesene Seiten sind als solche markiert.

| Quelle | Status | Geprüft? | Relevante Fakten | Offene Unsicherheiten |
| --- | --- | --- | --- | --- |
| Confluence `7766017` PRD v2.0 (04.09.2026) | CANONICAL_SSoT | ja, vollständig | Kette Auftraggeber→Baustelle→Einsatz→Baustellentage→Team/Ressourcen; FR-001…FR-024; NFR-001…NFR-007; OQ-001…OQ-014 explizit offen; Farbe ist nachgeordnete Orientierungsfunktion | keine |
| Confluence `46727169` Glossar (03.09.2026) | CANONICAL | ja | Begriffe Einsatz, Baustellentag, Einplanung, Arbeitszeit (nicht „Intervall“), Ressource, Navigation `Mitarbeitende`/`Ressourcen` getrennt; Ressourcentyp-Attribute HUMAN_INPUT_REQUIRED | keine |
| Confluence `46170121` Einsatzanforderungen (03.09.2026) | CANONICAL_DECISION | ja | Einsatzanforderung/Deckungslücke sind MVP_REQUIRED, aber Granularität/Publish-Semantik/Warnungs-UX offen | Für diesen Slice out-of-scope (nicht im Master-Prompt-Scope) |
| Confluence `41484289` EYT-125 Architektur (05.09.2026) | TECHNICAL_BASELINE | ja | Variante B1: `worksite_days` Identität, `worksite_day_configurations` Revision, Assignments untergeordnet; Lock-Reihenfolge; Publish-Unveränderlichkeit | Gilt für `DYAI2025/EasyTree`; für den Standalone-Prototyp nur als Vorbild |
| Confluence `5505026` Softwaredokumentation (04.09.2026) | Index | ja | SSoT-Hierarchie 1–9; „Kosten nicht als Admin-Startfläche“ | keine |
| Confluence `31948801` Delivery-Reconciliation (06.09.2026) | CURRENT_GATE | ja | EYT-120 aktiv; Human-PO: startDate Pflicht, endDate optional, keine Pflicht-Uhrzeiten, Mo–Fr automatisch, Kalender = optionaler Override, `MAX_ONE_ENGAGEMENT_PER_WORKSITE_LOCAL_DATE`; PR #101 DO_NOT_MERGE; Migration-0019-Gate | Gate betrifft EasyTree-Repo, nicht den Prototyp |
| Confluence `49119274` Anti-Drift-Vertrag (06.09.2026) | HUMAN_PO_CONFIRMED | ja | D-001…D-009; Drift-Gate-Fragen 1–14; 08:00–18:00 nur als optionale Vorbelegung | keine |
| Confluence `9306113` Mehrtages-Baseline (06.09.2026) | CANONICAL_SUPPORTING | ja | Nutzerreise 1–15; Serienänderung mind. zwei Optionen; OQ-001 offen | keine |
| Confluence `47284236` Traceability-Matrix (06.09.2026) | RECONCILIATION_MAP | ja | Disposition älterer Seiten; `HUMAN_PO_VISUAL_GATE = FAIL_2026_09_06` für Single-Day-Create | keine |
| Confluence `8814623` Basisdesign v2.0, `8486960` Zwei-Client/Admin-Kalender, `38993921`, `47579138`, `48627716` | referenziert | **nein** (nicht gelesen) | — | MISSING: Designseiten könnten konkrete Layoutvorgaben enthalten; Tokens wurden stattdessen aus `packages/ui/src/basisdesign-v2.css` (EasyTree-Repo) übernommen |
| Jira EYT-120 (In Arbeit), EYT-121, EYT-122 (Zu erledigen, `BLOCKED_REQUIREMENT_OQ_001`), EYT-158 (In Arbeit, `PRODUCT_UI_NOT_ACCEPTED`), EYT-147/148/151/152/160/161 | live | ja (Status + Beschreibung) | Akzeptanzkriterien EYT-120 (Einsatz-Elternkontext, atomare Mehrtageserzeugung, Reload/zweiter Browser); EYT-121 Tagesbearbeitung; EYT-122 Serienänderung blockiert bis OQ-001 | keine |
| GitHub `DYAI2025/EasyTree` `master` @ `f8e96e4ceb4f00ae5f5ac777c6eb47aa8f766d6f` (2026-08-30) | Referenzprodukt | ja (Clone, read-only Discovery) | pnpm/Turbo-Monorepo; Next 16 + NestJS 11 + Supabase; **kein** WorksiteDay auf master; Kosten nur Stundensatz (`packages/domain/src/cost-position.ts`); keine Kunden-, Ressourcen-, Geo- oder Farbmodelle; Wochenliste statt Kalender | keine |
| GitHub `DYAI2025/EasyTree` `feat/eyt-147-dispositionswerkbank-slice-1` @ `191b605d3841aba3a47dad41a14a30c7fbb3cdcb` (PR #101, 2026-09-06) | DO_NOT_MERGE | ja (Diff gegen master) | Migration `20260901101624_0019_worksite_days.sql` (Identität + Revision), `planWorksiteDay`-Pfad, `apps/web/lib/wochenraster.ts` | Nicht Basis dieses Plans (Nutzerentscheidung 2026-09-07: Standalone) |
| Master-Prompt (Upload, 2026-09-07) | Auftrag | ja | Scope, AC-01…AC-14, Planungsvertrag | Widerspruch Ziel-Repo (EasyTree vs. easytree-prototype) → per Nutzerentscheidung aufgelöst: **Standalone** |
| Projektbeschreibung (Cowork-Projekt) | Auftrag | ja | „tägliche Kosten pro Mitarbeiter und Baustellentag“, Ressourcen pro Tag editierbar, Farbrahmen bei mehreren Einsätzen am Tag | Tagessatz vs. Produkt-Stundensatz → PROTOTYPE_ONLY-Entscheidung (Abschnitt 2) |

Repository (Ziel):
- URL/Identifier: `https://github.com/DYAI2025/easytree-prototype.git`
- Branch: `master`
- HEAD SHA: `5a3550fb543bbfbcc55c2c0c38b493ad31e43fd4` („Initial commit“)
- Working Tree Status: sauber; einzige Datei `Claude Fable 5.1 – EasyTree Prototype Planning Master Prompt.md`; lokaler Klon des Nutzers unter `~/Easytree-Prototype` identisch (Node v22.23.2 lokal vorhanden, pnpm nicht installiert → Runbook installiert via corepack)
- Relevante PR/Issue-Bezüge: keine PRs; Jira-Traceability nur referenziell (EYT-120/121/122), keine Jira-Transitionen durch diesen Plan.

---

## 2. Assumptions, missing information, open questions, blockers

### ASSUMPTION
- **A-01 Stack.** Next 16 App Router mit Route Handlers als API, Drizzle + PostgreSQL 17 in Docker, Vitest/Playwright. Begründung: gleiche Frontend-Generation wie `DYAI2025/EasyTree` (Next ^16.2, React ^19.2 verifiziert), spätere Übernahme von UI-Komponenten möglich; Docker beim Nutzer verfügbar (bestätigt 2026-09-07). Versionen: VERIFIED_RUNTIME_FACT via `npm view` am 2026-09-07 (Abschnitt 13); shadcn-CLI-Version nicht verifiziert (Task notiert die installierte Version).
- **A-02 Ein Demo-Mandant ohne Login.** Tabellen tragen `org_id`; alle Repositories filtern über einen serverseitigen `DemoTenantContext` (fest `ORG_DEMO`). Kein Auth, keine RLS. PROTOTYPE_ONLY; Struktur erlaubt spätere Mandantentrennung.
- **A-03 Kostenbasis = Tagessatz je Mitarbeiter/Ressource (EUR, Minor Units).** Grundlage: Projektbeschreibung des Nutzers („tägliche Kosten … pro Mitarbeiter und Baustellentag“). Das Produkt (`DYAI2025/EasyTree`) nutzt einen Stundensatz; PRD FR-020/OQ-014 lassen die Ableitung offen. Der Prototyp kennzeichnet Sätze als `PROTOTYPE_ONLY Demo-Tagessatz` und benennt die Einheit in der UI. Formel siehe Abschnitt 5.9.
- **A-04 Geocoding-Entwicklungsadapter = OSM Nominatim** (öffentliche Instanz, Usage-Policy: User-Agent Pflicht, ≤1 Anfrage/s, keine Autocomplete-Last) plus `manual`- und `fixture`-Adapter. Keine Produktentscheidung (OQ-013). Keine Kartenkachel-Einbindung im Browser; stattdessen Koordinatenanzeige + externer Link.
- **A-05 Revisionen ohne Publish.** Jede Tagesänderung erzeugt eine neue `worksite_day_configurations`-Revision (append-only, `superseded_at`), damit die Unveränderlichkeit veröffentlichter Historie strukturell möglich bleibt, obwohl Publish nicht gebaut wird.
- **A-06 Interim-Regel Serienänderung (bis OQ-001 entschieden):** Folgetage, deren aktuelle Revision `origin = 'day_edit'` hat, werden in der Vorschau als „individuell angepasst“ markiert und **standardmäßig ausgeschlossen**; sie können nur einzeln per Checkbox ausdrücklich einbezogen werden. Das ist die minimal-invasive, nicht-stille Variante (Kombination der EYT-122-Optionen 1+2) und im Code als `PROTOTYPE_ONLY / OQ-001` markiert.
- **A-07 Zeitregel.** „Aktueller lokaler Zeitpunkt“ = heutiges lokales Datum der Organisationszeitzone `Europe/Berlin` (Serverzeit). Ein Einsatz darf heute beginnen (FR-004), nicht davor. Tage vor heute sind im Kalender sichtbar und auswählbar, aber Mutationen werden serverseitig mit `422 DAY_IN_PAST_LOCKED` abgelehnt (OQ-002 offen).
- **A-08 Ressourcentypen** `vehicle | machine | equipment` mit Feldern `name`, `identifier` (frei, z. B. Kennzeichen/Inventarnummer), `active`, `daily_cost_minor_units?`. OQ-006 offen → Felder sind PROTOTYPE_ONLY; keine weiteren Typattribute.
- **A-09 Mitarbeiterprofil (MVP-relevant)** nur `display_name`, `role_label` (frei, PROTOTYPE_ONLY), `active`, `daily_cost_minor_units?`, `cost_note?`. Keine Vergütung, keine Historie.
- **A-10 Obergrenze** 366 materialisierte Tage je Einsatz-Erzeugung (Schutz vor Endlos-Materialisierung bei offenem Ende).

### MISSING
- **M-01** Confluence-Designseiten `8814623`/`8486960` nicht gelesen; Layout wird aus Tokens + Master-Prompt-UX-Bar abgeleitet.
- **M-02** Keine Screenshot-/Visual-Regression-Baseline existiert (leeres Repo) → Task 049 legt sie an; Baseline-Freigabe durch Menschen.
- **M-03** Kein Screenreader-Smoke durch Menschen (VoiceOver) automatisierbar → Runbook-Punkt, nicht Task-Akzeptanz.
- **M-04** pnpm auf dem Nutzer-Mac nicht installiert (verifiziert: nur node/npm/git im Session-VM) → Runbook `corepack enable`.

### OPEN QUESTION
- **OQ-P-01** Soll der Prototyp später in `DYAI2025/EasyTree` überführt werden? Falls ja: `src/domain` und `src/contracts` sind bewusst I/O-frei gehalten (portierbar), UI-Komponenten mit Tokens kompatibel.
- **OQ-P-02** Nominatim-Kontakt-E-Mail für den User-Agent (Policy) – wird per Env `GEOCODER_USER_AGENT` gesetzt, kein Default im Repo.

### BLOCKER
- keiner für den Gesamtplan. Einzelne blockierte Teilfeatures siehe HUMAN_INPUT_REQUIRED (sie sind aus den Tasks ausgeklammert, nicht still ersetzt).

### HUMAN_INPUT_REQUIRED
- **H-01 (OQ-001)** Endgültige Überschreibungsregel für individuell angepasste Folgetage bei Serienänderung. Interim: A-06.
- **H-02** Dritte Scope-Option `gesamter Einsatz / gesamte Zeitspanne` (Nutzerwunsch): von keiner SSoT freigegeben (FR-006 nennt nur zwei Optionen; frühere Tage wären rückwirkend → OQ-002). **Nicht geplant**; TASK-044 sieht die Option bewusst nicht vor. Freigabe + Semantik (inkl. Vergangenheit) nötig.
- **H-03 (OQ-014/FR-020)** Kostenbasis Tages- vs. Stundensatz für das Produkt. Prototyp: Tagessatz PROTOTYPE_ONLY (A-03).
- **H-04 (OQ-013)** Geo-Provider, Lizenz, Datenqualität, Kartenpreview. Prototyp: Nominatim-Dev-Adapter + Manual.
- **H-05 (OQ-006)** Pflichtattribute Fahrzeuge/Maschinen/Geräte. Prototyp: A-08.
- **H-06 (OQ-002)** Bearbeitung vergangener Tage/rückwirkende Korrektur. Prototyp: gesperrt mit Erklärung (A-07).
- **H-07** Einsatz-Verlängerung (D-007) ist im Master-Prompt nicht gefordert → nicht geplant; Datenmodell speichert die Ausgangskonfiguration (`engagements.initial_configuration`), sodass sie ohne Schemaänderung ergänzbar ist.

---

## 3. Requirements

Verifikationskürzel: U = Unit (Vitest node), C = Component (Vitest jsdom + RTL), I = Integration (Vitest + PostgreSQL), R = Route-Handler-Test, E = E2E (Playwright), X = axe/Keyboard/Visual.

| ID | Typ | Aussage | Produktquelle | PRD-ID | Verifikation | Dependencies | Risiko bei falscher Annahme |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-F-001 | F | Startseite `/` leitet auf `/planung?monat=<aktueller Monat>`; `/planung?monat=2026-09` zeigt den Monatskalender September 2026 (Mo-first, ISO-KW, 5/6 Zeilen). | Master-Prompt AC-01; PRD FR-014 | FR-014 | C, E (AC-01) | REQ-A-003 | Falscher Einstieg (Kosten) widerspricht FR-014 |
| REQ-F-002 | F | Jeder Kalendertag ist anklickbar (Maus/Tastatur): leerer Bereich → Einsatz-Anlage mit vorbelegtem Startdatum; Karte → Tagesbearbeitung. | Master-Prompt calendar | FR-014 | C, E | REQ-F-001 | — |
| REQ-F-003 | F | Auftraggeber: Liste, minimal anlegen (Name Pflicht, Kontakt/Notiz optional), bearbeiten; keine CRM-Felder. | PRD FR-002 | FR-002 | I, R, C, E (AC-02) | REQ-D-001 | CRM-Drift |
| REQ-F-004 | F | Baustelle: Name, Auftraggeber (Pflicht), Adresse (Pflicht), optional Koordinaten, Notizen; über Geocoder auflösbar oder manuell. | PRD FR-003; D-001 | FR-003 | I, R, C, E (AC-09) | REQ-F-003, REQ-A-006 | Zweite Ortswahrheit |
| REQ-F-005 | F | Einsatz anlegen: Baustelle, Leistungsziel/Titel, Beschreibung, `startDate` (Pflicht, ≥ heute), `endDate` optional, bei offenem Ende `planningHorizonDate` (Pflicht), Orientierungsfarbe, Team, Ressourcen, optionale geplante Arbeitszeit. | PRD FR-004/FR-005; 49119274 D-003…D-009 | FR-004, FR-005 | U, I, R, C, E (AC-02, AC-13) | REQ-D-002, REQ-D-003 | Rückwirkende Einsätze; Pflicht-Uhrzeiten (D-004 superseded) |
| REQ-F-006 | F | Mo–Fr im inklusiven Zeitraum/Horizont werden automatisch abgeleitet; Wochenenden/andere Tage per optionalem Override zu-/abwählbar; Anzahl effektiver Tage vor Bestätigung sichtbar. | 49119274 D-005/D-006 | FR-005 | U, C, E (AC-03) | REQ-F-005 | Manuelle Tag-für-Tag-Erfassung (HUMAN_PO_VISUAL FAIL) |
| REQ-F-007 | F | `Einsatz erzeugen` materialisiert Einsatz + alle effektiven Baustellentage atomar und idempotent (Header `Idempotency-Key`); je Tag genau eine Identität + Revision 1 mit materialisiertem Team/Ressourcen/Zeiten. | 49119274 D-009; FR-005 | FR-005, NFR-003 | I, R, E | REQ-D-002, REQ-A-004 | Teilwirkung, Doppelanlage |
| REQ-F-008 | F | Pro Baustelle und lokalem Tag höchstens ein Einsatzkontext (`409 WORKSITE_DAY_ALREADY_PLANNED`); parallele Einsätze an anderen Baustellen erlaubt. | 49119274 D-008 | FR-005 | I, R | REQ-D-002 | Firmenweite Sperre (falsch) |
| REQ-F-009 | F | Kalender zeigt je Baustellentag genau eine Karte (Titel + Baustelle + Team-Anzahl), nicht eine je Mitarbeiter; mehrere Einsätze am selben Tag untereinander mit je eigenem Farbrahmen. | PRD FR-014; 41484289 Inv. 9; Projektbeschreibung | FR-014 | U, C, E (AC-04) | REQ-F-001 | Mitarbeiterzentrierte Drift |
| REQ-F-010 | F | Mehrtägige Einsätze werden pro Kalenderzeile als durchgehender Balken in der Einsatzfarbe dargestellt (Segmente über Zeilen-/Monatsgrenzen). Die Balken sind rein dekorativ (`aria-hidden`); die textuelle Zugänglichkeit trägt die Tageskarte, die auf jedem Tag des Einsatzes den Titel nennt. | Master-Prompt calendar; AC-06 | FR-014 | U, C, E (AC-06), X | REQ-F-009 | Color-only |
| REQ-F-011 | F | Orientierungsfarbe: 8 benannte Palettenwerte (Key, nicht Hex), pro Einsatz wählbar/änderbar; Kontrast Text/Rahmen ≥ 3:1 (UI-Komponenten) in Light/Dark. | Master-Prompt; PRD §11 („Farbe nachgeordnet“) | FR-014 | U, X | — | Farbe als Statuswahrheit |
| REQ-F-012 | F | Mitarbeitende: Liste, anlegen, bearbeiten (Name, Rollenbezeichnung, aktiv, Demo-Tagessatz optional); Navigation `Mitarbeitende` getrennt von `Ressourcen`. | PRD FR-007/FR-008; Glossar | FR-007 | I, R, C, E (AC-05) | REQ-D-004 | Vergütungs-/Payroll-Drift |
| REQ-F-013 | F | Ressourcen: Fahrzeuge/Maschinen/Geräte anlegen/bearbeiten (Typ, Name, Kennung, aktiv, Demo-Tagessatz optional). | PRD FR-008 (OQ-006 offen) | FR-008 | I, R, C, E (AC-05) | REQ-D-004 | Erfundene Produktionsattribute |
| REQ-F-014 | F | Team/Ressourcen sind je Einsatz (Ausgangskonfiguration) und je Baustellentag editierbar; Zuordnungen überleben Reload. | Projektbeschreibung; EYT-121 | FR-006, FR-007, FR-008 | I, E (AC-05, AC-11) | REQ-F-007 | — |
| REQ-F-015 | F | Tagesbearbeitung `nur dieser Tag`: neue Revision nur für den adressierten Tag; andere Tage unverändert; `expectedRevisionNo` (409 `STALE_REVISION`). | PRD FR-006; EYT-121 | FR-006 | U, I, R, C, E (AC-07) | REQ-D-002 | Stilles Überschreiben |
| REQ-F-016 | F | Serienänderung `dieser und folgende Tage dieses Einsatzes`: Vorschau (Zieltag-IDs, Status je Tag: unverändert / individuell angepasst→ausgeschlossen / einbezogen), explizite Bestätigung, atomar, auditiert. | PRD FR-006; 9306113 §8; EYT-122 | FR-006 | U, I, R, C, E (AC-08) | REQ-F-015, A-06 | OQ-001 still geschlossen |
| REQ-F-017 | F | Tage vor dem heutigen lokalen Datum sind sichtbar, aber Mutationen werden serverseitig abgelehnt (`422 DAY_IN_PAST_LOCKED`); UI erklärt den Grund. | PRD FR-004 (OQ-002) | FR-004 | I, R, C, E (AC-13) | REQ-A-005 | Rückwirkende Änderung |
| REQ-F-018 | F | Geocoding: Adresse suchen → Kandidatenliste → Auswahl speichert Adresse + Koordinaten + Quelle; Zustände: lädt / kein Treffer / Fehler / nicht konfiguriert; Manual-Fallback (Adresse + optionale Koordinaten). | Master-Prompt geolocation; PRD FR-003 | FR-003 | U, R, C, E (AC-09) | REQ-A-006, REQ-S-002 | Browser-Direktabhängigkeit |
| REQ-F-019 | F | Kostenübersicht je Einsatz (Drawer): Positionen je Tag × Mitarbeiter/Ressource, Zwischensummen je Tag, je Mitarbeiter, je Ressource, Gesamtsumme; fehlende Grundlagen als `fehlt` mit Zähler; Gesamtsumme dann als „unvollständig“ markiert. | Master-Prompt costs; PRD FR-020 | FR-020 | U, I, R, C, E (AC-10) | REQ-D-004, A-03 | Erfundene 0-Kosten |
| REQ-F-020 | F | Kostenzugang von der Tageskarte/Tagesbearbeitung und aus der Einsatzansicht; nie Startseite. | PRD §11/§12 | FR-014, FR-020 | C, E | REQ-F-019 | Kosten als Startfläche |
| REQ-NF-001 | NF | Reload und zweiter Browserkontext zeigen dieselben IDs/Zustände (Serverwahrheit; kein LocalStorage für fachliche Daten). | PRD NFR-006; AC-11/12 | NFR-006 | E (AC-11, AC-12), Grep-Guard | REQ-A-001 | Client-Wahrheit |
| REQ-NF-002 | NF | Tastaturbedienung, sichtbarer Fokus, sinnvolle Tab-Reihenfolge, Landmarks, `role=grid` mit Roving-Tabindex im Kalender, Drawer mit Fokusfalle + Rückgabe; axe (wcag2a/2aa) 0 Violations auf `/planung`, Drawer offen, Kosten, `/mitarbeitende`, `/ressourcen`, `/auftraggeber`. | PRD NFR-005; Master-Prompt UX-Bar | NFR-005 | C (axe jsdom), E+X (AC-14) | — | Nicht abnehmbar |
| REQ-NF-003 | NF | 320-px-Reflow ohne horizontales Scrollen (≈200 % Zoom), 375/768/1440 px geprüft; Touch-Ziele ≥ 44×44 px für Tageszellen-Aktionen; `prefers-reduced-motion` respektiert. | Master-Prompt UX-Bar | NFR-005 | E+X | — | — |
| REQ-NF-004 | NF | Status nie nur über Farbe: jede Karte trägt Text; Fehler/Warnung/Erfolg mit Icon + Text + `role=status/alert`. | PRD NFR-005 | NFR-005 | C, E | — | — |
| REQ-NF-005 | NF | Zeitrichtigkeit: lokale Geschäftsdaten als `YYYY-MM-DD`, Zeitzone `Europe/Berlin` serverseitig; Tests für Monats-/Jahres-/DST-Grenzen und Wochenenden. | PRD NFR-004 | NFR-004 | U (inkl. `TZ=Pacific/Kiritimati`) | — | Tagesverschiebung |
| REQ-NF-006 | NF | Lade-/Leer-/Fehler-/Erfolgszustände für Kalender, Formulare, Kosten, Geocoding sind implementiert und getestet. | Master-Prompt UX-Bar | — | C, E | — | — |
| REQ-NF-007 | NF | Lange Baustellen-/Kundennamen werden abgeschnitten (`text-overflow`), voller Text via `title` + `aria-label`; 6-Zeilen-Monat (z. B. 2026-08) und Monatswechsel funktionieren. | Master-Prompt UX-Bar | — | C, E, X | — | — |
| REQ-D-001 | D | Tabellen `organizations`, `customers`, `worksites`, `employees`, `resources` mit `org_id`; Fremdschlüssel tenantgebunden. | PRD FR-001 (Muster) | FR-001 | I (Schema-Test) | — | — |
| REQ-D-002 | D | `engagements` (start/end/horizon/colour/initial_configuration), `worksite_days` UNIQUE `(org_id, worksite_id, local_date)` + `engagement_id` NOT NULL, `worksite_day_configurations` (revision_no, origin, superseded_at; genau eine aktuelle je Tag), `day_team_members`, `day_resource_allocations`. | 41484289 B1; 49119274 T-001/T-002 | FR-005, FR-006 | I | REQ-D-001 | Identitätsverlust |
| REQ-D-003 | D | `idempotency_records` UNIQUE `(org_id, operation, key)` mit Fingerprint + gespeicherter Erstantwort. | PRD NFR-003 | NFR-003 | I | — | Doppelwirkung |
| REQ-D-004 | D | Kostengrundlage `daily_cost_minor_units bigint NULL` + `currency='EUR'` an `employees` und `resources`; NULL = fehlt. | A-03 | FR-020 | I, U | — | — |
| REQ-D-005 | D | `audit_events` (append-only) je Command: Akteur `demo-admin`, Operation, Subjekt, Payload, Correlation-ID. | PRD NFR-007 | NFR-007 | I | — | — |
| REQ-A-001 | A | Schichten: `src/domain` (pur) → `src/server` (commands/queries/db) → `src/app/api` (Route Handlers) → `src/ui`/`src/app` (React). Client ruft nur `/api/*` über einen typed Fetch-Client (`src/lib/api-client.ts`). | Master-Prompt architecture | NFR-006 | Lint-Regel (`no-restricted-imports`) | — | Client-Berechnung als Wahrheit |
| REQ-A-002 | A | Commands laufen in einer DB-Transaktion; Fehler → kein Teilzustand. | PRD NFR-003 | NFR-003 | I (Fehlerinjektion) | — | — |
| REQ-A-003 | A | Monatsabfrage liefert ein serverseitig berechnetes `MonthPlanningView` (Tage, Karten, Spans-Metadaten); UI rechnet nur Layout. | NFR-006 | NFR-006 | R, U | — | — |
| REQ-A-004 | A | Idempotenz: gleicher Key + gleicher Fingerprint → gespeicherte Erstantwort (201, keine Doppelwirkung); gleicher Key + anderer Fingerprint → `409 IDEMPOTENCY_KEY_REUSED`. | PRD NFR-003 | NFR-003 | I, R | REQ-D-003 | — |
| REQ-A-005 | A | `Clock`-Port (`now()`), in Tests injizierbar; Zeitregel ausschließlich serverseitig. | NFR-004 | NFR-004 | U, I | — | — |
| REQ-A-006 | A | `GeocoderPort { search(query): Promise<GeocodeResult> }` mit Adaptern `nominatim`, `manual`, `fixture`; Auswahl per Env `GEOCODER_PROVIDER`; Aufrufe nur serverseitig; Timeout 5 s; Throttle 1 req/s. | Master-Prompt geolocation; PRD FR-003 | FR-003 | U, R | — | — |
| REQ-S-001 | S | Keine Secrets im Repo/Client; `.env.example` enthält nur nicht-geheime Defaults; gitleaks-ähnlicher Check im CI (`git grep` auf Muster). | Master-Prompt security | NFR-007 | CI | — | — |
| REQ-S-002 | S | Eingabevalidierung aller Route Handler via Zod; Fehler als RFC-7807-Problem-JSON ohne Stacktrace; Logging ohne Adressdaten-Volltext (nur Query-Länge/Provider/Status). | Master-Prompt security | NFR-002/007 | R | — | — |
| REQ-O-001 | O | `GET /api/health` (DB-Ping) und `x-correlation-id` je Request (übernommen oder erzeugt, in Response gespiegelt). | PRD NFR-007 | NFR-007 | R | — | — |
| REQ-O-002 | O | Seed (`pnpm db:seed`) ist idempotent (feste UUIDs, `on conflict do nothing`/update) und erzeugt Abschnitt-12-Daten. | Master-Prompt seed | NFR-001 | I | — | — |

---

## 4. Current architecture facts

Ziel-Repository `DYAI2025/easytree-prototype` @ `5a3550f` (verifiziert 2026-09-07):
- Enthält genau eine Datei (`Claude Fable 5.1 – EasyTree Prototype Planning Master Prompt.md`). Keine `package.json`, keine Sourcen, keine CI, keine Migrationen, keine Tests. Alle Pfade in diesem Plan sind daher **neu zu erstellende** Pfade (Abschnitt 10 kennzeichnet `Create:`).
- Default-Branch `master`.

Referenzprodukt `DYAI2025/EasyTree` (nur als Evidenz für Begriffe, Tokens, Versionen; wird nicht verändert):
- `master` @ `f8e96e4` (30.08.2026): pnpm 10.28.0, Node 22, Next ^16.2.11, React ^19.2.8, Vitest ^4.1.10, Playwright ^1.61.1, TypeScript ^5.9.3, Zod ^4.4.3 (verifiziert aus `package.json`-Dateien).
- Design-Tokens: `packages/ui/src/basisdesign-v2.css` (63 Zeilen; Light/Dark `--eyt-*`: `bg-canvas #f6f4ef`, `bg-surface #ffffff`, `text-primary #1d1b18`, `text-secondary #5b564e`, `border-default #d8d4cb`, `action-primary #1e5231`, State-Tokens published/draft/danger/info).
- A11y-Checkliste `docs/runbooks/a11y-checklist.md` (Tastatur, Fokusreihenfolge, sichtbarer Fokus, 320-px-Reflow, Non-color-Status, Kontrast via axe im echten Browser, Screenreader-Smoke manuell).
- Kostenregel im Produkt: Stundensatz in Minor Units, BigInt, eine Rundungsstelle (`packages/domain/src/cost-position.ts`) — Vorbild für die Geldarithmetik.
- Kein Monatskalender, keine Kunden-/Ressourcen-/Geo-/Farbmodelle auf `master`; WorksiteDay-Fundament nur auf PR #101 (`191b605`, DO_NOT_MERGE).

---

## 5. Target prototype architecture

Verzeichnislayout (alle Pfade neu):

```
easytree-prototype/
├── .github/workflows/ci.yml
├── .nvmrc  .npmrc  .env.example  .gitignore  .prettierrc.json  eslint.config.mjs
├── package.json  pnpm-lock.yaml  tsconfig.json  next.config.ts  postcss.config.mjs
├── vitest.config.ts  playwright.config.ts  drizzle.config.ts  docker-compose.yml
├── docs/  (plans/, decisions/, runbooks/, evidence/)
├── drizzle/  (generierte SQL-Migrationen, meta/)
├── scripts/  (db-migrate.ts, db-seed.ts, db-reset.ts)
├── src/
│   ├── app/            Next App Router (layout, planung, mitarbeitende, ressourcen, auftraggeber, api/*)
│   ├── domain/         reine Fachlogik ohne I/O (local-date, workday-derivation, engagement-rules,
│   │                   month-grid, series-scope, cost-calculation, colour-palette, problem-codes)
│   ├── contracts/      Zod-Schemas + TS-Typen der API (Client+Server)
│   ├── server/         db/ (schema, client, migrate), tenant/, clock/, idempotency/, audit/,
│   │                   commands/, queries/, geocoding/, http/ (problem, handler)
│   ├── lib/            api-client.ts (typed fetch), utils
│   ├── ui/             primitives/ (Radix/shadcn-Muster), app-shell/, calendar/, engagement/, day/,
│   │                   cost/, master-data/, feedback/ (toast, banners, states)
│   └── styles/         tokens.css (EasyTree-Tokens), globals.css
├── tests/integration/  DB-gebundene Tests (Commands/Queries/Schema/Seed)
└── e2e/                Playwright-Specs, fixtures/, screenshots/ (Baselines)
```

### 5.1 Domain (`src/domain`, I/O-frei)
- `local-date.ts`: Typ `LocalDate = \`${number}-${number}-${number}\`` (Brand), `parseLocalDate`, `formatLocalDate`, `compareLocalDate`, `addDays`, `weekdayOf` (1=Mo…7=So), `isWeekend`, `isoWeekOf`, `monthOf`, `daysInMonth`, `localDateInZone(instant: Date, tz: string)` (via `Intl.DateTimeFormat` mit `timeZone`).
- `workday-derivation.ts`: `deriveDefaultWorkdays({start, end|horizon}) → LocalDate[]` (Mo–Fr inklusiv), `applyDayOverrides(defaults, {added, removed}) → LocalDate[]` (sortiert, dedupliziert, nur innerhalb Zeitraum), `MAX_DAYS_PER_MATERIALISATION = 366`.
- `engagement-rules.ts`: `validateEngagementPeriod(input, today) → Ok | ProblemCode[]` mit Codes `ENGAGEMENT_START_IN_PAST`, `ENGAGEMENT_END_BEFORE_START`, `PLANNING_HORIZON_REQUIRED`, `PLANNING_HORIZON_BEFORE_START`, `TOO_MANY_DAYS`, `NO_EFFECTIVE_DAYS`.
- `month-grid.ts`: `buildMonthGrid(month: 'YYYY-MM') → { weeks: { isoWeek, days: { date, inMonth }[] }[] }` (Mo-first, 5 oder 6 Zeilen, immer volle Wochen), `computeSpanSegments(weeks, engagements) → Segment[]` (je Zeile: `startCol`, `endCol`, `continuesLeft`, `continuesRight`, `engagementId`). **Definition:** Ein Segment umfasst nur lückenlos aufeinanderfolgende geplante Tage. `continuesRight` ist genau dann `true`, wenn der Tag unmittelbar rechts der Segmentkante — über die Zeilen-/Rastergrenze hinweg — ebenfalls ein geplanter Tag desselben Einsatzes ist; `continuesLeft` spiegelbildlich. Ein Wochenende ohne geplanten Tag ist damit eine Lücke, kein Übergang, `MAX_VISIBLE_CARDS_PER_DAY = 3`.
- `series-scope.ts`: `resolveSeriesTargets({days, fromDate, today, includeAdjustedIds}) → TargetRow[]` mit `status: 'unchanged' | 'adjusted_excluded' | 'adjusted_included' | 'past_locked'`.
- `cost-calculation.ts`: `calculateEngagementCosts(input) → CostOverview` (Abschnitt 5.9).
- `colour-palette.ts`: `COLOUR_KEYS = ['moos','ocker','himmel','ton','pflaume','petrol','schiefer','rose'] as const`, je Key `{ label, light: {frame, fill, text}, dark: {…} }`, `contrastRatio(a,b)` (WCAG-Formel) für Tests.
- `problem-codes.ts`: zentrale Union aller Fehlercodes + HTTP-Status-Mapping.

### 5.2 Persistence (`src/server/db`)
- `schema.ts` (Drizzle, Postgres): Tabellen aus Abschnitt 7. Migrationen generiert mit `drizzle-kit generate` nach `drizzle/`, angewendet mit `scripts/db-migrate.ts` (`drizzle-orm/postgres-js/migrator`).
- `client.ts`: `createDb(connectionString)` (postgres.js, `max: 10`), `withTransaction(db, fn)`.
- Zwei Datenbanken im Docker-Container: `easytree_prototype` (dev) und `easytree_prototype_test` (Integration-Tests; vor jedem Testlauf `truncate … cascade`).

### 5.3 Commands / Services (`src/server/commands`)
Signatur: `(deps: { db, tenant, clock, audit, idempotency }, input: ZodParsed) → Promise<Result>`; Fehler als `DomainProblem { code, status, detail, meta }` (geworfen, vom HTTP-Handler gemappt).
- `create-customer`, `update-customer`, `create-worksite`, `update-worksite`, `upsert-employee`, `upsert-resource`
- `create-engagement` (atomar: engagement + worksite_days + configurations rev 1 + team + resources; Idempotenz-Scope `create_engagement`)
- `update-worksite-day` (scope `ONLY_THIS_DAY`)
- `preview-series-change`, `apply-series-change` (scope `THIS_AND_FOLLOWING`)
- `set-engagement-colour`, `update-engagement-meta` (Titel/Beschreibung/Farbe; keine Zeitraumänderung — H-07)

### 5.4 API (Route Handlers, `src/app/api/**/route.ts`)
| Methode/Pfad | Zweck | Antwort |
| --- | --- | --- |
| `GET /api/health` | DB-Ping | `{ status: 'ok', db: 'ok' }` |
| `GET /api/planung/monat?monat=YYYY-MM` | `MonthPlanningView` | Tage + Karten + Spans + `today` |
| `GET/POST /api/auftraggeber`, `PATCH /api/auftraggeber/[id]` | Auftraggeber | DTOs |
| `GET/POST /api/baustellen`, `PATCH /api/baustellen/[id]` | Baustellen | DTOs |
| `GET/POST /api/mitarbeitende`, `PATCH /api/mitarbeitende/[id]` | Mitarbeitende | DTOs |
| `GET/POST /api/ressourcen`, `PATCH /api/ressourcen/[id]` | Ressourcen | DTOs |
| `POST /api/einsaetze` (Header `Idempotency-Key`) | Einsatz + Tage erzeugen | `201 EngagementCreated { engagementId, worksiteDayIds[] }` |
| `GET /api/einsaetze/[id]` / `PATCH /api/einsaetze/[id]` | Einsatzdetail / Titel+Farbe | DTO |
| `GET /api/einsaetze/[id]/kosten` | Kostenübersicht | `CostOverview` |
| `GET /api/baustellentage/[id]` | Tagesdetail (aktuelle Revision) | DTO |
| `POST /api/baustellentage/[id]/aenderungen/vorschau` | Serienvorschau | `SeriesPreview` |
| `POST /api/baustellentage/[id]/aenderungen` | Tages-/Serienänderung anwenden | `DayChangeResult { updatedDayIds[], newRevisions[] }` |
| `POST /api/geocoding/suche` | Adresssuche (serverseitig) | `GeocodeResult` |
Alle Antworten sind Zod-validiert (Response-Schemas in `src/contracts`), Fehler als `application/problem+json`.

### 5.5 Frontend (`src/app`, `src/ui`)
- Server Components laden Initialdaten über die Query-Schicht (kein Fetch gegen sich selbst); Client Components mutieren ausschließlich über `/api/*` und `router.refresh()`.
- Seiten: `/planung` (Kalender + Drawer), `/mitarbeitende`, `/ressourcen`, `/auftraggeber` (inkl. Baustellen des Auftraggebers).
- Kein `localStorage`/`sessionStorage`-Zugriff. Die Lint-Regel `no-restricted-globals` und der Architektur-Guard aus TASK-050 verbieten ihn in `src/ui/**` und `src/app/**` vollständig; Ansichtszustand steht in der URL (Abschnitt 5.6), Formularzustand im React-State der Drawer-Instanz.

### 5.6 Calendar State
- URL ist Zustand: `/planung?monat=2026-09&tag=2026-09-10&drawer=neu|tag|kosten&id=…`. Reload rekonstruiert Ansicht und geöffneten Drawer aus der URL.
- `MonthPlanningView` (Server) → `MonthGrid` (Client) berechnet nur Layout (Segmente) aus dem Domain-Modul.

### 5.7 Forms
- react-hook-form + `zodResolver` mit denselben Zod-Schemas wie der Server (`src/contracts`). Inline-Fehler unter dem Feld (`aria-describedby`, `aria-invalid`), Fehlerzusammenfassung oben mit Fokus (`role=alert`). Serverfehler (Problem-JSON) werden in Feld- oder Formularfehler gemappt (`meta.field`).
- Einsatz-Anlage als 3-Schritt-Drawer (Baustelle → Zeitraum & Tage → Team/Ressourcen/Übersicht) mit persistentem Formularzustand innerhalb der Drawer-Instanz (nur Speicher, kein LocalStorage).

### 5.8 Geocoder Adapter (`src/server/geocoding`)
- `geocoder.port.ts`: `interface GeocoderPort { readonly provider: 'nominatim'|'manual'|'fixture'; search(query: string, signal: AbortSignal): Promise<GeocodeCandidate[]> }`; `GeocodeCandidate { label, addressLine, postalCode, city, country, lat, lng, source }`.
- `nominatim.adapter.ts`: `GET {GEOCODER_BASE_URL}/search?q=…&format=jsonv2&addressdetails=1&limit=5&countrycodes=de` mit Header `User-Agent: ${GEOCODER_USER_AGENT}`; Timeout 5 s; Throttle 1 Anfrage/s (In-Memory-Token); Fehler → `GEOCODER_UNAVAILABLE` (503), leere Liste → `[]`.
- `manual.adapter.ts`: `search` wirft `GEOCODER_NOT_CONFIGURED` (422) — UI zeigt Manual-Pfad.
- `fixture.adapter.ts`: feste Kandidaten für bekannte Test-Queries. Freigabe **ausschließlich** über das explizite Flag `GEOCODER_ALLOW_FIXTURE=1`, **nicht** über `NODE_ENV` — `next start` erzwingt `NODE_ENV=production`, eine `NODE_ENV`-Prüfung würde den E2E-Lauf gegen den Produktionsbuild unmöglich machen.
- `geocoder.factory.ts`: liest `GEOCODER_PROVIDER` (Default `manual`), `GEOCODER_BASE_URL`, `GEOCODER_USER_AGENT` (Pflicht bei `nominatim`, sonst Startfehler mit klarer Meldung).

### 5.9 Cost Calculation Boundary (`src/domain/cost-calculation.ts`)
- Einheit: EUR Minor Units (`bigint`), keine Floats. Grundlage PROTOTYPE_ONLY: `daily_cost_minor_units` je Mitarbeiter/Ressource (Tagessatz je Baustellentag).
- Formel: `position(day, subject) = subject.dailyCost ?? MISSING`; `daySubtotal = Σ vorhandene Positionen`; `subjectSubtotal = Σ über Tage`; `total = Σ daySubtotals`; `missingCount = #MISSING`; `complete = missingCount === 0`. Geplante Uhrzeiten beeinflussen die Summe **nicht** (Tagessatz) — die Ansicht zeigt sie nur informativ.
- Eingabe = aktuelle Revision je Baustellentag (Server-Query `cost-overview.ts`), Ausgabe `CostOverview { engagementId, currency:'EUR', ruleVersion:'prototype-daily-rate-v1', days[], byEmployee[], byResource[], totalMinorUnits, missingCount, complete }`.

### 5.10 Seed / Demo Data (`scripts/db-seed.ts`)
- Feste UUIDs (v4-gültig, Präfix `a0000000-0000-4000-8000-…`), `insert … on conflict (id) do update` für Stammdaten, `do nothing` für Tage/Revisionen; Abschnitt 12.

### 5.11 Security Boundary
- Nur Server ruft Geocoder; Env-Validierung in `src/server/config.ts` (Zod) beim Start; `.env.example` ohne Werte; CI-Check auf Secrets-Muster; Problem-JSON ohne Stacktraces; Logging mit `pino`? — nein (YAGNI): `console.error` mit strukturiertem Objekt `{ correlationId, code }`, keine Nutzereingaben im Log-Volltext.

### 5.12 Error Handling
- `src/server/http/problem.ts`: `ProblemDocument { type: 'urn:easytree-prototype:problem:<code>', title, status, detail, correlationId, meta? }`.
- `src/server/http/handler.ts`: `defineRoute({ schema?, handler })` → Zod-Parse (400 `VALIDATION_FAILED`, `meta.issues`), `DomainProblem` → Status aus `problem-codes.ts`, unbekannt → 500 generisch; setzt `x-correlation-id`.
- UI: `StateBanner` (info/warning/danger/success) mit Icon + Text; Toast (Radix Toast) für Erfolg; Inline-Fehler in Formularen.

---

## 6. UX implementation specification

### 6.1 Informationsarchitektur
- Hauptnavigation (Header, `nav aria-label="Hauptnavigation"`): **Planung** (Start) · Mitarbeitende · Ressourcen · Auftraggeber. Skip-Link „Zum Hauptinhalt“ → `main#hauptinhalt`.
- Produktsprache: Auftraggeber, Baustelle, Einsatz, Baustellentag, Einsatzteam, Ressourcen, Arbeitszeit, Orientierungsfarbe, Tagessatz (Demo).

### 6.2 Hauptscreen `/planung`
- Layout Desktop (≥ 1024 px): Toolbar (Monat ‹ › „Heute“, Monatstitel `<h1>`, Primäraktion „Einsatz anlegen“) · darunter Kalender-Grid volle Breite. Drawer (rechts, 480 px, max 100 %) legt sich über den Kalender; Kalender bleibt links sichtbar (Drawer nicht fullscreen ab 1024 px).
- Tablet (768–1023 px): Drawer 100 % Breite als Sheet; Kalender im Hintergrund, Schließen kehrt zurück.
- Mobil (< 768 px): Kalender als kompaktes Grid (Tageszellen zeigen Farbpunkte + Zähler „2 Einsätze“, Karten in einer Tagesliste unter dem Grid nach Auswahl); Drawer fullscreen.

### 6.3 Kalender (`src/ui/calendar`)
- `role="grid"` mit `aria-labelledby` (Monatstitel), Zeilen `role="row"`; die **erste** Zelle jeder Zeile ist die Kalenderwoche als `role="rowheader"`, danach folgen sieben Tageszellen. Die Kopfzeile trägt entsprechend **acht** Zellen: eine leere `columnheader`-Zelle über der KW-Spalte (`aria-label="Kalenderwoche"`) und sieben Wochentags-`columnheader` (Mo…So). Im CSS-Grid ist die KW-Spalte Spalte 1, ein Segment mit `startCol = n` rendert also auf Grid-Spalte `n + 1`, Tageszellen `role="gridcell"` mit `aria-label="Donnerstag, 10. September 2026, 2 Einsätze"`, `aria-current="date"` für heute, Nachbarmonatstage gedämpft (`aria-disabled` nicht setzen – sie sind klickbar).
- Roving Tabindex: eine Zelle `tabindex=0`; Pfeiltasten bewegen, `Home/End` Zeilenanfang/-ende, `PageUp/PageDown` Monat, `Enter/Space` öffnet Tagesaktion (bei Karten-Fokus die Tagesbearbeitung, bei Zelle „Einsatz anlegen“ mit Datum).
- Karten je Baustellentag: linker Farbrahmen 4 px (Palettenwert), Titel (Einsatz), Zeile 2 Baustelle · „3 Personen · 2 Ressourcen“; `title`-Attribut mit Volltext; max 3 Karten, dann „+2 weitere“ (öffnet Tagesliste).
- Spans: Hintergrundbalken je Zeile über die Tage des Einsatzes (Farbe `fill`, Rahmen `frame`), Text nur im ersten Segment jeder Zeile, `continuesLeft/Right` als abgeschrägte Kante + `aria-hidden` (die Information steckt in den Karten).
- Vergangenheit (< heute): Zellen mit Schraffur-Muster + Text „gesperrt“ im Tooltip; Karten trotzdem öffnbar (read-only).

### 6.4 Create-Flow „Einsatz anlegen“ (Drawer, 3 Schritte, Fortschritt „Schritt 1 von 3“ als `nav aria-label="Schritte"`)
1. **Baustelle**: Auftraggeber (Combobox mit Suche; „Neuen Auftraggeber anlegen“ inline: Name, Kontakt, Notiz) → Baustelle (Combobox gefiltert nach Auftraggeber; „Neue Baustelle“ inline: Name, Adresssuche (6.8), Notiz).
2. **Zeitraum & Tage**: Titel/Leistungsziel (Pflicht), Beschreibung; Startdatum (Date-Input, Default = geklickter Tag oder heute), Ende: Radio „Enddatum“ (Date) | „Ende offen“ → „Planen bis“ (Date, Pflicht); Live-Zusammenfassung „12 Arbeitstage (Mo–Fr) · 0 Wochenendtage“; Disclosure „Tage anpassen (optional)“ zeigt Mini-Kalender des Zeitraums mit Checkboxen je Tag (Wochenenden vorab abgewählt); Checkbox „Geplante Arbeitszeit erfassen“ → Felder Beginn/Ende (Vorbelegung 08:00/18:00); Orientierungsfarbe: `radiogroup` mit 8 Swatches + Namen.
3. **Einsatzteam & Ressourcen**: zwei durchsuchbare Checkbox-Listen (aktive Mitarbeitende / Ressourcen gruppiert nach Typ), Übersichtskarte (Baustelle, Zeitraum, Tage, Team, Ressourcen, Farbe) → „Einsatz erzeugen“ (Primär). Bei Erfolg: Toast „Einsatz ‚…‘ mit 12 Baustellentagen angelegt“, Drawer schließt, Kalender aktualisiert, Fokus auf erster neuer Karte.
- Validierung inline pro Schritt; „Weiter“ blockiert bei Fehlern mit Fehlerzusammenfassung; Serverfehler: `409 WORKSITE_DAY_ALREADY_PLANNED` (Liste der Konflikttage), `422 ENGAGEMENT_START_IN_PAST`.

### 6.5 Day Edit (Drawer „Baustellentag“)
- Kopf: Datum (Wochentag, lang), Einsatz-Titel mit Farbmarker, Baustelle · Auftraggeber, Badge „Revision 3“ und ggf. Badge „individuell angepasst“ (Icon + Text).
- Abschnitte: Einsatzteam (Checkbox-Liste), Ressourcen (Checkbox-Liste), Geplante Arbeitszeit (optional, Beginn/Ende), Hinweis (Textarea).
- Fuß: `radiogroup` „Änderung anwenden auf“: **Nur dieser Tag** (Default) | **Dieser und folgende Tage dieses Einsatzes** → Button „Speichern“ bzw. „Vorschau anzeigen…“; sekundär „Kosten anzeigen“, „Abbrechen“.
- Vergangene Tage: Felder disabled, Banner (info) „Dieser Tag liegt vor dem heutigen Datum. Rückwirkende Änderungen sind noch nicht freigegeben (Produktentscheidung offen).“

### 6.6 Series Edit (Dialog „Serienänderung prüfen“)
- Tabelle: Datum · Status (Symbol + Text: „unverändert“, „individuell angepasst – ausgeschlossen“, „einbezogen“) · Checkbox „einbeziehen“ nur bei angepassten Tagen; Zusammenfassung „Team: +Anna, −Bernd · Ressourcen: +Hebebühne“; Zähler „7 Tage werden geändert, 2 ausgeschlossen“.
- Hinweisbanner: „Regel für bereits angepasste Tage ist eine Prototyp-Vorgabe (OQ-001 offen).“
- Bestätigen-Button erst aktiv nach Laden der Vorschau; Ergebnis-Toast; Kalender aktualisiert.

### 6.7 Mitarbeiter/Ressourcen-Auswahl
- Checkbox-Listen mit Suchfeld (`aria-controls`), Gruppenüberschriften, Inaktive ausgeblendet, Zähler „3 ausgewählt“; Tastatur: Tab in Liste, Space toggelt.

### 6.8 Geolocation (Komponente `AddressSearch`)
- Textfeld „Adresse“ + Button „Adresse suchen“ (kein Autocomplete pro Tastendruck), Ergebnisliste als `listbox`, Auswahl setzt Adresse/PLZ/Ort/Koordinaten (read-only Anzeige, „Manuell bearbeiten“ öffnet Felder inkl. optional Lat/Lng), Status-Zeile: „Quelle: Nominatim (Entwicklungsadapter)“ / „manuell“. Zustände: lädt (Spinner + Text), 0 Treffer (Hinweis + Manual), Fehler (Banner + Manual), nicht konfiguriert (Banner „Kein Geocoding-Provider konfiguriert“ + Manual). Link „In OpenStreetMap öffnen“ (`target=_blank rel=noopener`).

### 6.9 Cost Drawer („Plan-Kosten (Demo)“)
- Kopf: Einsatz, Zeitraum, Gesamtsumme (groß) + Badge „vollständig“ / „unvollständig – 2 Grundlagen fehlen“ (Warn-Icon + Text).
- Tabs: **Nach Tag** (Tabelle Datum · Personen · Ressourcen · Zwischensumme) · **Nach Mitarbeiter** · **Nach Ressource**; Zellen mit fehlender Grundlage zeigen „fehlt“ (kein 0), Zeile mit Warn-Icon.
- Fußnote: „Demo-Tagessätze (PROTOTYPE_ONLY); keine Lohn- oder Buchhaltungsdaten. Regel `prototype-daily-rate-v1`.“

### 6.10 States (verbindlich pro Fläche)
| Fläche | Loading | Empty | Error | Success | Konflikt/Warnung |
| --- | --- | --- | --- | --- | --- |
| Kalender | Skeleton-Grid + `aria-busy` | „Keine Einsätze in diesem Monat“ + CTA | Banner + Retry | — | Vergangenheit schraffiert |
| Create-Drawer | Buttons disabled + Spinner-Text | Listen leer: „Noch keine Mitarbeitenden – jetzt anlegen“ (Link) | Inline + Zusammenfassung | Toast | 409-Tagesliste |
| Day-Drawer | Skeleton | — | Banner | Toast | Stale-Revision-Banner „Zwischenzeitlich geändert – neu laden“ |
| Kosten | Skeleton-Tabelle | „Keine Baustellentage“ | Banner | — | „unvollständig“ |
| Geocoding | Spinner-Text | „Keine Treffer“ | Banner | Ergebnis-Chip | „nicht konfiguriert“ |

### 6.11 Responsive
Breakpoints 375 / 768 / 1024 / 1440; Grid-Zellen min-height 96 px (Desktop), 64 px (Tablet), 44 px (Mobil); keine horizontalen Scrollbalken auf `body`; Tabellen in `overflow-x:auto`-Containern.

### 6.12 Accessibility (Testkriterien)
- Landmarks header/nav/main; ein `h1` je Seite; Drawer = Radix `Dialog` (Fokusfalle, `aria-labelledby`, Esc, Fokusrückgabe); Toasts `role=status`; Fehler `role=alert`; Fokusring 2 px `--eyt-action-primary` + 2 px Offset auf allen Interaktiven; Kontrast ≥ 4.5:1 Text, ≥ 3:1 UI; `prefers-reduced-motion` deaktiviert Drawer-Transition; Touch-Ziele ≥ 44 px.

### 6.13 Visual QA (Task 049)
Zwölf Screenshots (Playwright `toHaveScreenshot`, Chromium, `animations: 'disabled'`): (1–3) `/planung?monat=2026-09` in 1440/768/375; (4) `?monat=2026-08` (6 Kalenderzeilen); (5) 10.09.2026 mit zwei parallelen Einsätzen und dem langen Baustellennamen (deckt „mehrere überlappende Einsätze“ und „lange Namen“ als eigene Prüfansicht ab); (6) Drawer offen, Schritt 2, 1440 — Kalenderkontext daneben weiterhin sichtbar; (7) Tagesbearbeitung 1440; (8) Serienvorschau; (9) Kostenansicht im Zustand „unvollständig“; (10) Geocoding-Fehlerzustand; (11) Fokus auf einer Tageskarte nach Tab; (12) 320 px Reflow. Baselines werden nach menschlicher Sichtprüfung committet (kein automatisches `--update-snapshots` in CI).

---

## 7. Data model / contract impact

Bestehende Entities: keine (leeres Repo).

Neue Entities (Drizzle → PostgreSQL; alle mit `org_id uuid not null references organizations(id)`, `created_at timestamptz default now()`):

| Tabelle | Spalten (Auszug) | Constraints | Kennzeichnung |
| --- | --- | --- | --- |
| `organizations` | `id`, `name`, `time_zone text` | `time_zone` = `Europe/Berlin` (Seed) | — |
| `customers` | `id`, `name text not null`, `contact text`, `notes text`, `active bool default true` | `check (length(trim(name))>0)` | FR-002 |
| `worksites` | `id`, `customer_id → customers(id)`, `name`, `address_line`, `postal_code`, `city`, `country default 'DE'`, `lat double precision`, `lng double precision`, `geocode_source text check in ('manual','nominatim','fixture')`, `geocode_resolved_at`, `notes`, `active` | `check ((lat is null) = (lng is null))` | FR-003 |
| `employees` | `id`, `display_name`, `role_label text`, `active`, `daily_cost_minor_units bigint check (>=0)`, `currency text default 'EUR'`, `cost_note text` | — | `role_label`, Kosten = PROTOTYPE_ONLY |
| `resources` | `id`, `kind text check in ('vehicle','machine','equipment')`, `name`, `identifier text`, `active`, `daily_cost_minor_units`, `currency`, `cost_note` | — | Felder PROTOTYPE_ONLY (OQ-006) |
| `engagements` | `id`, `worksite_id → worksites`, `title`, `description`, `start_date date not null`, `end_date date`, `planning_horizon_date date`, `colour_key text check in (8 Keys)`, `planned_start_time time`, `planned_end_time time`, `initial_configuration jsonb not null` (`{employeeIds[], resourceIds[], plannedStart?, plannedEnd?}`), `updated_at` | `check (end_date is null or end_date >= start_date)`, `check (end_date is not null or planning_horizon_date is not null)` | Ausgangskonfiguration für H-07 |
| `worksite_days` | `id`, `worksite_id`, `engagement_id not null → engagements`, `local_date date not null` | `unique (org_id, worksite_id, local_date)`; `unique (org_id, engagement_id, local_date)` | D-008 |
| `worksite_day_configurations` | `id`, `worksite_day_id`, `revision_no int not null`, `origin text check in ('materialized','day_edit','series_edit')`, `planned_start_time`, `planned_end_time`, `note`, `superseded_at timestamptz`, `correlation_id` | `unique (worksite_day_id, revision_no)`; partial unique `(worksite_day_id) where superseded_at is null` | append-only; kein UPDATE außer `superseded_at` |
| `day_team_members` | `id`, `configuration_id`, `employee_id` | `unique (configuration_id, employee_id)` | Einplanung |
| `day_resource_allocations` | `id`, `configuration_id`, `resource_id` | `unique (configuration_id, resource_id)` | Einplanung |
| `idempotency_records` | `org_id`, `operation`, `idempotency_key`, `request_fingerprint text`, `response_status int`, `response_body jsonb` | `unique (org_id, operation, idempotency_key)` | NFR-003 |
| `audit_events` | `id`, `actor text`, `operation`, `subject_id uuid`, `payload jsonb`, `correlation_id`, `occurred_at` | append-only | NFR-007 |

Migrationen: `drizzle/0000_initial.sql` (alle Tabellen; eine Migration, da leeres Repo). Spätere Änderungen nur expandierend (neue Migrationsdatei).

API Contracts (`src/contracts/*.ts`, Zod 4): `CustomerSchema`, `CreateCustomerCommand`, `WorksiteSchema`, `CreateWorksiteCommand`, `EmployeeSchema`, `UpsertEmployeeCommand`, `ResourceSchema`, `UpsertResourceCommand`, `CreateEngagementCommand` (siehe TASK-024), `EngagementCreatedSchema`, `EngagementDetailSchema`, `MonthPlanningViewSchema`, `WorksiteDayDetailSchema`, `DayChangeCommand` (`scope: 'ONLY_THIS_DAY' | 'THIS_AND_FOLLOWING'`, `expectedRevisionNo`, `changes: { employeeIds?, resourceIds?, plannedStart?, plannedEnd?, note? }`, `includeAdjustedDayIds?: uuid[]`), `SeriesPreviewSchema`, `DayChangeResultSchema`, `CostOverviewSchema`, `GeocodeQuerySchema`, `GeocodeResultSchema`, `ProblemDocumentSchema`, `LocalDateSchema` (`/^\d{4}-\d{2}-\d{2}$/` + Kalenderprüfung), `MinorUnitsSchema` — **Wire-Format ist `string`**: `JSON.stringify` wirft bei `bigint`, deshalb trägt jedes DTO Minor Units als Dezimalstring, und `src/contracts/common.ts` stellt das Paar `toWire(bigint): string` / `fromWire(string): bigint` bereit. Die Domain rechnet mit `bigint`, die Grenze konvertiert. Drizzle-Spalten werden explizit als `bigint(..., { mode: "bigint" })` deklariert (Default wäre `number` und verlöre still Genauigkeit).

Validierung: Server = Quelle; Client nutzt dieselben Schemas für Inline-Validierung.

Revision/Persistence — **verbindliche Reihenfolge innerhalb der Transaktion**: (1) `select … for update` auf der `worksite_days`-Zeile, (2) `update worksite_day_configurations set superseded_at = now() where worksite_day_id = $1 and superseded_at is null`, (3) `insert` der neuen Revision. Die umgekehrte Reihenfolge verletzt den Partial-Unique-Index `(worksite_day_id) where superseded_at is null` und scheitert mit `23505` — Partial-Unique-Indizes sind in PostgreSQL keine Constraints und damit nicht `DEFERRABLE`. Serienänderung = dieselbe Dreierfolge je Zieltag in **einer** Transaktion, Zieltage nach ID aufsteigend gesperrt.

Demo-only Daten: Seed-Datensätze tragen `notes`/`cost_note` = `PROTOTYPE_ONLY Demo-Fixture`; Mitarbeiter-/Ressourcen-Sätze sind erfundene Demowerte (Abschnitt 12).

---

## 8. Options considered

| Entscheidung | Option A | Option B | Option C | Auswahl + Begründung |
| --- | --- | --- | --- | --- |
| **Ziel-Repository** | EasyTree-Repo, Branch auf PR #101 | **Standalone `easytree-prototype`** | Standalone + kopierte `@easytree/ui`/`domain` | **B** (Nutzerentscheidung 2026-09-07). Risiko (Drift zum Produkt) mitigiert durch I/O-freie Domain/Contracts, Produktsprache, Tokens-Übernahme; Auditbefund aus `DYAI2025/EasyTree/docs/audit` (früherer Clickdummy mit Browser-Geocoding) wird durch serverseitigen Adapter vermieden. |
| **Kalenderdarstellung** | Bibliothek (FullCalendar/react-big-calendar) | **Eigenes `role=grid` + Domain-Segmentberechnung** | Tabelle ohne Spans | **B**: Bibliotheken bringen eigene A11y-/Styling-Modelle und Event-Semantik (personenzentriert), Spans über Zeilen sind mit `computeSpanSegments` deterministisch testbar; Aufwand ~3 Tasks. |
| **Persistenz** | SQLite (better-sqlite3) | **PostgreSQL 17 + Drizzle** | Supabase (lokal) | **B**: Docker vorhanden, `date`/`jsonb`/Partial-Unique nativ, gleiche Engine-Major wie Produkt (17); Supabase-Stack wäre Overhead ohne Auth/RLS-Nutzung. |
| **API-Schicht** | NestJS-Backend separat | **Next Route Handlers + Command-Module** | Server Actions | **B**: kleinste robuste Variante mit echtem HTTP-Vertrag (Idempotency-Header, Problem-JSON, E2E gegen `/api`); Server Actions verstecken den Vertrag. |
| **Geo-Provider** | Google Places (Key) | **Nominatim Dev-Adapter + Manual + Fixture** | Kein Geocoding | **B**: keine Credentials nötig, Adaptervertrag erlaubt Wechsel; Policy (UA, 1 req/s, kein Autocomplete) eingehalten; OQ-013 bleibt offen. |
| **Kartenpreview** | Leaflet + OSM-Tiles im Browser | Server-Proxy Static Map | **Keine Karte, Koordinaten + externer Link** | **C**: Invariante 12 (keine unkontrollierte Browser-Provider-Abhängigkeit); A bricht sie, B ist Aufwand ohne Produktentscheidung. |
| **Cost calculation boundary** | Client-Berechnung | **Server-Query + Domain-Funktion, Ergebnis über API** | Persistierte Snapshots | **B**: eine Wahrheit (NFR-006), reproduzierbar (`ruleVersion`), Snapshots erst mit Publish sinnvoll (out-of-scope). |
| **Kostenbasis** | Stundensatz × geplante Zeit | **Tagessatz je Baustellentag (PROTOTYPE_ONLY)** | Beide Einheiten wählbar | **B**: Projektbeschreibung fordert Tageskosten; Uhrzeiten sind optional (D-004), womit A oft „fehlt“ ergäbe; C erfindet Produktsemantik (OQ-014). |
| **Serienänderungs-Handling** | Angepasste Folgetage überschreiben (mit Bestätigung) | **Standardmäßig ausschließen, einzeln einbeziehbar** | Nur unveränderte Tage, keine Einbeziehung | **B** (A-06): nicht-still, reversibel, deckt Optionen 1+2 aus EYT-122 ab; OQ-001 bleibt sichtbar offen. |
| **UI-Basis** | Plain CSS (wie EasyTree) | **Tailwind 4 + Radix/shadcn-Muster + EasyTree-Tokens** | Komplettes Komponentenframework (MUI) | **B**: schnell hochwertige, zugängliche Primitives (Dialog/Select/Checkbox/RadioGroup/Tabs/Toast), Code im Repo, Tokens bleiben kompatibel. |
| **Tests mit DB** | PGlite in-process | **Docker-Postgres Testdatenbank** | Mocks | **B**: eine Engine, echte Constraints (Partial Unique) werden getestet; CI via `services: postgres`. |

---

## 9. Implementation phases

| Phase | Inhalt | Tasks | Exit-Kriterium |
| --- | --- | --- | --- |
| 1 Evidence reconciliation + test baseline | Scaffold, Lint/Typecheck, Vitest-Projekte, Docker-Postgres + Drizzle, Tokens/AppShell, Playwright + CI | 001–005 | CI grün mit je einem Test pro Ebene |
| 2 Domain / persistence contracts | Local-Date, Werktagsableitung, Regeln, Palette, Kosten, Serien-Scope, Schema, Repositories, Idempotenz/Audit, Commands, Queries, Geocoder | 006–020 (013/017/018/019 mit lettered Inkrementen) | Integrationstests grün gegen Postgres |
| 3 API | Problem/Handler, Contracts, alle Route Handlers, Seed | 021–027 | Route-Tests grün; `pnpm db:seed` reproduzierbar |
| 4 Admin calendar vertical slice | Month-Grid-Modell, Grid-Komponente, Karten/Spans, Navigation + Seite, E2E AC-01/04/06 | 028–032 | September 2026 mit Seed sichtbar; axe 0 |
| 5 Einsatz create/edit | Drawer-Shell, 3 Schritte, Submit/Idempotenz, E2E AC-02/03/05/11/12/13 | 033–037 | Einsatz-Anlage end-to-end |
| 6 Mitarbeiter/Ressourcen/Auftraggeber | Verwaltungsseiten | 038–040 | CRUD über UI + Reload |
| 7 Geolocation | AddressSearch, E2E AC-09 | 041–042 | Success/No-result/Error/No-config |
| 8 Day/series editing | Day-Drawer, Serienvorschau, E2E AC-07/08 | 043–045 | Nur-Tag und Folgetage korrekt, angepasste Tage nie still |
| 9 Cost summary | Kosten-Drawer, E2E AC-10 | 046–047 | `fehlt` sichtbar, Summen korrekt |
| 10 Polish/accessibility/E2E/handoff | Tastatur-/Zoom-Audit, Visual-Baselines, Responsive/Reduced-Motion, Doku | 048–051 | Abschnitt 14 vollständig |

---

## 10. Executable tasks

**Konventionen für jede Task** — sie gelten für jede der folgenden Tasks und werden dort nicht wiederholt:

1. **Inspect zuerst.** Vor der ersten Zeile die Dateien lesen, die die Task anfasst oder benutzt (bei Task 001 stattdessen `git status`/`git log`). Was nicht gelesen wurde, wird nicht geändert.
2. **Failing test zuerst**, danach der rote Lauf, dessen Ausgabe im Commit-Text oder in der Evidenzdatei protokolliert wird. Ein Test, der beim ersten Lauf grün ist, beweist nichts und ist als Task-Schritt ungültig — Ausnahme sind die reinen Prüf-Tasks 032, 048 und 049, deren „rot“ der tatsächliche Befund ist.
3. **Kleinste korrekte Implementierung**, kein vorauseilender Ausbau.
4. **Fokussierter Lauf** (der Befehl unter *Validation*).
5. **Breitere Validierung vor jedem Commit:** zusätzlich `pnpm test`; bei Tasks, die Datenbank, Commands, Queries oder Routen berühren, außerdem `pnpm test:integration`; bei Tasks, die React-Komponenten oder Seiten anfassen, außerdem `pnpm build` (nur der Build zeigt Server-/Client-Boundary-Fehler, die jsdom nicht sieht). Diese drei Befehle stehen aus Platzgründen nicht in jeder einzelnen *Validation*-Zeile, sind aber Teil jeder Task.
6. **Commit** mit Präfix `chore:`, `feat:`, `test:`, `fix:` oder `docs:` und der Task-Nummer.

Alle Pfade sind neu (`Create:`), sofern nicht `Modify:` steht; Zeilennummern gibt es nicht, weil das Repository leer ist. Kein Commit auf `master`; Branch `feat/admin-planning-prototype`.

**Aufteilung großer Tasks.** Sieben Tasks sind bewusst als Task-*Familien* mit lettered Inkrementen geschrieben (013, 017, 018, 019, 023, 026, 027). Jedes Inkrement ist ein eigener TDD-Zyklus mit eigenem Commit und bleibt damit im Rahmen von 15–45 Minuten; die Task-Nummer bezeichnet das gemeinsame Ziel, nicht eine einzige Sitzung.

**Test-Kommandos (nach TASK-002 gültig):**
- fokussiert Unit/Component: `pnpm vitest run <pfad> -t "<name>"`
- **Namenskonvention (verbindlich):** Der oberste `describe`-Block jeder Integrationsdatei heißt exakt wie die Datei ohne Endung (`schema`, `idempotency`, `create-engagement`, …). Nur so trifft `pnpm test:integration -t "<name>"` — Vitests `-t` filtert Testnamen, nicht Dateipfade, und meldet bei einem Fehlgriff „no test files“ statt eines ehrlichen Fehlers.
- alle Unit/Component: `pnpm test`
- Integration (DB): `pnpm test:integration`
- E2E: `pnpm test:e2e`
- statisch: `pnpm lint && pnpm typecheck`

---

### Phase 1 — Evidence reconciliation + test baseline

### TASK-001: Repository-Skelett und Toolchain anlegen

Objective: Lauffähiges Next-16-Projekt mit TypeScript, ESLint, Prettier, pnpm, Node-Pin.
Requirement links: REQ-A-001, REQ-S-001

Files/modules:
- Create: `package.json`, `pnpm-workspace.yaml` (nur `onlyBuiltDependencies` falls nötig), `.nvmrc` (`22`), `.npmrc` (`engine-strict=true`), `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/styles/globals.css`
- Test: —

Steps:
1. Inspect: `git status`, `git log --oneline -1` (erwartet `5a3550f Initial commit`); `node -v` (erwartet v22.x); `corepack enable && pnpm -v`.
2. `git checkout -b feat/admin-planning-prototype`.
3. `pnpm init`; Abhängigkeiten exakt: `pnpm add next@16.3.4 react@19.2.8 react-dom@19.2.8` und `pnpm add -D typescript@5.9.3 @types/node @types/react @types/react-dom eslint@10 eslint-config-next@16.3.4 @eslint/eslintrc prettier@3.9.6`; `eslint.config.mjs` als Flat Config mit `FlatCompat` + `eslint-config-next`.
4. `package.json` Scripts anlegen: `dev`, `build`, `start`, `lint` (`eslint .` — `next lint` wurde in Next 16 entfernt), `typecheck` (`tsc --noEmit`), `format` (`prettier --check .`), `format:fix`.
5. `src/app/layout.tsx` mit `lang="de"`, `<title>EasyTree Prototyp</title>`, Import `../styles/globals.css`; `src/app/page.tsx` als Platzhalter.
6. `.env.example` mit leeren Schlüsseln: `DATABASE_URL=`, `GEOCODER_PROVIDER=manual`, `GEOCODER_BASE_URL=`, `GEOCODER_USER_AGENT=`.

Acceptance criteria:
- `pnpm typecheck` Exit 0.
- `pnpm lint` Exit 0.
- `pnpm build` Exit 0.
- `.env.example` enthält keine Geheimnisse; nicht-geheime Defaults (`GEOCODER_PROVIDER=manual`) sind erlaubt.

Validation:
- Command: `pnpm typecheck && pnpm lint && pnpm build`
- Expected result: Exit 0; Ausgabe enthält `Compiled successfully`.

Rollback note: `git checkout master && git branch -D feat/admin-planning-prototype`.

---

### TASK-002: Vitest-Projekte (node + jsdom) und erster Test

Objective: Zwei Testumgebungen mit einem beweisbar laufenden Test je Projekt.
Requirement links: REQ-NF-005

Files/modules:
- Create: `vitest.config.ts`, `vitest.setup.ts`, `src/domain/local-date.ts` (Stub), `src/domain/local-date.test.ts`
- Modify: `package.json` (Scripts `test`, `test:integration`)

Steps:
1. `pnpm add -D vitest@4 @vitest/coverage-v8 jsdom@30 @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom axe-core`.
2. `vitest.config.ts` mit `test.projects`: `domain` (environment `node`, include `src/domain/**/*.test.ts`, `src/server/**/*.test.ts`, `src/contracts/**/*.test.ts`, `src/*.test.ts` — die letzten beiden Globs sind nötig, sonst finden die Validierungsbefehle von TASK-022 und TASK-050 keine Testdatei und melden fälschlich Exit 1), `ui` (environment `jsdom`, include `src/ui/**/*.test.tsx`, `src/app/**/*.test.tsx`, setupFiles `vitest.setup.ts`), `integration` (environment `node`, include `tests/integration/**/*.test.ts`, `setupFiles: ["tests/integration/setup.ts"]` — die Datei entsteht in TASK-003).
3. Scripts: `"test": "vitest run --project domain --project ui"`, `"test:integration": "vitest run --project integration"`.
4. Write the failing test `src/domain/local-date.test.ts`:
   ```ts
   import { describe, expect, it } from "vitest";
   import { parseLocalDate } from "./local-date";

   describe("parseLocalDate", () => {
     it("akzeptiert ein gültiges lokales Datum", () => {
       expect(parseLocalDate("2026-09-07")).toBe("2026-09-07");
     });
     it("weist den 31. Februar zurück", () => {
       expect(() => parseLocalDate("2026-02-31")).toThrow(/ungültig/i);
     });
   });
   ```
5. Run test to verify it fails: `pnpm vitest run src/domain/local-date.test.ts`. Expected: FAIL (`parseLocalDate is not a function` oder Modul-Auflösungsfehler) — Ausgabe protokollieren.
6. Minimale Implementierung in `src/domain/local-date.ts` (nur `parseLocalDate` mit Regex + Kalenderprüfung über `Date.UTC`-Roundtrip).
7. Run: `pnpm vitest run src/domain/local-date.test.ts` → PASS.

Acceptance criteria:
- `pnpm vitest run --project domain` meldet 2 bestandene Tests. (`--project ui` hat bis TASK-004 keine Testdatei; `pnpm test` wird erst dort vollständig grün.)
- Ein absichtlich falscher Erwartungswert macht den Test rot (Gegenmutation einmal ausführen, dann zurücknehmen).

Validation:
- Command: `pnpm vitest run --project domain`
- Expected result: Exit 0, `2 passed`.

Rollback note: Dateien aus diesem Commit entfernen; TASK-001 bleibt gültig.

---

### TASK-003: PostgreSQL per Docker + Drizzle-Verbindung

Objective: Reproduzierbare lokale Datenbank und ein Verbindungs-Smoke-Test.
Requirement links: REQ-D-001, REQ-O-001

Files/modules:
- Create: `docker-compose.yml`, `drizzle.config.ts`, `src/server/db/client.ts`, `src/server/config.ts`, `src/server/config.test.ts`, `scripts/db-migrate.ts`, `tests/integration/db-connection.test.ts`, `tests/integration/setup.ts`
- Modify: `package.json` (`db:up`, `db:generate`, `db:migrate`, `db:reset`), `.env.example`

Steps:
1. `pnpm add drizzle-orm@0.45.2 postgres@3.4.9 zod@4.5.4` und `pnpm add -D drizzle-kit@0.31.10 tsx@4`.
2. `docker-compose.yml`: Service `db`, Image `postgres:17-alpine`, Port `55432:5432`, `POSTGRES_PASSWORD=easytree`, `POSTGRES_DB=easytree_prototype`, Volume `easytree_pg_data`, plus Init-SQL `create database easytree_prototype_test;` über `docker-entrypoint-initdb.d`.
3. `src/server/config.ts`: Zod-Schema für `DATABASE_URL` (URL, Pflicht), `DATABASE_URL_TEST` (optional), `GEOCODER_PROVIDER` (`enum`, Default `manual`), `GEOCODER_BASE_URL` (optional URL), `GEOCODER_USER_AGENT` (optional), `GEOCODER_ALLOW_FIXTURE` (optional), `EASYTREE_FIXED_TODAY` (optional, TASK-014); `loadServerConfig()` wirft mit klarer Meldung. Zugehöriger Unit-Test in `src/server/config.test.ts`.
   **Env-Zustellung (sonst scheitert alles außerhalb von Next):** `.env.local` liest nur Next selbst. Die `scripts/`-Einstiegspunkte laufen deshalb als `node --env-file=.env.local --import tsx scripts/<name>.ts`, und `tests/integration/setup.ts` lädt dieselbe Datei und verwendet `DATABASE_URL_TEST ?? DATABASE_URL`.
4. `scripts/db-migrate.ts`: eigener postgres.js-Client mit `max: 1` (Drizzle verlangt für Migrationen eine dedizierte Verbindung; ein Pool kann `__drizzle_migrations` inkonsistent hinterlassen), `migrate(db, { migrationsFolder: "./drizzle" })`, danach `client.end()`.
5. Write the failing tests: `tests/integration/db-connection.test.ts` (`select 1 as eins` liefert `1`) und `src/server/config.test.ts` (fehlende `DATABASE_URL` → Fehler nennt den Variablennamen).
6. Run: `pnpm test:integration` und `pnpm vitest run src/server/config.test.ts` → beide FAIL.
7. `src/server/db/client.ts` implementieren (`createDb` mit `max: 10`, `closeDb`, `withTransaction`).
8. `docker compose up -d db`; warten bis `pg_isready`; erneut ausführen → PASS.

Acceptance criteria:
- `docker compose up -d db` startet; `docker compose exec db pg_isready` meldet `accepting connections`.
- `pnpm test:integration` grün gegen `easytree_prototype_test`.
- Ohne `DATABASE_URL` bricht `loadServerConfig()` mit lesbarer Meldung ab (Unit-Test in `src/server/config.test.ts`).
- `scripts/db-migrate.ts` existiert und verwendet `max: 1`.

Validation:
- Command: `docker compose up -d db && sleep 5 && pnpm test:integration`
- Expected result: Exit 0, `1 passed`.

Rollback note: `docker compose down -v` entfernt Container und Volume.

---

### TASK-004: Tokens, Tailwind und AppShell

Objective: Designfundament mit EasyTree-Tokens und barrierefreier Shell.
Requirement links: REQ-NF-002, REQ-NF-004

Files/modules:
- Create: `postcss.config.mjs`, `src/styles/tokens.css`, `src/ui/app-shell/app-shell.tsx`, `src/ui/app-shell/app-shell.test.tsx`, `src/ui/primitives/button.tsx`, `src/ui/primitives/badge.tsx`
- Modify: `src/styles/globals.css`, `src/app/layout.tsx`

Steps:
1. `pnpm add -D tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3`; `pnpm add clsx tailwind-merge class-variance-authority lucide-react`.
2. `src/styles/tokens.css` anlegen mit den `--eyt-*`-Werten aus `DYAI2025/EasyTree@f8e96e4:packages/ui/src/basisdesign-v2.css` (Light: `bg-canvas #f6f4ef`, `bg-surface #ffffff`, `text-primary #1d1b18`, `text-secondary #5b564e`, `border-default #d8d4cb`, `action-primary #1e5231`, `action-primary-contrast #ffffff`, State published/draft/danger/info; Dark-Block unter `@media (prefers-color-scheme: dark)`), im Kopf der Datei Herkunftskommentar mit Repo + SHA.
3. `globals.css`: `@import "tailwindcss";` + `@theme inline` Mapping der `--eyt-*` auf Tailwind-Farbnamen; Fokusring-Utility `:focus-visible { outline: 2px solid var(--eyt-action-primary); outline-offset: 2px; }`; `@media (prefers-reduced-motion: reduce)` schaltet Transitions ab.
4. Write the failing test `src/ui/app-shell/app-shell.test.tsx`: Skip-Link ist erstes fokussierbares Element und zeigt auf `#hauptinhalt`; `header`/`nav`/`main` vorhanden; axe (jsdom, `color-contrast` deaktiviert) meldet 0 Violations.
5. Run: `pnpm vitest run src/ui/app-shell/app-shell.test.tsx` → FAIL.
6. `app-shell.tsx` implementieren: Skip-Link, `header`, `nav aria-label="Hauptnavigation"` mit vier Links, `main id="hauptinhalt"`.
7. Run → PASS; `layout.tsx` nutzt die Shell.

Acceptance criteria:
- Test prüft Skip-Link, Landmarks und axe-0.
- Tokens-Datei nennt Quelle und SHA.

Validation:
- Command: `pnpm vitest run src/ui/app-shell`
- Expected result: Exit 0, alle Assertions grün.

Rollback note: Shell aus `layout.tsx` entfernen.

---

### TASK-005: Playwright und CI-Workflow

Objective: E2E-Fundament plus grüne Pipeline.
Requirement links: REQ-NF-002, REQ-S-001

Files/modules:
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`, `.github/workflows/ci.yml`
- Modify: `package.json` (`test:e2e`)

Steps:
1. `pnpm add -D @playwright/test@1.63.0 @axe-core/playwright@4.13.0`; `pnpm exec playwright install --with-deps chromium`.
2. `playwright.config.ts`: `testDir: "./e2e"`, `use.baseURL` aus `PLAYWRIGHT_BASE_URL` (Default `http://127.0.0.1:3000`), Projekt `chromium`, `workers: 1` und `fullyParallel: false` (alle Specs teilen **eine** Datenbank; parallele Worker würden sich gegenseitig die Seed-Daten unter den Füßen wegtruncaten), `webServer` startet `pnpm build && pnpm start` (nur wenn `PLAYWRIGHT_BASE_URL` leer) mit `timeout: 300_000` (ein Next-Produktionsbuild überschreitet die Vorgabe von 60 s) und `reuseExistingServer: !process.env.CI`, `webServer.env` setzt `EASYTREE_FIXED_TODAY` (TASK-014), `expect.toHaveScreenshot.maxDiffPixelRatio: 0.01`, `use.reducedMotion: "reduce"`.
3. Write the failing test `e2e/smoke.spec.ts`: `/` antwortet, `main#hauptinhalt` existiert, Skip-Link ist erstes Tab-Ziel.
4. Run: `pnpm test:e2e` → FAIL, solange `/` die Shell nicht rendert; danach Implementierung minimal anpassen → PASS.
5. `.github/workflows/ci.yml` mit Jobs: `static` (`format`, `lint`, `typecheck`), `unit` (`pnpm test`), `integration` (Service `postgres:17` mit `DATABASE_URL`/`DATABASE_URL_TEST` als Job-`env`; eigener Schritt `psql -c 'create database easytree_prototype_test'`, weil `docker-entrypoint-initdb.d` bei GitHub-Actions-`services` nicht ausgeführt wird; ab TASK-013 zusätzlich `pnpm db:migrate` vor `pnpm test:integration`), `e2e` (Service `postgres:17` + `pnpm db:migrate && pnpm db:seed`, dann Build + Playwright + Artefakt-Upload; ohne Datenbank kann `/planung` ab TASK-030 nichts rendern), `secret-scan` (`if git grep -nE '(api[_-]?key|secret|password)\s*=\s*[^ ]' -- . ':!*.example'; then echo 'Treffer'; exit 1; fi` — `git grep` beendet sich bei **keinem** Treffer mit Exit 1, ein nacktes `git grep` würde den Job also genau dann rot machen, wenn das Repository sauber ist).

Acceptance criteria:
- `pnpm test:e2e` lokal grün.
- CI-Workflow läuft auf dem Feature-Branch grün (alle fünf Jobs).

Validation:
- Command: `pnpm test:e2e` lokal; danach `git push -u origin feat/admin-planning-prototype` und CI-Ergebnis prüfen.
- Expected result: `1 passed`; GitHub-Actions-Run grün.

Rollback note: Workflow-Datei entfernen; Branch bleibt lauffähig.

---

### Phase 2 — Domain / persistence contracts

### TASK-006: Local-Date-Modul vervollständigen

Objective: Vollständige, zeitzonensichere Datumsarithmetik ohne Bibliothek.
Requirement links: REQ-NF-005, REQ-A-005

Files/modules:
- Modify: `src/domain/local-date.ts`, `src/domain/local-date.test.ts`

Steps:
1. Write failing tests: `addDays("2026-02-28",1) === "2026-03-01"` (kein Schaltjahr) und `addDays("2028-02-28",1) === "2028-02-29"`; `weekdayOf("2026-09-07") === 1` (Montag); `isWeekend("2026-09-12") === true`; `isoWeekOf("2026-01-01")` und `isoWeekOf("2026-12-31")` gegen bekannte ISO-Werte; `monthOf`, `daysInMonth("2026-09") === 30`; `localDateInZone(new Date("2026-03-29T00:30:00Z"), "Europe/Berlin") === "2026-03-29"` (DST-Übergang); `localDateInZone(new Date("2026-09-07T22:30:00Z"), "Europe/Berlin") === "2026-09-08"`.
2. Run → FAIL.
3. Implementieren: alle Berechnungen über `Date.UTC` auf Mitternacht UTC; `localDateInZone` über `Intl.DateTimeFormat("en-CA", { timeZone, year, month, day })`.
4. Run fokussiert → PASS; danach `TZ=Pacific/Kiritimati pnpm vitest run src/domain/local-date.test.ts` und `TZ=Pacific/Niue …` → PASS (beweist Unabhängigkeit von der Prozesszeitzone).

Acceptance criteria:
- Alle genannten Fälle grün, auch unter zwei fremden Prozesszeitzonen.

Validation:
- Command: `pnpm vitest run src/domain/local-date.test.ts && TZ=Pacific/Kiritimati pnpm vitest run src/domain/local-date.test.ts && TZ=Pacific/Niue pnpm vitest run src/domain/local-date.test.ts`
- Expected result: dreimal Exit 0.

Rollback note: Modul ist reine Funktion; Rücknahme betrifft nur diese zwei Dateien.

---

### TASK-007: Werktagsableitung und Overrides

Objective: Mo–Fr automatisch, Wochenenden opt-in, Obergrenze.
Requirement links: REQ-F-006; Annahme A-10 (Obergrenze 366 Tage)

Files/modules:
- Create: `src/domain/workday-derivation.ts`, `src/domain/workday-derivation.test.ts`

Steps:
1. Write failing tests:
   - `deriveDefaultWorkdays({ start: "2026-09-07", end: "2026-09-18" })` → 10 Tage, keine `2026-09-12/13`, keine `2026-09-19`.
   - Einzeltag `start = end = "2026-09-12"` (Samstag) → `[]` (Default), da Wochenende nicht Default ist.
   - `applyDayOverrides(defaults, { added: ["2026-09-12"], removed: ["2026-09-09"] })` → sortiert, ohne `09-09`, mit `09-12`.
   - `added` außerhalb des Zeitraums → wirft `DAY_OUTSIDE_PERIOD`.
   - Zeitraum > 366 Tage → `deriveDefaultWorkdays` wirft `TOO_MANY_DAYS`.
2. Run → FAIL.
3. Implementieren (reine Funktionen, `Set` für Dedup, Sortierung lexikografisch = chronologisch bei ISO-Datum).
4. Run → PASS.

Acceptance criteria:
- Die fünf Fälle grün; Rückgabe ist immer aufsteigend sortiert und duplikatfrei.

Validation:
- Command: `pnpm vitest run src/domain/workday-derivation.test.ts`
- Expected result: Exit 0, 5 passed.

Rollback note: nur zwei neue Dateien.

---

### TASK-008: Einsatz-Regeln (Zeitraum, Horizont, Vergangenheit)

Objective: Serverseitige Zeit- und Zeitraumregeln als reine Funktion.
Requirement links: REQ-F-005, REQ-F-017, REQ-A-005

Files/modules:
- Create: `src/domain/engagement-rules.ts`, `src/domain/engagement-rules.test.ts`, `src/domain/problem-codes.ts`

Steps:
1. Write failing tests mit fixem `today = "2026-09-07"`:
   - Start `2026-09-06` → `ENGAGEMENT_START_IN_PAST`.
   - Start `2026-09-07` (heute) → gültig.
   - Ende `2026-09-05` bei Start `2026-09-07` → `ENGAGEMENT_END_BEFORE_START`.
   - Offenes Ende ohne Horizont → `PLANNING_HORIZON_REQUIRED`.
   - Horizont vor Start → `PLANNING_HORIZON_BEFORE_START`.
   - Effektive Tage leer (nur Wochenende, keine Overrides) → `NO_EFFECTIVE_DAYS`.
2. Run → FAIL.
3. `problem-codes.ts` mit Union + **vollständiger** Status-Map — jeder im Plan vorkommende Code muss darin stehen, sonst fällt er nach Abschnitt 5.12 auf ein generisches 500 zurück: `ENGAGEMENT_START_IN_PAST` → 422, `ENGAGEMENT_END_BEFORE_START` → 422, `PLANNING_HORIZON_REQUIRED` → 422, `PLANNING_HORIZON_BEFORE_START` → 422, `TOO_MANY_DAYS` → 422, `NO_EFFECTIVE_DAYS` → 422, `DAY_OUTSIDE_PERIOD` → 400, `WORKSITE_DAY_ALREADY_PLANNED` → 409, `STALE_REVISION` → 409, `IDEMPOTENCY_KEY_REUSED` → 409, `MISSING_IDEMPOTENCY_KEY` → 400, `DAY_IN_PAST_LOCKED` → 422, `VALIDATION_FAILED` → 400, `GEOCODER_UNAVAILABLE` → 503, `GEOCODER_NOT_CONFIGURED` → 422, `NOT_FOUND` → 404. Ein Test iteriert über die Union und stellt sicher, dass kein Code ohne Status bleibt.
4. `engagement-rules.ts` implementieren; `validateEngagementPeriod` gibt **alle** verletzten Codes zurück (nicht nur den ersten).
5. Run → PASS.

Acceptance criteria:
- Sechs Fälle grün; ein zusätzlicher Test beweist, dass **jeder** Code der Union einen Status hat (Vollständigkeit statt Stichprobe).

Validation:
- Command: `pnpm vitest run src/domain/engagement-rules.test.ts`
- Expected result: Exit 0, 6 passed.

Rollback note: reine Domain-Dateien.

---

### TASK-009: Monatsraster und Span-Segmente

Objective: Deterministisches Kalendermodell inklusive zeilenübergreifender Balken.
Requirement links: REQ-F-001, REQ-F-009, REQ-F-010, REQ-NF-007

Files/modules:
- Create: `src/domain/month-grid.ts`, `src/domain/month-grid.test.ts`

Steps:
1. Write failing tests:
   - `buildMonthGrid("2026-09")` → erste Zelle `2026-08-31` (Montag), letzte `2026-10-04`, 5 Zeilen, 35 Zellen, `inMonth` korrekt.
   - `buildMonthGrid("2026-08")` → 6 Zeilen, 42 Zellen (Beleg für den 5/6-Zeilen-Fall).
   - `computeSpanSegments` für einen Einsatz `2026-09-07`…`2026-09-18` (Mo–Fr, Wochenende nicht geplant): zwei Segmente (Zeile 2 Spalte 1–5, Zeile 3 Spalte 1–5) mit `continuesRight === false` und `continuesLeft === false` — der 12./13.09. sind keine geplanten Tage, also endet der Balken.
   - Derselbe Einsatz **mit** zugewähltem Samstag 12.09.: das Segment der Zeile 2 reicht bis Spalte 6 und trägt `continuesRight === false` (der Sonntag fehlt weiterhin).
   - Ein Einsatz mit sieben durchgehenden Tagen `2026-09-07`…`2026-09-13`: Zeile 2 Spalte 1–7 mit `continuesRight === false`, weil der 14.09. nicht mehr dazugehört; bei acht Tagen dagegen `continuesRight === true` in Zeile 2 und `continuesLeft === true` in Zeile 3.
   - Einsatz mit Tagen `Mo, Mi, Fr` derselben Woche → drei getrennte Segmente (Lücken erzeugen keine durchgehenden Balken).
   - Einsatz über Monatsgrenze (`2026-08-28`…`2026-09-02`) im Raster `2026-09` → Segment beginnt bei der Zelle `2026-08-31` mit `continuesLeft = true`.
2. Run → FAIL.
3. Implementieren; `MAX_VISIBLE_CARDS_PER_DAY = 3` exportieren.
4. Run → PASS.

Acceptance criteria:
- Sieben Fälle grün; Segmente sind je Zeile disjunkt und aufsteigend.

Validation:
- Command: `pnpm vitest run src/domain/month-grid.test.ts && pnpm test`
- Expected result: Exit 0, 7 passed; Regressionslauf grün.

Rollback note: reine Domain-Dateien.

---

### TASK-010: Farbpalette mit Kontrastnachweis

Objective: Acht Orientierungsfarben, die in Light und Dark die Kontrastschwelle halten.
Requirement links: REQ-F-011, REQ-NF-004

Files/modules:
- Create: `src/domain/colour-palette.ts`, `src/domain/colour-palette.test.ts`

Steps:
1. Write failing tests: Für jeden der acht Keys gilt in Light und Dark `contrastRatio(text, fill) >= 4.5` und `contrastRatio(frame, surface) >= 3.0`; `COLOUR_KEYS.length === 8`; unbekannter Key wirft.
2. Run → FAIL.
3. Palette implementieren (Werte iterativ anpassen, bis die Schwellen erfüllt sind — der Test ist die Quelle der Wahrheit, nicht das Auge).
4. Run → PASS.

Acceptance criteria:
- 8 Keys × 2 Modi × 2 Schwellen grün; kein Wert wird durch Absenken der Schwelle „grün gemacht“.

Validation:
- Command: `pnpm vitest run src/domain/colour-palette.test.ts`
- Expected result: Exit 0, alle Kontrastassertions grün.

Rollback note: reine Domain-Dateien.

---

### TASK-011: Kostenberechnung (Tagessatz, fehlende Grundlagen)

Objective: Reproduzierbare Summen ohne erfundene Nullwerte.
Requirement links: REQ-F-019, REQ-D-004

Files/modules:
- Create: `src/domain/cost-calculation.ts`, `src/domain/cost-calculation.test.ts`

Steps:
1. Write failing tests:
   - Zwei Tage × ein Mitarbeiter mit `dailyCost = 25000n` → `totalMinorUnits === 50000n`, `complete === true`.
   - Ein Mitarbeiter ohne Satz → dessen Positionen `missing: true`, `missingCount === Anzahl Tage`, `complete === false`, Gesamtsumme enthält ihn **nicht** und wird nicht als 0 gezählt.
   - Ressourcen werden getrennt aggregiert (`byResource`), Tagessummen enthalten Personal + Ressourcen.
   - Geplante Uhrzeiten verändern die Summe nicht (zwei identische Eingaben, eine mit Zeiten).
   - `ruleVersion === "prototype-daily-rate-v1"`.
2. Run → FAIL.
3. Implementieren mit `bigint`; keine Division, daher keine Rundung nötig — Kommentar im Code, warum (Tagessatz ist bereits ganzzahlig in Minor Units).
4. Run → PASS.

Acceptance criteria:
- Fünf Fälle grün; `missing` ist nie `0n`.

Validation:
- Command: `pnpm vitest run src/domain/cost-calculation.test.ts`
- Expected result: Exit 0, 5 passed.

Rollback note: reine Domain-Dateien.

---

### TASK-012: Serien-Scope-Auflösung (OQ-001-Interim)

Objective: Zielmenge einer Serienänderung inklusive Ausschluss individuell angepasster Tage.
Requirement links: REQ-F-016, A-06

Files/modules:
- Create: `src/domain/series-scope.ts`, `src/domain/series-scope.test.ts`

Steps:
1. Write failing tests mit `today = "2026-09-10"`, Tagesliste `09-07…09-18` und Startpunkt `09-10`:
   - Tage vor `09-10` sind nicht enthalten.
   - Tage vor `today` erhalten `status: "past_locked"` und sind nie Ziel.
   - Tag mit `origin: "day_edit"` → `adjusted_excluded`.
   - Derselbe Tag mit ID in `includeAdjustedIds` → `adjusted_included`.
   - Tag mit `origin: "materialized"` oder `"series_edit"` → `unchanged` (= wird geändert).
   - Rückgabe enthält für jeden Tag die ID (keine Zieltagsmenge ohne IDs).
2. Run → FAIL.
3. Implementieren; im Kopf der Datei Kommentar `PROTOTYPE_ONLY / OQ-001` mit Verweis auf EYT-122.
4. Run → PASS.

Acceptance criteria:
- Sechs Fälle grün; eine Gegenmutation („angepasste Tage doch einbeziehen“) macht mindestens einen Test rot.

Validation:
- Command: `pnpm vitest run src/domain/series-scope.test.ts`
- Expected result: Exit 0, 6 passed.

Rollback note: reine Domain-Dateien.

---

### TASK-013: Datenbankschema (Drizzle)

**Inkremente (je ein TDD-Zyklus und ein Commit):**
- **013a** Stammdaten: `organizations`, `customers`, `worksites`, `employees`, `resources` + deren CHECKs (`lat`/`lng`-Paarigkeit, nicht-negative Tagessätze).
- **013b** Planung: `engagements`, `worksite_days`, `worksite_day_configurations`, `day_team_members`, `day_resource_allocations` + UNIQUE, Partial-Unique und Zeitraum-CHECKs.
- **013c** Infrastruktur: `idempotency_records`, `audit_events`; danach einmal `pnpm db:generate` für die gemeinsame Migration `0000_initial.sql`.

Objective: Alle Tabellen aus Abschnitt 7 inklusive Constraints.
Requirement links: REQ-D-001, REQ-D-002, REQ-D-003, REQ-D-004, REQ-D-005

Files/modules:
- Create: `src/server/db/schema.ts`, `tests/integration/schema.test.ts`
- Create (generiert): `drizzle/0000_initial.sql`, `drizzle/meta/*`

Steps:
1. Write failing test `tests/integration/schema.test.ts`:
   - Zwei `worksite_days` mit gleicher `(org_id, worksite_id, local_date)` → Fehler `23505`.
   - Zwei nicht-abgelöste Konfigurationen für denselben Tag (`superseded_at is null`) → Fehler `23505` (Partial-Unique).
   - `engagements` mit `end_date < start_date` → `23514`.
   - `engagements` ohne `end_date` und ohne `planning_horizon_date` → `23514`.
   - `worksites` mit `lat` ohne `lng` → `23514`.
   - `employees.daily_cost_minor_units = -1` → `23514`.
2. Run: `pnpm test:integration` → FAIL (keine Tabellen).
3. `schema.ts` schreiben; `drizzle.config.ts` auf `./drizzle` zeigen lassen.
4. `pnpm db:generate` (`drizzle-kit generate`) und `pnpm db:migrate` gegen die Testdatenbank.
5. Run → PASS.

Acceptance criteria:
- Sechs Constraint-Verletzungen werden von der Datenbank abgewiesen (nicht nur vom Anwendungscode).
- Genau eine Migrationsdatei existiert.

Validation:
- Command: `pnpm db:generate && pnpm db:migrate && pnpm test:integration -t "schema"`
- Expected result: Exit 0, 6 passed.

Rollback note: `drizzle/0000_initial.sql` löschen und `docker compose down -v` (Prototyp hat keine Produktionsdaten).

---

### TASK-014: Tenant-Kontext, Clock und Correlation-ID

Objective: Injizierbare Querschnittsdienste.
Requirement links: REQ-A-005, REQ-O-001, REQ-D-001

Files/modules:
- Create: `src/server/tenant/tenant-context.ts`, `src/server/clock/clock.ts`, `src/server/clock/clock.test.ts`, `src/server/http/correlation.ts`
- Modify: `src/server/config.ts` (`EASYTREE_FIXED_TODAY`)

Steps:
1. Write failing test: `systemClock().todayLocal("Europe/Berlin")` entspricht `localDateInZone(new Date(), "Europe/Berlin")`; `fixedClock("2026-09-07T10:00:00Z").todayLocal("Europe/Berlin") === "2026-09-07"`; `fixedClock("2026-09-07T22:30:00Z").todayLocal("Europe/Berlin") === "2026-09-08"`.
2. Run → FAIL.
3. Implementieren; `DEMO_ORG_ID` als Konstante mit Kommentar `PROTOTYPE_ONLY: ein Mandant, keine Authentifizierung`; `resolveTenant()` liefert ihn serverseitig (nie aus dem Request).
4. **Zeitanker für Tests:** `serverClock()` liest `EASYTREE_FIXED_TODAY` (Format `YYYY-MM-DD`). Ist die Variable gesetzt, liefert `todayLocal()` diesen Wert; ist sie gesetzt **und** `NODE_ENV === "production"` ohne `EASYTREE_PROTOTYPE=1`, wirft der Start mit klarer Meldung ab. Ohne die Variable gilt die Systemzeit. Grund: Seed, Integrationstests und E2E müssen ein stabiles "heute" haben, sonst laufen die Akzeptanzszenarien nach wenigen Tagen in `ENGAGEMENT_START_IN_PAST` bzw. `DAY_IN_PAST_LOCKED`.
4. Run → PASS.

Acceptance criteria:
- Fünf Fälle grün (inklusive: `EASYTREE_FIXED_TODAY=2026-09-05` → `todayLocal() === "2026-09-05"`; gesetzt bei `NODE_ENV=production` ohne `EASYTREE_PROTOTYPE=1` → Startfehler); `resolveTenant` liest keinen Request-Parameter (Grep-Assertion im Test: Datei enthält kein `request`).

Validation:
- Command: `pnpm vitest run src/server/clock/clock.test.ts && pnpm test`
- Expected result: Exit 0, 5 passed; Regressionslauf grün.

Rollback note: nur neue Dateien.

---

### TASK-015: Idempotenz-Store

Objective: Erstantwort speichern, Replay ohne Doppelwirkung, Fingerprint-Konflikt.
Requirement links: REQ-A-004, REQ-D-003

Files/modules:
- Create: `src/server/idempotency/idempotency-store.ts`, `tests/integration/idempotency.test.ts`

Steps:
1. Write failing tests:
   - `remember` + `find` mit gleichem Key und gleichem Fingerprint liefert gespeicherte Antwort.
   - Gleicher Key, anderer Fingerprint → wirft `IDEMPOTENCY_KEY_REUSED`.
   - Zwei parallele `lock`-Aufrufe auf denselben Key serialisieren (zweiter wartet; Test mit zwei Transaktionen und `pg_advisory_xact_lock`).
   - Unterschiedliche `operation` mit gleichem Key kollidieren nicht.
2. Run → FAIL.
3. Implementieren: `lock(tx, operation, key)` via `select pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))` — `hashtextextended` nimmt **zwei** Argumente (Text und Seed) und liefert `bigint`, das `pg_advisory_xact_lock(bigint)` direkt annimmt; dann `find`, `remember`; Fingerprint = SHA-256 des kanonisierten Payloads (`node:crypto`).
4. Run → PASS.

Acceptance criteria:
- Vier Fälle grün, inklusive echtem Nebenläufigkeitstest.

Validation:
- Command: `pnpm test:integration -t "idempotency"`
- Expected result: Exit 0, 4 passed.

Rollback note: Tabelle bleibt; Modul entfernbar.

---

### TASK-016: Audit-Log

Objective: Jeder schreibende Command hinterlässt einen unveränderlichen Eintrag.
Requirement links: REQ-D-005

Files/modules:
- Create: `src/server/audit/audit-log.ts`, `tests/integration/audit.test.ts`

Steps:
1. Write failing test: `recordAudit(tx, {...})` schreibt eine Zeile mit `actor = "demo-admin"`, gesetzter `correlation_id` und `occurred_at`; ein `update` auf `audit_events` scheitert (kein Update-Pfad im Repository: Test prüft, dass das Modul keine Update-Funktion exportiert, und dass ein direkter `update` in der Anwendung nirgends vorkommt — `git grep -n "update(auditEvents)"` liefert nichts).
2. Run → FAIL.
3. Implementieren (nur `insert`).
4. Run → PASS.

Acceptance criteria:
- Eintrag vorhanden; kein Update-/Delete-Pfad im Code.

Validation:
- Command: `pnpm test:integration -t "audit"`
- Expected result: Exit 0.

Rollback note: nur neue Dateien.

---

### TASK-017: Stammdaten-Commands (Auftraggeber, Baustelle, Mitarbeitende, Ressourcen)

**Inkremente:** 017a Auftraggeber · 017b Baustelle · 017c Mitarbeitende · 017d Ressourcen. Jedes Inkrement bringt seine Zod-Schemas gleich mit nach `src/contracts/<entität>.ts` — TASK-022 vervollständigt danach nur noch die Planungs-, Kosten- und Geocoding-Verträge und die gemeinsamen Primitives. (Ohne diese Vorwegnahme würden die Commands hier gegen Schemas validieren, die es erst in TASK-022 gäbe.)

Objective: CRUD-Kern für Stammdaten mit Tenantbindung.
Requirement links: REQ-F-003, REQ-F-004, REQ-F-012, REQ-F-013

Files/modules:
- Create: `src/server/commands/create-customer.ts`, `update-customer.ts`, `create-worksite.ts`, `update-worksite.ts`, `upsert-employee.ts`, `upsert-resource.ts`, `tests/integration/master-data.test.ts`

Steps:
1. Write failing tests: Anlegen und Lesen je Entität; leerer Name → `VALIDATION_FAILED`; Baustelle mit unbekanntem `customerId` → `NOT_FOUND`; `lat` ohne `lng` → `VALIDATION_FAILED`; `org_id` wird immer aus dem Tenant-Kontext gesetzt (Test versucht, ein fremdes `orgId` im Input zu übergeben — das Feld existiert im Schema nicht).
2. Run → FAIL.
3. Implementieren; jeder Command in `withTransaction`, mit `recordAudit`.
4. Run → PASS.

Acceptance criteria:
- Alle Fälle grün; kein Command akzeptiert `orgId` als Eingabe.

Validation:
- Command: `pnpm test:integration -t "master-data"`
- Expected result: Exit 0.

Rollback note: Commands entfernbar, Schema bleibt.

---

### TASK-018: Command `create-engagement`

**Inkremente:** 018a Materialisierung (Fälle 1, 2, 8) · 018b Zeit- und Transaktionsregeln (Fälle 3, 9) · 018c Kardinalität `MAX_ONE_ENGAGEMENT_PER_WORKSITE_LOCAL_DATE` (Fälle 4, 5) · 018d Idempotenz (Fälle 6, 7).

Objective: Atomare, idempotente Erzeugung von Einsatz + Baustellentagen + Revision 1.
Requirement links: REQ-F-005, REQ-F-006, REQ-F-007, REQ-F-008, REQ-A-002, REQ-A-004

Files/modules:
- Create: `src/server/commands/create-engagement.ts`, `tests/integration/create-engagement.test.ts`

Steps:
1. Write failing tests:
   - Zeitraum `2026-09-07`…`2026-09-18` erzeugt 10 Baustellentage, je eine Konfiguration `revision_no = 1`, `origin = "materialized"`, mit dem Team und den Ressourcen der Ausgangskonfiguration.
   - Wochenend-Override `added: ["2026-09-12"]` → 11 Tage.
   - Start in der Vergangenheit (`fixedClock`) → `ENGAGEMENT_START_IN_PAST`, **keine** Zeile in `engagements` (Transaktionsbeweis).
   - Zweiter Einsatz an derselben Baustelle mit überlappendem Tag → `WORKSITE_DAY_ALREADY_PLANNED`; Fehlermeldung nennt die Konflikttage; erster Einsatz unverändert.
   - Zweiter Einsatz am selben Tag an **anderer** Baustelle → erfolgreich (D-008 als Baustellenregel, nicht Firmenregel).
   - Gleicher `Idempotency-Key` + gleicher Payload zweimal → identische Antwort, `select count(*) from engagements` bleibt 1.
   - Gleicher Key + anderer Payload → `IDEMPOTENCY_KEY_REUSED`, keine Mutation.
   - Offenes Ende mit Horizont `2026-09-30` → Tage bis 30.09., `end_date` bleibt `null`.
   - Fehlerinjektion nach dem Tageseinfügen (Test-Hook) → keine Zeile in `engagements`, `worksite_days`, `worksite_day_configurations`.
2. Run → FAIL.
3. Implementieren: eine Transaktion; Reihenfolge Idempotenz-Lock → Einsatz-Insert → Tage-Insert (`insert … values (…), (…)`) → Konfigurationen → Team/Ressourcen → Audit → `remember`.
4. Run → PASS.

Acceptance criteria:
- Neun Fälle grün, davon drei Negativfälle ohne Teilwirkung.

Validation:
- Command: `pnpm test:integration -t "create-engagement"`
- Expected result: Exit 0, 9 passed.

Rollback note: Command entfernbar; erzeugte Daten über `pnpm db:reset`.

---

### TASK-019: Commands `update-worksite-day`, `preview-series-change`, `apply-series-change`

**Inkremente:** 019a Tagesänderung inklusive Revisionsreihenfolge und `STALE_REVISION` (Fälle 1–3) · 019b Serienvorschau (Fall 4) · 019c Serienanwendung inklusive Schutz angepasster Tage und Atomarität (Fälle 5–7).

Objective: Tages- und Serienänderung als Revisionen, ohne stille Überschreibung.
Requirement links: REQ-F-015, REQ-F-016, REQ-F-017, REQ-A-002

Files/modules:
- Create: `src/server/commands/update-worksite-day.ts`, `preview-series-change.ts`, `apply-series-change.ts`, `tests/integration/day-change.test.ts`

Steps:
1. Write failing tests:
   - `ONLY_THIS_DAY`: neue Revision `2` mit `origin = "day_edit"`, alte Revision `superseded_at` gesetzt; **alle anderen Tage behalten `revision_no = 1`** (explizite Assertion über alle Tage des Einsatzes).
   - `expectedRevisionNo` veraltet → `STALE_REVISION`, keine neue Revision.
   - Tag vor `today` → `DAY_IN_PAST_LOCKED`, keine Mutation.
   - `preview-series-change` liefert für jeden Folgetag ID + Status; ein zuvor per `day_edit` geänderter Tag erscheint als `adjusted_excluded`.
   - `apply-series-change` ohne `includeAdjustedDayIds` ändert den angepassten Tag **nicht** (dessen `revision_no` bleibt), alle übrigen erhalten `origin = "series_edit"`.
   - Mit `includeAdjustedDayIds` wird auch dieser Tag geändert.
   - Fehler bei einem Zieltag → kein einziger Tag geändert (Transaktionsbeweis).
2. Run → FAIL.
3. Implementieren mit der Reihenfolge aus Abschnitt 7: `select … for update` (aufsteigende ID = deterministische Lock-Reihenfolge) → `update … set superseded_at = now() where superseded_at is null` → `insert` der neuen Revision. Ein Test deckt die Verletzung ab: wird zuerst eingefügt, meldet PostgreSQL `23505`.
4. Run → PASS.

Acceptance criteria:
- Sieben Fälle grün; Gegenmutation „angepasste Tage doch überschreiben“ macht Fall 5 rot; Gegenmutation „erst einfügen, dann ablösen“ macht Fall 1 mit `23505` rot.

Validation:
- Command: `pnpm test:integration -t "day-change"`
- Expected result: Exit 0, 7 passed.

Rollback note: Commands entfernbar; Revisionen sind append-only, kein Datenverlust.

---

### TASK-020: Queries (Monatsansicht, Einsatzdetail, Tagesdetail, Kosten)

Objective: Serverseitige Lesemodelle als einzige Quelle der UI.
Requirement links: REQ-A-003, REQ-F-009, REQ-F-019, REQ-NF-001

Files/modules:
- Create: `src/server/queries/month-planning-view.ts`, `engagement-detail.ts`, `worksite-day-detail.ts`, `cost-overview.ts`, `tests/integration/queries.test.ts`

Steps:
1. Write failing tests (Daten über die Commands aus TASK-018 anlegen):
   - `monthPlanningView("2026-09")` enthält für einen Einsatz mit drei Mitarbeitern **eine** Karte je Tag (nicht drei) — Assertion über `cards.length` je Tag.
   - Zwei Einsätze an unterschiedlichen Baustellen am selben Tag → zwei Karten mit unterschiedlichen `colourKey`.
   - Nachbarmonatstage sind enthalten (Rasterrand), aber `inMonth: false`.
   - `worksiteDayDetail` liefert nur die aktuelle Revision (`superseded_at is null`).
   - `costOverview` eines Einsatzes mit einem satzlosen Mitarbeiter → `complete: false`, `missingCount > 0`.
2. Run → FAIL.
3. Implementieren; `MonthPlanningView` enthält `today`, `month`, `weeks` (aus `buildMonthGrid`), `cards`, `spans` (aus `computeSpanSegments`).
4. Run → PASS.

Acceptance criteria:
- Fünf Fälle grün; die „eine Karte je Tag“-Assertion ist explizit und nicht implizit.

Validation:
- Command: `pnpm test:integration -t "queries"`
- Expected result: Exit 0, 5 passed.

Rollback note: nur Lesecode.

---

### Phase 3 — API

### TASK-021: Problem-JSON, Route-Helper, Health

Objective: Einheitlicher Fehler- und Antwortvertrag.
Requirement links: REQ-S-002, REQ-O-001

Files/modules:
- Create: `src/server/http/problem.ts`, `src/server/http/handler.ts`, `src/app/api/health/route.ts`, `src/server/http/handler.test.ts`

Steps:
1. Write failing tests: unbekannter Fehler → Status 500, Body ohne `stack`; `DomainProblem("ENGAGEMENT_START_IN_PAST")` → 422 mit `type` `urn:easytree-prototype:problem:ENGAGEMENT_START_IN_PAST`; ungültiger Body → 400 mit `meta.issues`; `x-correlation-id` aus dem Request wird gespiegelt, fehlt er, wird eine UUID erzeugt.
2. Run → FAIL.
3. Implementieren. `defineRoute` kapselt ausdrücklich die Next-16-Signatur: der zweite Handler-Parameter ist `{ params }: { params: Promise<Record<string, string>> }` (seit Next 15 asynchron), `defineRoute` awaitet ihn einmal und reicht ein einfaches Objekt an den Handler weiter — damit steht die Signatur an genau einer Stelle. `GET /api/health` prüft `select 1`.
4. Run → PASS.

Acceptance criteria:
- Vier Fälle grün; Response-Header `content-type: application/problem+json` bei Fehlern.

Validation:
- Command: `pnpm vitest run src/server/http/handler.test.ts`
- Expected result: Exit 0, 4 passed.

Rollback note: nur neue Dateien.

---

### TASK-022: Contracts (Zod) für alle Endpunkte

Objective: Ein Schemasatz für Server und Client.
Requirement links: REQ-S-002, REQ-A-001

Files/modules:
- Create: `src/contracts/common.ts`, `customers.ts`, `worksites.ts`, `employees.ts`, `resources.ts`, `engagements.ts`, `worksite-days.ts`, `costs.ts`, `geocoding.ts`, `index.ts`, `src/contracts/contracts.test.ts`

Steps:
1. Write failing tests: `LocalDateSchema` weist `2026-13-01` und `2026-02-31` ab; `MinorUnitsSchema` akzeptiert `"25000"` und liefert `bigint`, weist `"-1"` und `"1.5"` ab; `toWire(50000n) === "50000"` und `JSON.stringify({ total: toWire(50000n) })` wirft nicht; `CreateEngagementCommandSchema` verlangt `startDate`, erlaubt `endDate: null` nur zusammen mit `planningHorizonDate`; `DayChangeCommandSchema` verlangt `scope` und `expectedRevisionNo`.
2. Run → FAIL.
3. Implementieren; alle DTO-Typen via `z.infer` exportieren.
4. Run → PASS.

Acceptance criteria:
- Alle genannten Fälle grün; `src/contracts` importiert nichts aus `src/server`.

Validation:
- Command: `pnpm vitest run src/contracts/contracts.test.ts && pnpm lint`
- Expected result: Exit 0; Lint-Regel `no-restricted-imports` schlägt nicht an.

Rollback note: nur neue Dateien.

---

### TASK-023: Stammdaten-Endpunkte

**Inkremente:** 023a Auftraggeber · 023b Baustellen · 023c Mitarbeitende · 023d Ressourcen — je Entität beide Route-Dateien, fünf Testfälle, ein Commit.

Objective: `/api/auftraggeber`, `/api/baustellen`, `/api/mitarbeitende`, `/api/ressourcen`.
Requirement links: REQ-F-003, REQ-F-004, REQ-F-012, REQ-F-013

Files/modules:
- Create: `src/app/api/auftraggeber/route.ts`, `src/app/api/auftraggeber/[id]/route.ts`, dieselbe Struktur für `baustellen`, `mitarbeitende`, `ressourcen`; `tests/integration/api-master-data.test.ts`

Steps:
1. Write failing tests: `POST` liefert 201 mit ID; `GET` listet die angelegte Entität; `PATCH` ändert sie; ungültiger Body → 400 mit Problem-JSON; unbekannte ID → 404.
2. Run → FAIL.
3. Implementieren über `defineRoute` + Commands/Queries.
4. Run → PASS.

Acceptance criteria:
- Fünf Fälle je Entität grün (20 Assertionsgruppen).

Validation:
- Command: `pnpm test:integration -t "api-master-data"`
- Expected result: Exit 0.

Rollback note: Routen entfernbar.

---

### TASK-024: Endpunkt `POST /api/einsaetze` mit Idempotenz

Objective: Einsatzanlage über HTTP inklusive Header-Vertrag.
Requirement links: REQ-F-007, REQ-A-004

Files/modules:
- Create: `src/app/api/einsaetze/route.ts`, `src/app/api/einsaetze/[id]/route.ts`, `tests/integration/api-engagements.test.ts`

Steps:
1. Write failing tests: ohne `Idempotency-Key` → 400 `MISSING_IDEMPOTENCY_KEY`; mit Key → 201 und `{ engagementId, worksiteDayIds }`; Wiederholung mit gleichem Key/Payload → 201 mit identischem Body und unveränderter Anzahl in der Datenbank; gleicher Key + anderer Payload → 409; Startdatum in der Vergangenheit → 422; Baustellentag-Kollision → 409 mit `meta.conflictingDates`.
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Sechs Fälle grün.

Validation:
- Command: `pnpm test:integration -t "api-engagements"`
- Expected result: Exit 0, 6 passed.

Rollback note: Route entfernbar.

---

### TASK-025: Endpunkte Monatsansicht, Tagesdetail, Tagesänderung, Serienvorschau

Objective: Lese- und Schreibpfade der Planung über HTTP.
Requirement links: REQ-A-003, REQ-F-015, REQ-F-016

Files/modules:
- Create: `src/app/api/planung/monat/route.ts`, `src/app/api/baustellentage/[id]/route.ts`, `src/app/api/baustellentage/[id]/aenderungen/route.ts`, `src/app/api/baustellentage/[id]/aenderungen/vorschau/route.ts`, `tests/integration/api-planning.test.ts`

Steps:
1. Write failing tests: `GET /api/planung/monat?monat=2026-09` liefert schemakonforme `MonthPlanningView`; `monat=2026-13` → 400; Tagesänderung mit veralteter Revision → 409; Serienvorschau liefert Zieltage mit Status; Serienanwendung liefert `updatedDayIds`.
2. Run → FAIL.
3. Implementieren; Antworten mit `MonthPlanningViewSchema.parse` vor dem Senden validieren (Vertragstreue).
4. Run → PASS.

Acceptance criteria:
- Fünf Fälle grün; Response-Validierung ist aktiv (Test mit absichtlich falschem Feld schlägt fehl).

Validation:
- Command: `pnpm test:integration -t "api-planning"`
- Expected result: Exit 0, 5 passed.

Rollback note: Routen entfernbar.

---

### TASK-026: Geocoding-Adapter und Endpunkt

**Inkremente:** 026a Port + Nominatim-Adapter (Erfolg, leer, Fehler, Timeout) · 026b Manual- und Fixture-Adapter + Factory inklusive Flag-Prüfung · 026c Throttle + Route + Logging-Prüfung.

Objective: Serverseitiges, austauschbares Geocoding mit vollständigem Zustandsraum.
Requirement links: REQ-F-018, REQ-A-006, REQ-S-001

Files/modules:
- Create: `src/server/geocoding/geocoder.port.ts`, `nominatim.adapter.ts`, `manual.adapter.ts`, `fixture.adapter.ts`, `geocoder.factory.ts`, `src/server/geocoding/geocoder.test.ts`, `src/app/api/geocoding/suche/route.ts`

Steps:
1. Write failing tests (Fetch gemockt): Nominatim-Erfolg → normalisierte Kandidaten mit `source: "nominatim"`; leeres Ergebnis → `[]`; HTTP 500 → `GEOCODER_UNAVAILABLE`; Timeout → `GEOCODER_UNAVAILABLE`; Provider `manual` → `GEOCODER_NOT_CONFIGURED`; Factory ohne `GEOCODER_USER_AGENT` bei Provider `nominatim` → Startfehler; zwei Aufrufe binnen einer Sekunde → der zweite wird gedrosselt (Zeitmessung mit Fake-Timern); `GEOCODER_PROVIDER=fixture` ohne `GEOCODER_ALLOW_FIXTURE=1` → Startfehler (die Factory prüft das Flag, nicht `NODE_ENV`).
2. Run → FAIL.
3. Implementieren; im Adapter kein Logging der vollständigen Adresse (Test prüft, dass `console`-Aufrufe die Query nicht enthalten).
4. Run → PASS.

Acceptance criteria:
- Acht Fälle grün; kein Netzwerkzugriff aus Client-Code (Grep: `nominatim` kommt in `src/ui/**` und `src/app/**` außerhalb von `api/` nicht vor).

Validation:
- Command: `pnpm vitest run src/server/geocoding/geocoder.test.ts && ! git grep -n "nominatim" -- src/ui src/app | grep -v "src/app/api"`
- Expected result: Exit 0; zweiter Teil ohne Treffer.

Rollback note: Provider auf `manual` stellen; UI bleibt über den Manual-Pfad nutzbar.

---

### TASK-027: Seed-Skript

**Inkremente:** 027a `db-reset.ts` + Stammdaten (Auftraggeber, Baustellen, Mitarbeitende, Ressourcen) · 027b die vier Einsätze inklusive Wochenend-Override · 027c Idempotenznachweis (zweiter Lauf ändert nichts).

Objective: Reproduzierbare Demo-Daten laut Abschnitt 12.
Requirement links: REQ-O-002

Files/modules:
- Create: `scripts/db-seed.ts`, `scripts/db-reset.ts`, `tests/integration/seed.test.ts`
- Modify: `package.json`

Steps:
1. Write failing test: Nach zweimaligem `seed()` existieren genau 5 Mitarbeitende, 6 Ressourcen, 2 Auftraggeber, 4 Baustellen, 4 Einsätze und die erwartete Tagesanzahl; IDs sind zwischen den Läufen identisch.
2. Run → FAIL.
3. Implementieren: Stammdaten mit festen UUIDs und `on conflict (id) do update`; Einsätze über `createEngagement` mit festen Idempotenz-Schlüsseln (dadurch ist die Wiederholung per Konstruktion wirkungsfrei) und einer `fixedClock` auf `2026-09-01`.
4. Run → PASS.

Acceptance criteria:
- Zweimaliges Seeden ändert die Zeilenzahl nicht.

Validation:
- Command: `pnpm db:reset && pnpm db:seed && pnpm db:seed && pnpm test:integration -t "seed"`
- Expected result: Exit 0.

Rollback note: `pnpm db:reset`.

---

### Phase 4 — Admin calendar vertical slice

### TASK-028: Kalender-Grid-Komponente (Tastatur + Semantik)

**Inkremente:** 028a Struktur und ARIA (Grid, Header, `rowheader`, `aria-label`, `aria-current`) · 028b Roving Tabindex und Tastaturnavigation · 028c Aktions-Callbacks und axe.

Objective: Zugängliches Monatsraster ohne Datenanbindung.
Requirement links: REQ-F-001, REQ-F-002, REQ-NF-002

Files/modules:
- Create: `src/ui/calendar/month-grid.tsx`, `src/ui/calendar/month-grid.test.tsx`

Steps:
1. Write failing tests: `role="grid"` mit `aria-labelledby`; 8 `columnheader` (KW + Mo…So) und je Zeile ein `rowheader` mit der Kalenderwoche; Pfeiltasten überspringen die KW-Spalte; Tageszelle trägt `aria-label` mit vollem Datum; heute hat `aria-current="date"`; genau eine Zelle mit `tabindex="0"`; Pfeil rechts/unten bewegt den Fokus; `Home`/`End`; `PageUp`/`PageDown` lösen Monatswechsel-Callback aus; `Enter` auf leerer Zelle ruft `onCreateForDate` mit dem Datum; axe 0 Violations.
2. Run → FAIL.
3. Implementieren (Roving Tabindex über `useState` + `ref`-Map).
4. Run → PASS.

Acceptance criteria:
- Neun Assertionsgruppen grün.

Validation:
- Command: `pnpm vitest run src/ui/calendar/month-grid.test.tsx`
- Expected result: Exit 0.

Rollback note: Komponente entfernbar.

---

### TASK-029: Tageskarten und Farb-Spans

Objective: Genau eine Karte je Baustellentag, Balken über Zeilen, kein Color-only.
Requirement links: REQ-F-009, REQ-F-010, REQ-F-011, REQ-NF-004, REQ-NF-007

Files/modules:
- Create: `src/ui/calendar/day-card.tsx`, `src/ui/calendar/span-layer.tsx`, `src/ui/calendar/day-card.test.tsx`, `src/ui/calendar/span-layer.test.tsx`

Steps:
1. Write failing tests: Einsatz mit fünf Mitarbeitern rendert **eine** Karte mit Text „5 Personen“; Karte enthält immer Textlabel (kein reines Farbelement); langer Name wird per CSS gekürzt, `title` und `aria-label` tragen den Volltext; zwei Einsätze am selben Tag → zwei Karten untereinander mit unterschiedlichen Farbklassen; bei > 3 Karten erscheint „+n weitere“ als Button; `span-layer` rendert je Segment ein `aria-hidden`-Element mit korrekten Grid-Spalten.
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Sechs Fälle grün; Gegenmutation „eine Karte je Mitarbeiter“ macht Fall 1 rot.

Validation:
- Command: `pnpm vitest run src/ui/calendar`
- Expected result: Exit 0.

Rollback note: Komponenten entfernbar.

---

### TASK-030: Seite `/planung` mit Servertruth und URL-Zustand

Objective: Monatsansicht lädt echte Daten; URL ist der Zustand.
Requirement links: REQ-F-001, REQ-A-003, REQ-NF-001, REQ-NF-006

Files/modules:
- Create: `src/app/planung/page.tsx`, `src/app/planung/planungs-ansicht.tsx`, `src/ui/calendar/month-toolbar.tsx`, `src/lib/api-client.ts`
- Modify: `src/app/page.tsx` (Redirect auf `/planung?monat=<aktueller Monat>`)

Steps:
1. Inspect: `src/server/queries/month-planning-view.ts` (Rückgabeform).
2. Write failing tests: Component-Test der Toolbar (Vor/Zurück/Heute setzen den `monat`-Parameter korrekt, auch über Jahresgrenzen: `2026-12` → `2027-01`); Test, dass die Seite ohne `monat` auf den aktuellen Monat normalisiert; Empty-State-Text bei 0 Karten.
3. Run → FAIL.
4. Implementieren: Server Component ruft die Query direkt (kein Self-Fetch), Client-Teil erhält `MonthPlanningView` als Prop.
5. Run → PASS.

Acceptance criteria:
- Drei Fälle grün; `/` leitet auf `/planung?monat=…`.

Validation:
- Command: `pnpm vitest run src/ui/calendar/month-toolbar.test.tsx && pnpm build`
- Expected result: Exit 0.

Rollback note: Seite entfernbar.

---

### TASK-031: E2E AC-01, AC-04, AC-06

Objective: Kalenderdarstellung im echten Browser belegen.
Requirement links: REQ-F-001, REQ-F-009, REQ-F-010

Files/modules:
- Create: `e2e/kalender.spec.ts`, `e2e/fixtures/seed-helper.ts`

Steps:
1. Write failing tests:
   - AC-01: `/planung?monat=2026-09` zeigt Überschrift „September 2026“ und 35 Tageszellen.
   - AC-04: Der Seed-Einsatz mit drei Mitarbeitern erzeugt an seinem ersten Tag **eine** Karte (`getByTestId("tageskarte")` → count 1) und die Karte nennt „3 Personen“.
   - AC-06: Der mehrtägige Einsatz zeigt in Zeile 2 und Zeile 3 je ein Span-Segment mit derselben Farbklasse, und jede zugehörige Karte trägt den Einsatztitel als Text.
2. Run: `pnpm test:e2e -g "kalender"` → FAIL, solange der Seed nicht läuft.
3. `seed-helper.ts` als Playwright-`globalSetup`: **einmal** pro Lauf `db:reset` + `db:seed` über `execSync` (nicht je Spec-Datei — das würde bei mehreren Specs die Daten anderer Specs löschen).
4. Run → PASS.

Acceptance criteria:
- Drei Szenarien grün im echten Chromium.

Validation:
- Command: `pnpm db:reset && pnpm db:seed && pnpm test:e2e -g "kalender"`
- Expected result: Exit 0, 3 passed.

Rollback note: Spec entfernbar.

---

### TASK-032: Accessibility-Scan der Kalenderseite

Objective: axe-Nachweis im echten Browser.
Requirement links: REQ-NF-002

Files/modules:
- Create: `e2e/a11y.spec.ts`

Steps:
1. Write failing test: axe-Scan (`wcag2a`, `wcag2aa`) auf `/planung?monat=2026-09` → 0 Violations; vollständiger Tab-Durchlauf zeigt auf jedem Stopp einen sichtbaren Fokusindikator (`outline-width` oder `box-shadow` ≠ none).
2. Run → FAIL bei bestehenden Verstößen; Verstöße beheben (nicht die Regel abschalten).
3. Run → PASS.

Acceptance criteria:
- 0 Violations; jeder Tab-Stopp mit sichtbarem Fokus.

Validation:
- Command: `pnpm test:e2e -g "a11y"`
- Expected result: Exit 0, `violations: 0`.

Rollback note: keine.

---

### Phase 5 — Einsatz create/edit

### TASK-033: Drawer-Primitive (Radix Dialog)

Objective: Fokusfalle, Esc, Fokusrückgabe, Reduced Motion.
Requirement links: REQ-NF-002, REQ-NF-003

Files/modules:
- Create: `src/ui/primitives/drawer.tsx`, `src/ui/primitives/drawer.test.tsx`

Steps:
1. `pnpm add @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-checkbox @radix-ui/react-radio-group @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-popover`.
2. Write failing tests: Öffnen setzt den Fokus in den Drawer; Tab zyklisiert innerhalb; Esc schließt und gibt den Fokus an den Auslöser zurück; `aria-labelledby` zeigt auf die Überschrift; bei `prefers-reduced-motion` keine Transition-Klasse.
3. Run → FAIL.
4. Implementieren.
5. Run → PASS.

Acceptance criteria:
- Fünf Fälle grün.

Validation:
- Command: `pnpm vitest run src/ui/primitives/drawer.test.tsx`
- Expected result: Exit 0.

Rollback note: Primitive entfernbar.

---

### TASK-034: Einsatz-Drawer Schritt 1 (Auftraggeber + Baustelle)

Objective: Auswahl oder Inline-Anlage von Auftraggeber und Baustelle.
Requirement links: REQ-F-003, REQ-F-004, REQ-NF-006

Files/modules:
- Create: `src/ui/engagement/engagement-drawer.tsx`, `src/ui/engagement/step-worksite.tsx`, `src/ui/engagement/step-worksite.test.tsx`

Steps:
1. `pnpm add react-hook-form@7 @hookform/resolvers@5`.
2. Write failing tests: Baustellenliste ist nach gewähltem Auftraggeber gefiltert; „Weiter“ ohne Baustelle zeigt Inline-Fehler mit `aria-invalid` und Fokus auf dem Feld; Inline-Anlage eines Auftraggebers ruft die API und wählt ihn danach aus; Empty-State „Noch keine Auftraggeber“ mit CTA.
3. Run → FAIL.
4. Implementieren.
5. Run → PASS.

Acceptance criteria:
- Vier Fälle grün.

Validation:
- Command: `pnpm vitest run src/ui/engagement/step-worksite.test.tsx`
- Expected result: Exit 0.

Rollback note: Schritt entfernbar.

---

### TASK-035: Einsatz-Drawer Schritt 2 (Zeitraum, Tage, Farbe, optionale Zeiten)

Objective: Automatische Mo–Fr-Ableitung mit optionalem Override.
Requirement links: REQ-F-005, REQ-F-006, REQ-F-011

Files/modules:
- Create: `src/ui/engagement/step-period.tsx`, `src/ui/engagement/day-override-picker.tsx`, `src/ui/engagement/step-period.test.tsx`

Steps:
1. Write failing tests: Nach Eingabe `2026-09-07`/`2026-09-18` zeigt die Zusammenfassung „10 Arbeitstage“ **ohne** jede Interaktion mit dem Tagespicker (Beleg gegen den Drift „Kalender ist Pflichtschritt“); „Ende offen“ blendet „Planen bis“ ein und macht es zur Pflicht; Abwählen eines Werktags reduziert die Zahl auf 9; Zuwählen eines Samstags erhöht auf 11; ohne aktivierte Checkbox sind Beginn/Ende **nicht** im Formularzustand; nach Aktivierung stehen sie auf 08:00/18:00; die Farbauswahl ist eine `radiogroup` mit acht Optionen und Namen (nicht nur Farbflächen).
2. Run → FAIL.
3. Implementieren (Ableitung über `src/domain/workday-derivation.ts`).
4. Run → PASS.

Acceptance criteria:
- Sieben Fälle grün; Fall 1 ist der Anti-Drift-Beleg.

Validation:
- Command: `pnpm vitest run src/ui/engagement/step-period.test.tsx`
- Expected result: Exit 0, 7 passed.

Rollback note: Schritt entfernbar.

---

### TASK-036: Einsatz-Drawer Schritt 3 und Absenden

Objective: Team/Ressourcen wählen, Übersicht, idempotentes Absenden.
Requirement links: REQ-F-007, REQ-F-014, REQ-NF-006

Files/modules:
- Create: `src/ui/engagement/step-team.tsx`, `src/ui/engagement/engagement-summary.tsx`, `src/ui/engagement/step-team.test.tsx`, `src/ui/feedback/toast.tsx`

Steps:
1. Write failing tests: Suche filtert die Liste; Auswahlzähler stimmt; Übersicht zeigt Baustelle, Zeitraum, Tageszahl, Team, Ressourcen, Farbnamen; Absenden sendet genau einen `Idempotency-Key` (per `crypto.randomUUID()` beim Öffnen des Drawers erzeugt, nicht je Klick neu — Doppelklick erzeugt keinen zweiten Einsatz); Serverfehler 409 zeigt die Konflikttage im Banner.
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Fünf Fälle grün; Doppelklick-Test ist explizit.

Validation:
- Command: `pnpm vitest run src/ui/engagement/step-team.test.tsx`
- Expected result: Exit 0, 5 passed.

Rollback note: Schritt entfernbar.

---

### TASK-037: E2E AC-02, AC-03, AC-05, AC-11, AC-12, AC-13

Objective: Vollständige Einsatzanlage inklusive Persistenznachweis.
Requirement links: REQ-F-005, REQ-F-006, REQ-F-007, REQ-F-014, REQ-F-017, REQ-NF-001

Files/modules:
- Create: `e2e/einsatz-anlegen.spec.ts`

Steps:
1. Write failing tests:
   - AC-02/AC-03: Auftraggeber anlegen → Baustelle mit Adresse anlegen → Einsatz `2026-09-21`…`2026-10-02` → Zusammenfassung „10 Arbeitstage“ → erzeugen → Kalender zeigt Karten an genau diesen 10 Tagen und an keinem Wochenendtag.
   - AC-05: Zwei Mitarbeitende und zwei Ressourcen zuordnen; nach `page.reload()` sind sie im Tagesdrawer weiterhin gewählt.
   - AC-11: IDs aus der URL/`data-id` vor und nach Reload identisch.
   - AC-12: Zweiter Browserkontext (`browser.newContext()`) sieht denselben Einsatz mit derselben ID.
   - AC-13: Einsatz mit Start `2026-09-01` (Vergangenheit relativ zum Testdatum) → Fehlermeldung, kein neuer Einsatz im Kalender.
2. Run → FAIL.
3. Nur die Lücken schließen, die der rote Lauf konkret benennt: erwartet werden ausschließlich die Verdrahtung von Drawer-Erfolg → `router.refresh()`, das Setzen von `data-engagement-id` auf den Tageskarten und der Fehlerbanner für 422. Taucht ein weiterer Bedarf auf, wird er als eigene Task notiert, nicht hier miterledigt.
4. Run → PASS.

Acceptance criteria:
- Fünf Szenarien grün; keine über Schritt 3 hinausgehende Änderung im Diff.

Validation:
- Command: `pnpm db:reset && pnpm db:seed && pnpm test:e2e -g "einsatz-anlegen"`
- Expected result: Exit 0, 5 passed.

Rollback note: Spec entfernbar.

---

### Phase 6 — Stammdatenpflege

### TASK-038: Seite `/mitarbeitende`

Objective: Mitarbeitende anlegen und bearbeiten, inklusive Demo-Tagessatz.
Requirement links: REQ-F-012, REQ-D-004

Files/modules:
- Create: `src/app/mitarbeitende/page.tsx`, `src/ui/master-data/employee-form.tsx`, `src/ui/master-data/employee-form.test.tsx`

Steps:
1. Write failing tests: leerer Name → Inline-Fehler; Tagessatz-Feld akzeptiert „250,00“ und sendet `"25000"` Minor Units; leerer Tagessatz sendet `null` (nicht `0`); Feldbeschriftung nennt „Demo-Tagessatz (Prototyp)“.
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Vier Fälle grün; leerer Satz wird nie zu 0.

Validation:
- Command: `pnpm vitest run src/ui/master-data/employee-form.test.tsx`
- Expected result: Exit 0.

Rollback note: Seite entfernbar.

---

### TASK-039: Seite `/ressourcen`

Objective: Fahrzeuge, Maschinen, Geräte verwalten.
Requirement links: REQ-F-013

Files/modules:
- Create: `src/app/ressourcen/page.tsx`, `src/ui/master-data/resource-form.tsx`, `src/ui/master-data/resource-form.test.tsx`

Steps:
1. Write failing tests: Typauswahl hat genau drei Optionen mit deutschen Labels; Gruppierung der Liste nach Typ; Hinweis „Weitere Typattribute sind fachlich noch nicht definiert (OQ-006)“ ist sichtbar.
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Drei Fälle grün; Navigation trennt `Mitarbeitende` und `Ressourcen` (Test in `app-shell.test.tsx` ergänzen).

Validation:
- Command: `pnpm vitest run src/ui/master-data`
- Expected result: Exit 0.

Rollback note: Seite entfernbar.

---

### TASK-040: Seite `/auftraggeber` mit Baustellen

Objective: Auftraggeber und ihre Baustellen pflegen.
Requirement links: REQ-F-003, REQ-F-004

Files/modules:
- Create: `src/app/auftraggeber/page.tsx`, `src/ui/master-data/customer-panel.tsx`, `src/ui/master-data/customer-panel.test.tsx`

Steps:
1. Write failing tests: Auswahl eines Auftraggebers zeigt dessen Baustellen; „Neue Baustelle“ öffnet das Formular mit vorbelegtem Auftraggeber; keine CRM-Felder (Test prüft, dass Begriffe wie „Lead“, „Umsatz“, „Angebot“ nicht vorkommen).
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Drei Fälle grün; der Anti-CRM-Test ist explizit.

Validation:
- Command: `pnpm vitest run src/ui/master-data/customer-panel.test.tsx`
- Expected result: Exit 0.

Rollback note: Seite entfernbar.

---

### Phase 7 — Geolocation

### TASK-041: Komponente `AddressSearch`

Objective: Vollständiger Zustandsraum der Adresssuche.
Requirement links: REQ-F-018, REQ-NF-006

Files/modules:
- Create: `src/ui/master-data/address-search.tsx`, `src/ui/master-data/address-search.test.tsx`

Steps:
1. Write failing tests: Suche zeigt Ladezustand mit Text; Ergebnisliste ist `listbox` und per Pfeiltasten bedienbar; Auswahl füllt Adresse und zeigt Koordinaten plus Quelle; 0 Treffer zeigt Hinweis und Manual-Umschalter; Fehler zeigt Banner und Manual-Umschalter; `GEOCODER_NOT_CONFIGURED` zeigt einen eigenen Banner; Manual-Modus erlaubt Speichern ohne Koordinaten; Suche wird nicht bei jedem Tastendruck ausgelöst (nur auf Button/Enter).
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Acht Fälle grün; der „kein Autocomplete“-Test schützt die Nominatim-Policy.

Validation:
- Command: `pnpm vitest run src/ui/master-data/address-search.test.tsx`
- Expected result: Exit 0, 8 passed.

Rollback note: Komponente entfernbar; Formular fällt auf manuelle Eingabe zurück.

---

### TASK-042: E2E AC-09

Objective: Geocoding im Browser mit Erfolg und Ausfall belegen.
Requirement links: REQ-F-018

Files/modules:
- Create: `e2e/geocoding.spec.ts`

Steps:
1. `playwright.config.ts` `webServer.env` um `GEOCODER_PROVIDER=fixture` und `GEOCODER_ALLOW_FIXTURE=1` ergänzen.
2. Write failing tests: Mit `GEOCODER_PROVIDER=fixture` liefert die Suche „Potsdamer Straße“ Kandidaten, Auswahl speichert Koordinaten (nach Reload sichtbar); mit gemocktem Serverfehler (Route-Interception auf `/api/geocoding/suche`) erscheint der Fehlerbanner und der manuelle Pfad bleibt nutzbar.
3. Run → FAIL.
4. Implementieren/anpassen.
5. Run → PASS.

Acceptance criteria:
- Zwei Szenarien grün.

Validation:
- Command: `GEOCODER_PROVIDER=fixture GEOCODER_ALLOW_FIXTURE=1 pnpm test:e2e -g "geocoding"`
- Expected result: Exit 0, 2 passed.

Rollback note: Spec entfernbar.

---

### Phase 8 — Day/series editing

### TASK-043: Tagesbearbeitungs-Drawer

Objective: Tagesgenaue Änderung mit Revisions- und Vergangenheitsschutz.
Requirement links: REQ-F-015, REQ-F-017, REQ-F-014

Files/modules:
- Create: `src/ui/day/day-drawer.tsx`, `src/ui/day/day-drawer.test.tsx`

Steps:
1. Write failing tests: Kopf zeigt Datum, Einsatz, Baustelle, „Revision 1“; Team-/Ressourcenänderung aktiviert „Speichern“; Scope-Radiogroup hat zwei Optionen mit „Nur dieser Tag“ als Default; 409 `STALE_REVISION` zeigt Banner „Zwischenzeitlich geändert“ mit Neu-laden-Aktion; bei vergangenem Tag sind alle Felder `disabled` und der Info-Banner nennt den Grund.
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Fünf Fälle grün; die Radiogroup enthält **keine** dritte Option (H-02 nicht still eingeführt) — Test assertiert `options.length === 2`.

Validation:
- Command: `pnpm vitest run src/ui/day/day-drawer.test.tsx`
- Expected result: Exit 0, 5 passed.

Rollback note: Drawer entfernbar.

---

### TASK-044: Serienvorschau-Dialog

Objective: Zieltage sichtbar machen, angepasste Tage schützen.
Requirement links: REQ-F-016, A-06

Files/modules:
- Create: `src/ui/day/series-preview-dialog.tsx`, `src/ui/day/series-preview-dialog.test.tsx`

Steps:
1. Write failing tests: Tabelle listet alle Zieltage mit Datum und Statustext (nicht nur Farbe); angepasste Tage sind vorausgewählt **ausgeschlossen** und einzeln einbeziehbar; Zusammenfassung nennt die Änderungen im Klartext; „Übernehmen“ ist vor geladener Vorschau deaktiviert; der OQ-001-Hinweisbanner ist sichtbar; vergangene Tage erscheinen als `past_locked` und sind nicht einbeziehbar.
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Sechs Fälle grün.

Validation:
- Command: `pnpm vitest run src/ui/day/series-preview-dialog.test.tsx`
- Expected result: Exit 0, 6 passed.

Rollback note: Dialog entfernbar; Tagesbearbeitung bleibt nutzbar.

---

### TASK-045: E2E AC-07, AC-08

Objective: Tages- und Serienänderung im Browser belegen.
Requirement links: REQ-F-015, REQ-F-016

Files/modules:
- Create: `e2e/tagesbearbeitung.spec.ts`

Steps:
1. Write failing tests:
   - AC-07: Im Seed-Einsatz einen Mitarbeiter am 3. Tag entfernen, „Nur dieser Tag“ speichern; danach zeigen Tag 1, 2, 4 und 5 unverändert die ursprüngliche Teamgröße (Assertion über jede Karte), Tag 3 die reduzierte.
   - AC-08: An Tag 2 eine Serienänderung starten; die Vorschau listet Tag 2–10 mit IDs; der zuvor geänderte Tag 3 ist als „individuell angepasst – ausgeschlossen“ markiert; nach Übernehmen ist Tag 3 unverändert, Tag 4–10 geändert.
2. Run → FAIL.
3. Implementieren/anpassen.
4. Run → PASS.

Acceptance criteria:
- Zwei Szenarien grün; die „unverändert“-Assertion umfasst jeden nicht adressierten Tag einzeln.

Validation:
- Command: `pnpm db:reset && pnpm db:seed && pnpm test:e2e -g "tagesbearbeitung"`
- Expected result: Exit 0, 2 passed.

Rollback note: Spec entfernbar.

---

### Phase 9 — Cost summary

### TASK-046: Kosten-Drawer

Objective: Aufschlüsselung mit sichtbaren Lücken.
Requirement links: REQ-F-019, REQ-F-020, REQ-NF-004

Files/modules:
- Create: `src/ui/cost/cost-drawer.tsx`, `src/ui/cost/cost-drawer.test.tsx`

Steps:
1. Write failing tests: Drei Tabs (Tag/Mitarbeiter/Ressource); fehlende Grundlage rendert den Text „fehlt“ und ein Warnsymbol, **nicht** „0,00 €“; Kopf zeigt „unvollständig – 2 Grundlagen fehlen“; Summenzeile entspricht der Summe der angezeigten Positionen; Fußnote nennt `prototype-daily-rate-v1` und „Demo-Tagessätze“; Tabelle liegt in einem `overflow-x:auto`-Container.
2. Run → FAIL.
3. Implementieren.
4. Run → PASS.

Acceptance criteria:
- Sechs Fälle grün; ein Test sucht explizit nach dem String „0,00" in Zeilen mit fehlender Grundlage und erwartet **keinen** Treffer.

Validation:
- Command: `pnpm vitest run src/ui/cost/cost-drawer.test.tsx`
- Expected result: Exit 0, 6 passed.

Rollback note: Drawer entfernbar.

---

### TASK-047: E2E AC-10

Objective: Kostenansicht im Browser belegen.
Requirement links: REQ-F-019

Files/modules:
- Create: `e2e/kosten.spec.ts`

Steps:
1. Write failing tests: Über eine Tageskarte „Kosten anzeigen“ öffnen; der Seed-Einsatz mit vollständigen Sätzen zeigt eine Gesamtsumme, die der erwarteten Rechnung entspricht (im Test aus den Seed-Werten berechnet); der Seed-Einsatz mit einem satzlosen Mitarbeiter zeigt „fehlt“ und die Kennzeichnung „unvollständig“; die Kostenansicht ist nicht die Startseite (Navigation zu `/` landet auf `/planung`).
2. Run → FAIL.
3. Implementieren/anpassen.
4. Run → PASS.

Acceptance criteria:
- Drei Szenarien grün.

Validation:
- Command: `pnpm db:reset && pnpm db:seed && pnpm test:e2e -g "kosten"`
- Expected result: Exit 0, 3 passed.

Rollback note: Spec entfernbar.

---

### Phase 10 — Polish, Accessibility, Handoff

### TASK-048: Tastatur- und Zoom-Audit (AC-14)

Objective: Bedienbarkeit ohne Maus und bei 320 px belegen.
Requirement links: REQ-NF-002, REQ-NF-003

Files/modules:
- Create: `e2e/tastatur-zoom.spec.ts`
- Modify: betroffene Komponenten nach Befund

Steps:
1. Write failing tests: Einsatz vollständig per Tastatur anlegen (Tab/Pfeile/Enter/Space, kein `page.click`); bei Viewport 320×800 kein horizontales Scrollen auf `body` für `/planung`, Drawer offen und Kostenansicht; Tageszellen-Aktionsflächen ≥ 44 px bei 375 px Breite; axe-Scan auf `/mitarbeitende`, `/ressourcen`, `/auftraggeber`, bei geöffnetem Einsatz-Drawer **und bei geöffneter Kostenansicht** (REQ-NF-002 nennt sie ausdrücklich) → 0 Violations.
2. Run → FAIL; jeden Befund beheben, indem die Ursache behoben wird — eine axe-Regel abzuschalten oder eine Schwelle zu senken ist als Lösung ausgeschlossen und eine Stop-Bedingung nach Abschnitt 16.
3. Run → PASS.

Acceptance criteria:
- Fünf Szenarien grün (vier Flächen plus Kostenansicht) und im ersten kein einziger Mausklick.

Validation:
- Command: `pnpm test:e2e -g "tastatur"`
- Expected result: Exit 0.

Rollback note: keine.

---

### TASK-049: Visuelle Baselines

Objective: Reproduzierbare Screenshots der zwölf Prüfansichten.
Requirement links: REQ-NF-003, REQ-NF-007, M-02

Files/modules:
- Create: `e2e/visual.spec.ts`, `e2e/visual.spec.ts-snapshots/*` (nach menschlicher Sichtprüfung)

Steps:
1. Write failing test mit den zwölf Ansichten aus Abschnitt 6.13 (`toHaveScreenshot`, `animations: "disabled"`, feste Viewports).
2. Run → FAIL („snapshot missing“) — das ist der erwartete erste Fehlerzustand.
3. `pnpm test:e2e -g "visual" --update-snapshots` lokal ausführen, **jeden** erzeugten Screenshot ansehen und im Commit-Text bestätigen; erst dann committen.
4. Run erneut ohne Update → PASS.

Acceptance criteria:
- Zwölf Baselines im Repo; zweiter Lauf ohne Update grün; CI aktualisiert Baselines nie automatisch (kein `--update-snapshots` im Workflow).

Validation:
- Command: `pnpm test:e2e -g "visual"`
- Expected result: Exit 0, 12 passed.

Rollback note: Snapshot-Ordner löschen; Test schlägt dann bewusst fehl, bis neue Baselines freigegeben sind.

---

### TASK-050: Architektur-Guards und Dokumentation

Objective: Die Invarianten dieses Plans maschinell absichern.
Requirement links: REQ-A-001, REQ-NF-001, REQ-S-001

Files/modules:
- Create: `src/architecture.test.ts`, `docs/decisions/HUMAN_INPUT_REQUIRED.md`, `docs/runbooks/entwicklung.md`, `README.md`
- Modify: `eslint.config.mjs`

Steps:
1. Write failing tests in `src/architecture.test.ts` (Node-Projekt, liest Dateien):
   - Kein `localStorage`/`sessionStorage` in `src/ui/**` und `src/app/**`.
   - `src/domain/**` importiert nichts aus `src/server/**`, `src/app/**`, `next`, `drizzle-orm`, `postgres`.
   - `src/contracts/**` importiert nichts aus `src/server/**`.
   - Kein `fetch(` gegen externe Hosts außerhalb von `src/server/geocoding/**`.
   - Jede Datei unter `src/app/api/**/route.ts` verwendet `defineRoute`.
2. Run → FAIL bei Verstößen; beheben.
3. `eslint.config.mjs` um `no-restricted-imports` (gleiche Regeln) erweitern.
4. `HUMAN_INPUT_REQUIRED.md` mit H-01…H-07 aus Abschnitt 2; `README.md` mit Runbook-Kurzfassung; `docs/runbooks/entwicklung.md` mit Abschnitt 13.
5. Run → PASS.

Acceptance criteria:
- Fünf Guards grün; `HUMAN_INPUT_REQUIRED.md` listet alle sieben offenen Entscheidungen mit Quelle.

Validation:
- Command: `pnpm vitest run src/architecture.test.ts && pnpm lint`
- Expected result: Exit 0.

Rollback note: Guards entfernbar (nicht empfohlen).

---

### TASK-051: Abschlussverifikation und Übergabe

Objective: Vollständiger, belegter Endzustand.
Requirement links: alle

Files/modules:
- Create: `docs/evidence/2026-09-XX-prototype-abnahme/README.md` (Datum des Laufs)
- Modify: `docs/plans/2026-09-07-easytree-admin-planning-prototype.md` (Status auf `ready-for-review`)

Steps:
1. `pnpm db:reset && pnpm db:seed`.
2. `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` — jede Ausgabe (Zusammenfassungszeile) in die Evidenzdatei kopieren.
3. Screenshots aus TASK-049 verlinken; die Prüfmatrix aus Abschnitt 11 mit Ist-Ergebnissen füllen.
4. Push; CI-Run-URL in die Evidenzdatei eintragen.
5. Offene Punkte (H-01…H-07) im Übergabetext benennen.

Acceptance criteria:
- Sechs Befehle Exit 0; CI grün; Evidenzdatei enthält reale Ausgaben, keine Behauptungen.

Validation:
- Command: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e`
- Expected result: sechsmal Exit 0.

Rollback note: keine (nur Dokumentation).

---

## 11. Test matrix

| Feature | Unit (domain) | Component (jsdom) | Integration (DB/API) | E2E (Chromium) | Command / Evidenz |
| --- | --- | --- | --- | --- | --- |
| Lokale Daten, DST, Monats-/Jahresgrenzen | TASK-006 (inkl. zwei fremde TZ) | — | — | — | `TZ=… pnpm vitest run src/domain/local-date.test.ts` |
| Mo–Fr-Ableitung, Wochenend-Opt-in, Obergrenze | TASK-007 | TASK-035 | TASK-018 | AC-03 (TASK-037) | `pnpm test`, `pnpm test:integration -t "create-engagement"` |
| Zeitregel (Start heute erlaubt, gestern nicht) | TASK-008 | — | TASK-018 | AC-13 (TASK-037) | `pnpm test:integration -t "create-engagement"` |
| Monatsraster 5/6 Zeilen, Spans über Zeilen | TASK-009 | TASK-028/029 | TASK-020 | AC-01/AC-06 (TASK-031) | `pnpm test:e2e -g "kalender"` |
| Eine Karte je Baustellentag | TASK-009 | TASK-029 | TASK-020 | AC-04 (TASK-031) | `pnpm test:e2e -g "kalender"` |
| Farbe + Textredundanz, Kontrast | TASK-010 | TASK-029 | — | TASK-032/048 | `pnpm vitest run src/domain/colour-palette.test.ts` |
| Idempotenz (Replay, Key-Reuse) | — | TASK-036 (Doppelklick) | TASK-015/024 | — | `pnpm test:integration -t "idempotency"` |
| Atomarität (kein Teilzustand) | — | — | TASK-018/019 | — | `pnpm test:integration -t "create-engagement"` |
| Kardinalität je Baustelle/Tag | — | — | TASK-018 | — | `pnpm test:integration -t "create-engagement"` |
| Tagesänderung ohne Nebenwirkung | TASK-012 | TASK-043 | TASK-019 | AC-07 (TASK-045) | `pnpm test:e2e -g "tagesbearbeitung"` |
| Serienänderung mit Vorschau und Schutz | TASK-012 | TASK-044 | TASK-019 | AC-08 (TASK-045) | `pnpm test:e2e -g "tagesbearbeitung"` |
| Stale-Revision | — | TASK-043 | TASK-019 | — | `pnpm test:integration -t "day-change"` |
| Geocoder Erfolg/leer/Fehler/ohne Key/Throttle | TASK-026 | TASK-041 | — | AC-09 (TASK-042) | `pnpm test:e2e -g "geocoding"` |
| Kosten: Summen, `fehlt`, Einheit | TASK-011 | TASK-046 | TASK-020 | AC-10 (TASK-047) | `pnpm test:e2e -g "kosten"` |
| Persistenz: Reload, zweiter Browser | — | — | TASK-020 | AC-11/AC-12 (TASK-037) | `pnpm test:e2e -g "einsatz-anlegen"` |
| Accessibility (axe, Tastatur, Fokus) | — | TASK-004/028/033 | — | AC-14 (TASK-032/048) | `pnpm test:e2e -g "a11y"`, `-g "tastatur"` |
| Responsive 320/375/768/1440, Reduced Motion | — | TASK-033 | — | TASK-048/049 | `pnpm test:e2e -g "visual"` |
| Lange Namen, mehrere parallele Einsätze | TASK-009 | TASK-029 | TASK-020 | TASK-049 | `pnpm test:e2e -g "visual"` |
| Leere Teams/Ressourcen | TASK-011 | TASK-036 | TASK-018 | — | `pnpm test:integration` |
| Architektur-Invarianten (kein LocalStorage etc.) | TASK-050 | — | — | — | `pnpm vitest run src/architecture.test.ts` |
| Seed-Idempotenz | — | — | TASK-027 | — | `pnpm test:integration -t "seed"` |

---

## 12. Demo / seed data plan

Alle Datensätze sind erfundene Prototyp-Fixtures (`PROTOTYPE_ONLY`), keine realen Arboscus-Daten. Feste UUIDs (Präfix `a0000000-0000-4000-8000-…`), Basisdatum der Erzeugung `2026-09-01` (`fixedClock`), Zeitzone `Europe/Berlin`.

**Organisation:** `Demo-Betrieb (Prototyp)`, `time_zone = Europe/Berlin`.

**Auftraggeber (2):**
1. `Stadtwerke Musterstadt` — Kontakt „Frau Keller, 030 000000“.
2. `Wohnungsgenossenschaft Grünblick eG` — Kontakt „Herr Adam“.

**Baustellen (4):**
| Baustelle | Auftraggeber | Adresse | Koordinaten | Quelle |
| --- | --- | --- | --- | --- |
| Parkanlage Nordring | Stadtwerke | Nordring 12, 14467 Potsdam | gesetzt (Fixture) | `fixture` |
| Allee am Wasserwerk (langer Name: „Allee am Wasserwerk – Abschnitt West, Baumreihe 1–48“) | Stadtwerke | Zeppelinstraße 140, 14471 Potsdam | gesetzt | `fixture` |
| Innenhof Grünblick | Genossenschaft | Kastanienweg 3, 14482 Potsdam | **nicht gesetzt** | `manual` (belegt den Manual-Pfad) |
| Spielplatz Südhang | Genossenschaft | Südhang 7, 14478 Potsdam | gesetzt | `fixture` |

**Mitarbeitende (5):**
| Name | Rollenbezeichnung | Demo-Tagessatz |
| --- | --- | --- |
| Anna Bergmann | Teamleitung | 32000 (320,00 €) |
| Bernd Kowalski | Kletterer | 28000 |
| Carla Nguyen | Bodenpersonal | 24000 |
| Dilan Yildiz | Baumpflege | 26000 |
| Erik Sommer | Aushilfe | **NULL** (belegt „fehlt“) |

**Ressourcen (6):** `Hebebühne HB-18` (machine, 45000), `Häcksler HX-9` (machine, 18000), `Pritschenwagen P-BM 214` (vehicle, 12000), `Transporter P-BM 998` (vehicle, 11000), `Motorsägen-Set A` (equipment, 3000), `Seilklettersatz B` (equipment, **NULL**).

**Einsätze (4):**
| Einsatz | Baustelle | Zeitraum | Tage | Farbe | Team / Ressourcen | Besonderheit |
| --- | --- | --- | --- | --- | --- | --- |
| „Baumpflege Herbstschnitt“ | Parkanlage Nordring | 07.09.–18.09.2026 | 10 (Mo–Fr) | `moos` | Anna, Bernd, Carla / Hebebühne, Pritschenwagen | mehrtägig über zwei Kalenderzeilen (AC-06) |
| „Kronensicherung Allee“ | Allee am Wasserwerk | 14.09.–02.10.2026 | 15 (Mo–Fr) | `ocker` | Bernd, Dilan, Erik / Häcksler, Motorsägen-Set | über Monatsgrenze; Erik ohne Satz → Kosten unvollständig (AC-10); langer Name |
| „Sturmschaden Sofortmaßnahme“ | Innenhof Grünblick | 10.09.2026 (eintägig) | 1 | `pflaume` | Anna, Dilan / Transporter | eintägig = gleiches Modell (D-002); parallel zu Einsatz 1 am selben Tag, andere Baustelle (AC-04-Kontext, D-008) |
| „Spielplatz-Freischnitt (Wochenende)“ | Spielplatz Südhang | 18.09.–21.09.2026 | 3 (Fr, **Sa 19.09.**, Mo) | `petrol` | Carla, Erik / Seilklettersatz | Wochenend-Opt-in explizit; Seilklettersatz ohne Satz |

Damit sind abgedeckt: eintägig, mehrtägig, über Wochenzeile, über Monatsgrenze, Wochenende, vier verschiedene Farben, unterschiedliche Ressourcenbelegung, vollständige und unvollständige Kostengrundlagen, mehrere parallele Einsätze am selben Tag an verschiedenen Baustellen, ein sehr langer Baustellenname und eine Baustelle ohne Koordinaten.

---

## 13. Runbook

Voraussetzungen: macOS mit Docker Desktop (laufend), Node 22 (`node -v` → v22.23.2 verifiziert), Git.

```bash
# 1. Repository
git clone https://github.com/DYAI2025/easytree-prototype.git
cd easytree-prototype
git checkout feat/admin-planning-prototype

# 2. Toolchain
corepack enable                 # stellt pnpm bereit (pnpm ist lokal nicht installiert)
pnpm install --frozen-lockfile

# 3. Environment
cp .env.example .env.local
#   DATABASE_URL=postgres://postgres:easytree@127.0.0.1:55432/easytree_prototype
#   GEOCODER_PROVIDER=manual        (oder: fixture | nominatim)
#   GEOCODER_BASE_URL=https://nominatim.openstreetmap.org   (nur bei nominatim)
#   GEOCODER_USER_AGENT="EasyTree-Prototyp (kontakt@example.org)"  (Pflicht bei nominatim)

# 4. Datenbank
docker compose up -d db
docker compose exec db pg_isready          # muss "accepting connections" melden
pnpm db:migrate

# 5. Demo-Daten
pnpm db:seed

# 6. App starten
pnpm dev                                    # http://localhost:3000 → /planung?monat=2026-09

# 7. Tests
pnpm test                                   # Unit + Component
pnpm test:integration                       # gegen easytree_prototype_test
pnpm test:e2e                               # Playwright/Chromium (baut vorher)
pnpm exec playwright show-report            # Bericht ansehen

# 8. Zurücksetzen
pnpm db:reset && pnpm db:seed
docker compose down -v                      # entfernt auch das Volume
```

Hinweis: `pnpm db:migrate`, `db:seed` und `db:reset` sind `tsx`-Skripte aus `scripts/`; `db:migrate` entsteht in TASK-003, `db:seed`/`db:reset` in TASK-027. Vor diesen Tasks sind nur die Schritte 1–3 und `pnpm test` gültig.

---

## 14. Validation strategy

1. **Focused tests** — nach jedem Implementierungsschritt der jeweilige Vitest-Pfad mit `-t`; der zugehörige Rot-Lauf muss vorher protokolliert worden sein.
2. **Regression** — `pnpm test` (Unit + Component) und `pnpm test:integration` vor jedem Commit; kein Turbo-/Cache-Replay in diesem Repo (kein Turborepo), daher zählt jede Ausgabe.
3. **E2E** — `pnpm test:e2e` gegen den Produktionsbuild mit frisch geseedeter Datenbank.
4. **Persistence** — AC-11 (Reload) und AC-12 (zweiter Browserkontext) als eigene Szenarien; zusätzlich Architektur-Guard gegen Browser-Storage.
5. **Second-browser** — `browser.newContext()` in TASK-037; die IDs werden aus `data-engagement-id` gelesen und verglichen.
6. **Accessibility** — axe (jsdom) je Komponente und axe (Chromium, `wcag2a`/`wcag2aa`, inkl. `color-contrast`) je Seite; vollständiger Tab-Walk mit Fokusprüfung; ein Screenreader-Smoke bleibt menschliche Aufgabe (M-03, im Runbook vermerkt).
7. **Responsive** — 320/375/768/1440 in TASK-048/049; kein horizontales Scrollen auf `body`.
8. **Visual** — zwölf Baselines, nur nach menschlicher Sichtprüfung committet; CI aktualisiert nie automatisch.
9. **Security/Tenant** — `org_id` ausschließlich serverseitig (TASK-014-Test); Secret-Scan im CI; Problem-JSON ohne Stacktraces (TASK-021).
10. **Geolocation** — Erfolg, kein Treffer, Fehler, nicht konfiguriert, Throttle, kein Autocomplete, keine Client-Aufrufe (TASK-026/041/042).
11. **Costs** — Summen gegen im Test berechnete Erwartungswerte; expliziter Negativtest gegen „0,00" bei fehlender Grundlage.
12. **Time/date** — zwei fremde Prozesszeitzonen, DST-Übergang, Monats-/Jahresgrenze, Wochenenden, Vergangenheitsregel.

Gegenmutationen (mindestens diese fünf werden einmal ausgeführt und wieder zurückgenommen, jeweils mit protokolliertem Rot-Lauf):
- „eine Karte je Mitarbeiter“ → TASK-029/031 rot;
- „angepasste Folgetage überschreiben“ → TASK-012/019/045 rot;
- „fehlende Kosten als 0“ → TASK-011/046 rot;
- „Startdatum in der Vergangenheit erlauben“ → TASK-008/018 rot;
- „Idempotenz-Fingerprint ignorieren“ → TASK-015/024 rot.

---

## 15. Rollback and safety

- **Schema.** Es existiert genau eine Migration (`0000_initial.sql`) und keine Produktionsdaten. Rücknahme = `docker compose down -v` plus Löschen der Migration; danach `pnpm db:generate` neu. Ab dem ersten geteilten Einsatz des Prototyps gilt: nur additive Folgemigrationen (`0001_…`), kein Editieren von `0000`.
- **Domain.** Reine Funktionen ohne Seiteneffekte; Rücknahme per `git revert` des jeweiligen Commits, Tests zeigen sofort den Verlust.
- **API.** Route Handler sind additiv; eine Route entfernen bricht nur die zugehörige UI-Fläche. Verträge liegen in `src/contracts` und werden serverseitig geparst — eine Vertragsänderung ohne Testanpassung schlägt fehl.
- **UI.** Jede Fläche ist eine eigene Komponente mit eigenem Test; Rücknahme betrifft nur die Fläche. Der Kalender bleibt ohne Drawer bedienbar (Lesezustand).
- **Daten.** `pnpm db:reset && pnpm db:seed` stellt den Demo-Stand her. Revisionen sind append-only: eine fehlerhafte Tagesänderung erzeugt eine neue Revision, überschreibt aber keine Historie.
- **Sicherheitsgrenzen.** Kein Deployment, kein Merge nach `master`, keine Produktionsdatenbank, keine externen Nachrichten, kein `push --force`, kein `--no-verify`. Der Geocoder ist per Default `manual` — ohne bewusste Konfiguration verlässt keine Adresse den Rechner.

---

## 16. Execution handoff

**Start with:** TASK-001 (Repository-Skelett und Toolchain anlegen), auf einem neuen Branch `feat/admin-planning-prototype` im lokalen Klon `~/Easytree-Prototype`.

**Stop and ask if:**
- eine Aufgabe verlangt, die dritte Scope-Option `gesamter Einsatz` zu bauen (H-02);
- eine Aufgabe verlangt, individuell angepasste Folgetage zu überschreiben, ohne dass OQ-001 entschieden ist (H-01);
- eine Aufgabe verlangt, fehlende Kostengrundlagen als 0 zu behandeln oder Vergütung in Kosten umzurechnen (H-03);
- ein Provider mit Zugangsdaten eingebunden werden soll (H-04);
- Ressourcentyp-Attribute über A-08 hinaus benötigt werden (H-05);
- vergangene Tage editierbar gemacht werden sollen (H-06);
- ein Test grün wird, indem eine Regel oder Schwelle abgesenkt wird — das ist immer ein Stop;
- der Kalender-Create-Flow zum Pflichtschritt würde (Anti-Drift-Gate Frage 7);
- ein Baustellentag ohne Einsatz-Elternkontext entstehen soll (Anti-Drift-Gate Frage 2).

**Commit strategy:** ein Commit je Task (oder je TDD-Zyklus), Format `feat(TASK-0xx): …` / `test(TASK-0xx): …`; kein Commit auf `master`; Push auf `feat/admin-planning-prototype`; PR erst nach TASK-051.

**Expected final artifacts:**
- Branch `feat/admin-planning-prototype` mit 51 Tasks umgesetzt;
- lauffähige App unter `/planung` (September 2026), `/mitarbeitende`, `/ressourcen`, `/auftraggeber`;
- `drizzle/0000_initial.sql` und `scripts/db-seed.ts`;
- Testsuiten: Unit/Component, Integration (DB+API), E2E inkl. axe und zwölf visuellen Baselines;
- `.github/workflows/ci.yml` mit fünf grünen Jobs;
- `docs/decisions/HUMAN_INPUT_REQUIRED.md`, `docs/runbooks/entwicklung.md`, `README.md`, `docs/evidence/<Datum>-prototype-abnahme/README.md`;
- dieser Plan mit Status `ready-for-review`.

---

## 17. Plausibility and truth self-check

- **Goal length:** 3.509/3.999 Zeichen (gemessen inklusive der Marker `GOAL_START`/`GOAL_END`; 3.471 ohne).
- **Adversariale Gegenprüfung:** durchgeführt (eigener Verifikationslauf gegen Repository-Klone und Paketinhalte). Gefundene und korrigierte Fehler: `next lint` existiert in Next 16 nicht mehr; die Revisions-Schreibreihenfolge hätte den eigenen Partial-Unique-Index verletzt; `next start` erzwingt `NODE_ENV=production` (Fixture-Adapter jetzt flaggesteuert); Seed und E2E hätten ohne Zeitanker nach wenigen Tagen abgelaufen (`EASYTREE_FIXED_TODAY`); `git grep` im CI wäre bei sauberem Repository rot gewesen; `bigint` ist nicht JSON-serialisierbar (Wire-Format `string`); sieben Fehlercodes ohne Status-Mapping; `scripts/db-migrate.ts` war referenziert, aber von keiner Task erzeugt; zwei Vitest-Include-Globs fehlten; Playwright ohne `workers: 1` hätte die geteilte Datenbank parallel geleert; die Span-Fortsetzungsregel war widersprüchlich definiert.
- **Unsupported claims removed or labeled:** yes — jede nicht belegte Setzung trägt `ASSUMPTION`, `MISSING`, `PROTOTYPE_ONLY` oder `HUMAN_INPUT_REQUIRED`; Versionsnummern stammen aus `npm view` (2026-09-07) bzw. aus gelesenen `package.json`-Dateien.
- **Requirement coverage:** pass — alle 14 Master-Prompt-Szenarien AC-01…AC-14 sind auf Tasks abgebildet (AC-01/04/06→031, AC-02/03/05/11/12/13→037, AC-07/08→045, AC-09→042, AC-10→047, AC-14→048); jede REQ-ID erscheint in mindestens einer Task und einer Zeile der Testmatrix.
- **Source hierarchy respected:** pass — PRD v2.0 vor Glossar vor Detailseiten; der Human-PO-Vertrag `49119274` präzisiert (und überschreibt für die dort geregelten Punkte) frühere Aussagen zu Pflicht-Uhrzeiten und manueller Tagesauswahl; Jira und GitHub live gelesen.
- **Repository facts evidenced:** pass — Ziel-Repo per Clone verifiziert (leer, `5a3550f`); Referenz-Repo per Clone und Branch-Diff (`f8e96e4`, `191b605`); alle Pfade des Zielrepos sind als neu gekennzeichnet, es wird kein existierender Pfad behauptet.
- **UX requirements testable:** pass — jede UX-Forderung hat ein Prüfkriterium (axe-Zahl, Tab-Walk, Pixelbreite, Screenshot, Textassertion) statt eines Adjektivs.

**Strongest counterargument:** Der Prototyp entsteht als zweite Codebasis neben `DYAI2025/EasyTree`. Genau dieses Muster hat das Projekt schon einmal Geld gekostet — `docs/audit/` im Produktrepo verwirft einen früheren Clickdummy mit Browser-Geocoding als Drift, und die Governance (PRD §12, Anti-Drift-Vertrag) ist erkennbar darauf ausgelegt, solche Parallelwelten zu verhindern. Ein Standalone-Prototyp kann außerdem nie Tenant-/RLS-Verhalten belegen und schafft eine zweite Terminologie- und Datenmodellquelle. **Antwort:** Der Nutzer hat die Standalone-Variante bewusst gewählt (2026-09-07), und die Kosten des Alternativpfads sind real: die WorksiteDay-Grundlage liegt ausschließlich auf einem `DO_NOT_MERGE`-Branch mit einem ungeklärten Migration-0019-Umgebungsgate, dessen Auflösung `BLOCKED_MIGRATION_STATE` verlangt — ein Prototyp darauf wäre von einer blockierten Lieferkette abhängig. Der Plan mindert das Driftrisiko konkret: Produktsprache und Invarianten aus PRD/Glossar, Design-Tokens mit SHA-Herkunft, I/O-freie `src/domain`/`src/contracts` (portierbar), serverseitiges Geocoding statt Browser-Provider, `org_id` in jeder Tabelle, revisionsgebundene Tageskonfigurationen. Er beseitigt das Risiko nicht — er macht es sichtbar und begrenzt.

**Failure-mode chain:** Der wahrscheinlichste Weg ins Scheitern beginnt nicht technisch, sondern semantisch. Schritt 1: Ein Ausführender findet die Serienvorschau umständlich und lässt angepasste Tage doch überschreiben — OQ-001 ist damit still geschlossen. Schritt 2: Weil Erik keinen Tagessatz hat, wird in der Kostenansicht „0,00 €" gerendert, weil das die Tabelle ruhiger aussehen lässt — FR-020 ist verletzt und die Summe ist falsch, ohne dass es jemand sieht. Schritt 3: Der Monatskalender bekommt „der Übersicht halber“ eine Zeile je Mitarbeiter — die Kernentscheidung des Produkts ist rückgängig gemacht. Schritt 4: Weil das Neuladen nach jeder Mutation träge wirkt, wandert der Formularzustand in `localStorage` — NFR-006 fällt, und der zweite Browserkontext zeigt etwas anderes. Jeder dieser Schritte ist für sich plausibel und lokal begründbar. Deshalb hat jeder von ihnen einen Test, der rot wird, und deshalb steht in Abschnitt 14 die Gegenmutationsliste: die Tests sind nicht Dekoration, sondern die einzige Instanz, die diese vier Schritte bemerkt.

**Bias risks:**
- *Overengineering* — 51 Tasks (davon sieben in lettered Inkrementen) für einen Prototyp. Gegenmaßnahme: keine Publish-, Konflikt-, Kompetenz- oder Auth-Features; Kalender selbst gebaut statt Bibliothek nur, weil Spans und A11y sonst nicht testbar wären.
- *Tool-Bias* — Drizzle/Radix/Tailwind sind Präferenzen. Gegenmaßnahme: Optionen in Abschnitt 8 mit Alternativen begründet; die Domain-Schicht ist von allen dreien unabhängig.
- *Authority-Bias* — die Confluence-Seiten sind detailliert und verführen dazu, ihre Sprache für Evidenz zu halten. Gegenmaßnahme: Repository-Fakten stammen aus Clones, nicht aus Seitenaussagen; die Delivery-Seiten selbst warnen, dass Jira-`Fertig` keine Code-Abnahme ist.
- *Recency-Bias* — der Human-PO-Vertrag vom 06.09. ist der jüngste Text und wurde entsprechend stark gewichtet; er nennt seinen Vorrang aber selbst explizit, und die PRD widerspricht ihm in den geregelten Punkten nicht.
- *Confirmation-Bias bei der Repo-Wahl* — die Standalone-Entscheidung stammt vom Nutzer, nicht aus der Evidenz; sie ist als solche markiert und im Gegenargument oben ausdrücklich angegriffen.

**Final readiness:** `draft-with-assumptions` — ausführbar ab TASK-001 ohne weitere menschliche Entscheidung. Die sieben `HUMAN_INPUT_REQUIRED`-Punkte betreffen klar abgegrenzte Teilfeatures (dritte Scope-Option, endgültige Serienregel, Kostenbasis, Geo-Provider, Ressourcenattribute, Vergangenheitsbearbeitung, Einsatz-Verlängerung); keiner blockiert die geplanten 51 Tasks, und keiner wird durch den Plan still geschlossen.
