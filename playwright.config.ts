import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-Konfiguration des EasyTree-Prototypen.
 *
 * Alle Specs teilen EINE Datenbank, deshalb streng seriell (workers: 1,
 * fullyParallel: false). Parallele Worker wuerden sich gegenseitig die
 * Seed-Daten unter den Fuessen wegtruncaten.
 *
 * PLAYWRIGHT_BASE_URL gesetzt -> gegen eine laufende Instanz testen, kein
 * eigener Server. Sonst startet Playwright "pnpm build && pnpm start" selbst.
 */
const PORT = process.env.PORT ?? "3000";
const EXTERNAL_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const BASE_URL = EXTERNAL_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Deterministisches "heute". Ohne Zeitanker laufen die Akzeptanzszenarien nach
 * wenigen Tagen in ENGAGEMENT_START_IN_PAST bzw. DAY_IN_PAST_LOCKED.
 * Ausgewertet wird der Wert erst ab TASK-014; hier wird er nur durchgereicht.
 */
const FIXED_TODAY = process.env.EASYTREE_FIXED_TODAY ?? "2026-09-01";

export default defineConfig({
  testDir: "./e2e",

  fullyParallel: false,
  workers: 1,

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  expect: {
    timeout: 10_000,
    // Baselines entstehen erst in TASK-049 und AUSSCHLIESSLICH im Linux-Container,
    // nie lokal auf macOS (andere Font-Rasterung):
    //   docker run --rm -v "$PWD:/w" -w /w mcr.microsoft.com/playwright:v1.63.0-noble \
    //     npx playwright test --update-snapshots
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },

  use: {
    baseURL: BASE_URL,
    reducedMotion: "reduce",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: EXTERNAL_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: BASE_URL,
        // Ein Next-Produktionsbuild ueberschreitet die Vorgabe von 60 s deutlich.
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        // Default waere "ignore" - dann ist ein fehlgeschlagener Build in CI
        // unsichtbar und man sieht nur den Timeout, nicht die Ursache.
        stdout: "pipe",
        stderr: "pipe",
        env: {
          PORT,
          EASYTREE_FIXED_TODAY: FIXED_TODAY,
          // `next start` erzwingt NODE_ENV=production. Ab TASK-014 bricht der
          // Start ab, wenn EASYTREE_FIXED_TODAY dort ohne dieses Flag gesetzt ist.
          EASYTREE_PROTOTYPE: "1",
        },
      },
});
