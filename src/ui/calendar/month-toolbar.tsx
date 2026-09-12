"use client";

import { addMonths } from "../../domain/month-grid";
import { Button } from "../primitives/button";

const MONATSNAMEN = [
  "Januar",
  "Februar",
  "Maerz",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

export function monatsTitel(monat: string): string {
  const jahr = monat.slice(0, 4);
  const index = Number(monat.slice(5, 7)) - 1;

  return `${MONATSNAMEN[index] ?? monat} ${jahr}`;
}

/**
 * Kopfzeile der Planung: Monatsnavigation und Primaeraktion.
 *
 * Die Toolbar aendert nur den Monat als Wert; wohin er geschrieben wird (URL),
 * entscheidet der Aufrufer. So bleibt sie ohne Router testbar.
 */
export function MonthToolbar({
  monat,
  heute,
  onNavigate,
  onCreate,
}: {
  readonly monat: string;
  readonly heute: string;
  readonly onNavigate: (monat: string) => void;
  readonly onCreate: () => void;
}) {
  return (
    <div
      data-testid="monatswerkzeuge"
      className="flex flex-wrap items-center gap-2 border-b border-line pb-3"
    >
      <Button
        variant="secondary"
        aria-label="Vorheriger Monat"
        onClick={() => onNavigate(addMonths(monat, -1))}
      >
        ‹
      </Button>
      <Button
        variant="secondary"
        aria-label="Naechster Monat"
        onClick={() => onNavigate(addMonths(monat, 1))}
      >
        ›
      </Button>
      <Button variant="secondary" onClick={() => onNavigate(heute.slice(0, 7))}>
        Heute
      </Button>

      <h1 id="monatstitel" className="ml-2 text-xl font-semibold">
        {monatsTitel(monat)}
      </h1>

      <div className="ml-auto">
        <Button onClick={onCreate}>Einsatz anlegen</Button>
      </div>
    </div>
  );
}
