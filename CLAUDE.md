# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Greenfield, plan-driven. Right now the repo contains **only documents** — no `package.json`, no sources, no CI, no migrations. Every source path referenced below is still to be created.

- `docs/plans/2026-09-07-easytree-admin-planning-prototype.md` — **the specification.** 2100 lines: requirements table (REQ-*), target architecture, data model, UX spec, 51 executable TDD tasks (TASK-001…TASK-051), test matrix, runbook, rollback. Read the sections relevant to your task before writing code; do not re-derive design decisions it already made.
- `Claude Fable 5.1 – EasyTree Prototype Planning Master Prompt.md` — the planning contract that produced the plan (incl. acceptance scenarios AC-01…AC-14). Source of authority for *what* was asked, not *how* it is built.
- Work happens on branch `feat/admin-planning-prototype`. **No commits on `master`.** PR only after TASK-051.

Domain language, UI text, and URL segments are **German** (`/planung`, `/mitarbeitende`, `/ressourcen`, `/auftraggeber`, `/api/einsaetze`, `/api/baustellentage`). Code identifiers are English. Keep this split.

## What is being built

A standalone, worksite-centric admin planning vertical slice: Auftraggeber → Baustelle → Einsatz → Baustellentage → Team/Ressourcen → day/series editing → month calendar → plan cost overview. All business state lives server-side in PostgreSQL; reload and a second browser context must show identical IDs. Single demo tenant, no auth (`PROTOTYPE_ONLY`).

## Commands

Toolchain: pnpm 10 (via `corepack enable`) · Node 22 · Next 16.3 · React 19.2 · TypeScript 5.9 · Zod 4 · Drizzle 0.45 + drizzle-kit · postgres.js · PostgreSQL 17 (Docker) · Tailwind 4.3 · Radix · react-hook-form 7 · Vitest 4 · Playwright 1.63.

These scripts are created incrementally: `dev/build/lint/typecheck/format` in TASK-001, `test`/`test:integration` in TASK-002, `db:*` in TASK-003 (migrate) and TASK-027 (seed/reset), `test:e2e` in TASK-005. Before those tasks land, only `git`, `node`, and `corepack` apply.

```bash
corepack enable && pnpm install --frozen-lockfile
cp .env.example .env.local

docker compose up -d db          # postgres:17-alpine on 127.0.0.1:55432
pnpm db:migrate && pnpm db:seed
pnpm dev                          # http://localhost:3000 → /planung?monat=2026-09

pnpm lint && pnpm typecheck       # `eslint .` — `next lint` no longer exists in Next 16
pnpm test                         # vitest projects: domain (node) + ui (jsdom)
pnpm test:integration             # vitest project: integration, against easytree_prototype_test
pnpm test:e2e                     # Playwright/Chromium, builds and starts production server

pnpm db:reset && pnpm db:seed     # restore demo state
docker compose down -v            # drop volume too
```

Single test / focused runs:

```bash
pnpm vitest run src/domain/local-date.test.ts -t "parseLocalDate"
pnpm test:integration -t "create-engagement"   # -t filters TEST NAMES, not paths
pnpm test:e2e -g "kalender"
TZ=Pacific/Kiritimati pnpm vitest run src/domain/local-date.test.ts
```

`-t` gotcha: the top-level `describe` of every integration file is named exactly after the file without extension (`schema`, `idempotency`, `create-engagement`, …). A wrong name reports "no test files" instead of an honest failure.

## Architecture

Strict one-directional layering, enforced by `src/architecture.test.ts` (TASK-050) and `no-restricted-imports`:

```
src/domain      pure business logic, zero I/O — imports nothing from server/app/next/drizzle/postgres
src/contracts   Zod schemas shared by client and server — imports nothing from src/server
src/server      db/ tenant/ clock/ idempotency/ audit/ commands/ queries/ geocoding/ http/
src/app/api     Route Handlers — every route.ts goes through defineRoute
src/app, src/ui React; client mutates only via /api/* through src/lib/api-client.ts
```

Guard invariants worth internalizing before touching UI or domain code:

- **No `localStorage`/`sessionStorage` anywhere in `src/ui/**` or `src/app/**`.** View state lives in the URL (`/planung?monat=…&tag=…&drawer=neu|tag|kosten&id=…`); form state lives in the drawer instance's React state. Server is the only truth (REQ-NF-001).
- **No `fetch` to external hosts outside `src/server/geocoding/**`.** Geocoding is server-side only.
- The month view is computed server-side (`MonthPlanningView`); the client only lays out spans.
- Server Components load initial data through the query layer directly — never fetch the app's own API.

Commands have the shape `(deps: { db, tenant, clock, audit, idempotency }, input: ZodParsed) => Promise<Result>`, run inside one DB transaction, and throw `DomainProblem { code, status, detail, meta }`, which `src/server/http/handler.ts` maps to RFC-7807 `application/problem+json` (no stack traces, `x-correlation-id` mirrored).

### Persistence rules that bite

- `worksite_days` identity is `unique (org_id, worksite_id, local_date)`; `engagement_id` is NOT NULL. A Baustellentag never exists without an Einsatz parent.
- Day configurations are **append-only revisions**. The mandatory in-transaction order is: (1) `select … for update` the `worksite_days` row, (2) `update … set superseded_at = now() where superseded_at is null`, (3) `insert` the new revision. Reversing it violates the partial unique index `(worksite_day_id) where superseded_at is null` with `23505` — partial unique indexes are not constraints in PostgreSQL and cannot be `DEFERRABLE`. Series changes apply the same triple per target day in **one** transaction, locking targets by ascending ID.
- Money is EUR **minor units as `bigint`** in domain and DB (`bigint(..., { mode: "bigint" })` — the Drizzle default `number` silently loses precision). `JSON.stringify` throws on `bigint`, so the **wire format is a decimal `string`**; `src/contracts/common.ts` provides `toWire`/`fromWire`. Convert at the boundary only.
- `POST /api/einsaetze` is idempotent via the `Idempotency-Key` header: same key + same fingerprint replays the stored first response; same key + different fingerprint → `409 IDEMPOTENCY_KEY_REUSED`.

### Time

All business dates are `LocalDate` (`YYYY-MM-DD`, branded) in `Europe/Berlin`. `Clock` is a port; `serverClock()` honors `EASYTREE_FIXED_TODAY=YYYY-MM-DD` so seed, integration, and E2E have a stable "today" (without it the acceptance scenarios expire into `ENGAGEMENT_START_IN_PAST` after a few days). Setting it under `NODE_ENV=production` without `EASYTREE_PROTOTYPE=1` must fail at startup. The past-date rule is enforced **server-side only**.

`next start` forces `NODE_ENV=production`, so the geocoder fixture adapter is gated on the explicit flag `GEOCODER_ALLOW_FIXTURE=1`, never on `NODE_ENV` — otherwise E2E against the production build is impossible.

## Product invariants — never "improve" these

These are the documented drift failure modes. Each has a test that goes red; a green test reached by lowering one of these is always a stop.

1. **One card per Baustellentag**, regardless of team size — never one row per employee. Multiple Einsätze on the same day stack, each with its own colour frame.
2. **Individually adjusted following days are never silently overwritten.** Series preview marks `origin = 'day_edit'` days as "individuell angepasst" and excludes them by default; inclusion is per-day opt-in (interim rule A-06 pending OQ-001). Only two scopes exist: `nur dieser Tag`, `dieser und folgende Tage`.
3. **Missing cost basis renders as `fehlt`, never `0,00 €`**; the total is then flagged incomplete. Daily rates are `PROTOTYPE_ONLY`.
4. **No engagement start and no day mutation before today's local date** (`422 DAY_IN_PAST_LOCKED`, `ENGAGEMENT_START_IN_PAST`). Past days stay visible and explained.
5. Mo–Fr derived automatically; weekends opt-in; planned times optional (08:00–18:00 only as a prefill when time capture is enabled). Manual day-by-day entry is a documented `HUMAN_PO_VISUAL FAIL`.
6. Colour is an orientation aid, never status truth. Status always carries text (no color-only), contrast ≥ 3:1 in light and dark.
7. Costs are never the admin landing surface; entry is from the day card / day drawer / engagement view.

## Task workflow

The plan's task conventions apply to every task and are not repeated per task:

1. **Inspect first** — read the files the task touches before the first line.
2. **Failing test first**, and log the red run output in the commit message or evidence file. A test green on its first run proves nothing and is an invalid step (exceptions: the pure audit tasks 032, 048, 049).
3. Smallest correct implementation, no anticipatory build-out.
4. Focused run (the task's *Validation* command).
5. **Before every commit** additionally: `pnpm test`; plus `pnpm test:integration` when DB/commands/queries/routes are touched; plus `pnpm build` when React components or pages are touched — only the build surfaces server/client boundary errors that jsdom misses.
6. One commit per task or TDD cycle, `feat(TASK-0xx): …` / `test(TASK-0xx): …` / `chore:` / `fix:` / `docs:`.

Playwright runs `workers: 1`, `fullyParallel: false` — all specs share one database.

## Stop and ask

Do not decide these silently; they are `HUMAN_INPUT_REQUIRED` (H-01…H-07 in the plan, §2):

- a third series scope `gesamter Einsatz` (H-02, deliberately not planned)
- overwriting individually adjusted following days before OQ-001 is decided (H-01)
- treating missing cost basis as 0, or converting compensation into costs (H-03)
- wiring a geocoding provider that needs credentials (H-04)
- resource-type attributes beyond `vehicle|machine|equipment` + name/identifier/active/daily rate (H-05)
- making past days editable (H-06)
- extending an existing Einsatz's period (H-07)
- a Baustellentag without an Einsatz parent, or making the calendar create-flow mandatory
- any test turning green by lowering a rule or threshold

## Safety boundaries

No deployment, no merge to `master`, no production database, no `push --force`, no `--no-verify`. `GEOCODER_PROVIDER` defaults to `manual`, so no address leaves the machine without deliberate configuration. `.env.example` carries non-secret defaults only; CI runs a secret-scan (`git grep` exits 1 on *no* match — the check must invert it).
