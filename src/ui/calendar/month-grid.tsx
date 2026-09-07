"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { LocalDate } from "../../domain/local-date";
import type { MonthGrid as MonthGridModel } from "../../domain/month-grid";
import { tagesLabel, WOCHENTAGE, WOCHENTAGE_LANG } from "./date-labels";

export interface MonthGridProps {
  readonly grid: MonthGridModel;
  readonly today: LocalDate;
  /** Id des Monatstitels; das Raster verweist darauf statt eigenen Text zu fuehren. */
  readonly labelledBy: string;
  readonly onCreateForDate: (date: LocalDate) => void;
  readonly onMonthChange: (richtung: -1 | 1) => void;
  readonly cardsByDate?: Readonly<Record<string, ReactNode>>;
  readonly countsByDate?: Readonly<Record<string, number>>;
}

const TAGE_PRO_WOCHE = 7;

/**
 * Monatsraster als echtes `role="grid"`.
 *
 * Die Kalenderwoche ist ein `rowheader` und KEINE Tageszelle: sie ist die
 * Beschriftung der Zeile, kein bedienbares Datum. Die Tastaturnavigation
 * arbeitet auf einer flachen Liste der Tageszellen und ueberspringt die
 * KW-Spalte damit von selbst.
 *
 * Roving Tabindex: genau eine Zelle liegt im Tabfluss. Ein Raster mit 35
 * Tabstopps waere mit der Tastatur unbenutzbar.
 */
export function MonthGrid({
  grid,
  today,
  labelledBy,
  onCreateForDate,
  onMonthChange,
  cardsByDate,
  countsByDate,
}: MonthGridProps) {
  const flach = useMemo(
    () => grid.weeks.flatMap((week) => week.days.map((day) => day.date)),
    [grid],
  );

  // Startpunkt: heute, sonst der erste Tag des Monats.
  const [aktiv, setAktiv] = useState<LocalDate>(() => {
    if (flach.includes(today)) {
      return today;
    }

    const ersterImMonat = grid.weeks.flatMap((w) => w.days).find((d) => d.inMonth);

    return ersterImMonat?.date ?? flach[0]!;
  });

  const refs = useRef(new Map<string, HTMLDivElement | null>());

  const fokussiere = useCallback((datum: LocalDate) => {
    setAktiv(datum);
    refs.current.get(datum)?.focus();
  }, []);

  const bewege = useCallback(
    (von: LocalDate, schritte: number) => {
      const index = flach.indexOf(von);
      const ziel = flach[index + schritte];

      if (ziel !== undefined) {
        fokussiere(ziel);
      }
    },
    [flach, fokussiere],
  );

  const handleKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, datum: LocalDate) => {
      const index = flach.indexOf(datum);
      const spalte = index % TAGE_PRO_WOCHE;

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          bewege(datum, 1);
          return;
        case "ArrowLeft":
          event.preventDefault();
          bewege(datum, -1);
          return;
        case "ArrowDown":
          event.preventDefault();
          bewege(datum, TAGE_PRO_WOCHE);
          return;
        case "ArrowUp":
          event.preventDefault();
          bewege(datum, -TAGE_PRO_WOCHE);
          return;
        case "Home":
          event.preventDefault();
          bewege(datum, -spalte);
          return;
        case "End":
          event.preventDefault();
          bewege(datum, TAGE_PRO_WOCHE - 1 - spalte);
          return;
        case "PageUp":
          event.preventDefault();
          onMonthChange(-1);
          return;
        case "PageDown":
          event.preventDefault();
          onMonthChange(1);
          return;
        case "Enter":
        case " ":
          event.preventDefault();
          onCreateForDate(datum);
          return;
        default:
      }
    },
    [bewege, flach, onCreateForDate, onMonthChange],
  );

  return (
    <div role="grid" aria-labelledby={labelledBy} className="w-full">
      <div role="row" className="grid grid-cols-[3rem_repeat(7,1fr)]">
        <div role="columnheader" aria-label="Kalenderwoche" className="p-2 text-sm text-ink-muted">
          {/*
            Sichtbarer Text ist Pflicht: eine leere Kopfzelle ist ein echter
            axe-Verstoss (empty-table-header), und ein aria-label allein
            genuegt der Regel nicht. Die Regel abzuschalten waere die falsche
            Reaktion.
          */}
          KW
        </div>
        {WOCHENTAGE.map((kurz, index) => (
          <div
            key={kurz}
            role="columnheader"
            aria-label={WOCHENTAGE_LANG[index]}
            className="p-2 text-sm font-medium text-ink-muted"
          >
            {kurz}
          </div>
        ))}
      </div>

      {grid.weeks.map((week) => (
        <div key={week.isoWeek} role="row" className="grid grid-cols-[3rem_repeat(7,1fr)]">
          <div
            role="rowheader"
            aria-label={`Kalenderwoche ${week.isoWeek}`}
            className="p-2 text-sm text-ink-muted"
          >
            {week.isoWeek}
          </div>

          {week.days.map((day) => {
            const anzahl = countsByDate?.[day.date] ?? 0;

            return (
              <div
                key={day.date}
                ref={(node) => {
                  refs.current.set(day.date, node);
                }}
                role="gridcell"
                tabIndex={day.date === aktiv ? 0 : -1}
                data-datum={day.date}
                data-ausserhalb={day.inMonth ? undefined : "true"}
                aria-label={tagesLabel(day.date, anzahl)}
                aria-current={day.date === today ? "date" : undefined}
                onKeyDown={(event) => handleKey(event, day.date)}
                onFocus={() => setAktiv(day.date)}
                className={[
                  "min-h-24 border border-line p-1 text-left align-top",
                  day.inMonth ? "bg-surface" : "bg-canvas text-ink-muted",
                ].join(" ")}
              >
                <span className="text-sm">{Number(day.date.slice(8, 10))}</span>
                {cardsByDate?.[day.date]}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
