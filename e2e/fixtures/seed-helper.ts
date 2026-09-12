import { execFileSync } from "node:child_process";

/**
 * Playwright-globalSetup: setzt die Datenbank EINMAL je Lauf zurueck und
 * spielt die Demo-Daten ein.
 *
 * Bewusst global und nicht je Spec-Datei: mehrere Specs teilen eine Datenbank,
 * und ein Reset je Datei wuerde den Spezifikationen der anderen Dateien die
 * Daten unter den Fuessen wegziehen. Aus demselben Grund laeuft Playwright mit
 * workers: 1.
 */
export default function globalSetup(): void {
  const optionen = { stdio: "inherit" as const, env: process.env };

  execFileSync("pnpm", ["db:reset"], optionen);
  execFileSync("pnpm", ["db:seed"], optionen);
}
