"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { LocalDate } from "../../domain/local-date";
import type { MonthGrid as MonthGridModel, SpanSegment } from "../../domain/month-grid";
import { SpanLayer } from "./span-layer";
import { tagesLabel, WOCHENTAGE, WOCHENTAGE_LANG } from "./date-labels";

export interface MonthGridProps {
  readonly grid: MonthGridModel;
  readonly today: LocalDate;
  /** Id des Monatstitels; das Raster verweist darauf statt eigenen Text zu fuehren. */
  readonly labelledBy: string;
  readonly onCreateForDate: (date: LocalDate) => void;
  readonly onMonthChange: (richtung: -1 | 1) => void;
  readonly cardsByDate?: Readonly<Record<string, ReactNode>>;
  /**
   * Kompaktform derselben Tage fuer schmale Viewports (Plan 6.2): Farbpunkte
   * und Zaehler statt der vollen Karten. Die Karten selbst erscheinen dort
   * erst nach Auswahl in der Tagesliste unter dem Raster.
   */
  readonly indicatorsByDate?: Readonly<Record<string, ReactNode>>;
  readonly countsByDate?: Readonly<Record<string, number>>;
  /** Balken der mehrtaegigen Einsaetze; rein dekorativ (siehe SpanLayer). */
  readonly spans?: readonly SpanSegment[];
  readonly colourByEngagement?: Readonly<Record<string, string>>;
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
  indicatorsByDate,
  countsByDate,
  spans,
  colourByEngagement,
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
      /*
       * Nur reagieren, wenn die ZELLE selbst den Fokus hat.
       *
       * Ohne diese Schranke verschluckt das preventDefault unten die
       * Aktivierung jedes Knopfs in der Zelle: im Browser war der
       * Disclosure-Button "+n weitere" per Tastatur nicht bedienbar, weil
       * sein Enter hier abgefangen und stattdessen die Einsatzanlage
       * ausgeloest wurde. Dasselbe galt fuer jede Tageskarte.
       */
      if (event.target !== event.currentTarget) {
        return;
      }

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
    /*
     * Der Kalender scrollt in SEINEM Bereich, nicht im Dokument.
     *
     * Die Mindestbreite gilt AUSSCHLIESSLICH ab dem md-Umbruch: dort haelt
     * min-w-[27.5rem] eine Tagesspalte bei 56 px, worin der Tageskarte nach
     * Rahmen und Innenabstand 46 px bleiben - ueber der 44-px-Schwelle aus
     * WCAG 2.5.5.
     *
     * Darunter gilt sie NICHT mehr. Vorher erzwang sie bei 320/375 px den
     * horizontalen Scroll und damit das Desktop-Kartenlayout in winzigen
     * Zellen; Plan 6.2 verlangt dort stattdessen die Kompaktform. Der
     * Scrollcontainer bleibt trotzdem stehen - er ist die Reissleine, falls
     * ein Inhalt doch einmal breiter wird, und haelt den Ueberlauf vom
     * Dokument fern (REQ-NF-004).
     *
     * tabIndex + role/aria-label sind Pflicht, nicht Zierde: ein scrollbarer
     * Bereich ohne Tastaturzugang ist der axe-Verstoss
     * scrollable-region-focusable.
     */
    /*
     * -mx-4 sm:mx-0 - der Kalender nimmt unterhalb von sm die volle
     * Viewportbreite (EYT-176).
     *
     * Rechnung, nicht Geschmack: `main` traegt px-4, also 16 px je Seite. Bei
     * 325 px Viewport blieben dem Raster 293 px, eine Tagesspalte damit
     * 41,9 px und der Kompaktindikator darin 39,9 px - unter der 44-px-Schwelle
     * aus WCAG 2.5.5, gemessen im Produktionsbuild. Ohne den Seitenrand sind es
     * 46,4 px Spalte und 44,4 px Indikator.
     *
     * Der Weg ueber den Seitenrand ist der einzige, der ohne Nebenwirkung
     * bleibt: das Raster breiter zu machen erzwaenge horizontalen
     * Dokumentueberlauf, und die Trefferflaeche ueber die Zellgrenze zu ziehen
     * liesse benachbarte Tage einander ueberlappen. Beides ist ausgeschlossen.
     *
     * Ab sm faellt die Verschiebung weg - dort ist die Spalte ohnehin breit
     * genug, und der Seitenrand des Desktops bleibt unangetastet.
     */
    <div
      role="region"
      aria-label="Monatskalender"
      tabIndex={0}
      className="-mx-4 overflow-x-auto sm:mx-0"
    >
      <div role="grid" aria-labelledby={labelledBy} className="w-full md:min-w-[27.5rem]">
        <div
          role="row"
          className="grid grid-cols-[0px_repeat(7,minmax(0,1fr))] md:grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
        >
          <div
            role="columnheader"
            aria-label="Kalenderwoche"
            className="sr-only md:not-sr-only md:p-2 md:text-sm md:text-ink-muted"
          >
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
              /*
               * Explizit platziert wie die Tageszellen. Der KW-Kopf ist
               * unterhalb des md-Umbruchs `sr-only` und damit absolut
               * positioniert - er belegt dort keine Spur mehr. Automatisch
               * platzierte Wochentage ruecken dadurch um eine Spalte nach
               * links und stehen nicht mehr ueber ihren Tagen.
               */
              style={{ gridColumn: index + 2 }}
              className="p-2 text-sm font-medium text-ink-muted"
            >
              {kurz}
            </div>
          ))}
        </div>

        {grid.weeks.map((week, zeilenIndex) => (
          <div
            key={week.isoWeek}
            role="row"
            className="grid grid-cols-[0px_repeat(7,minmax(0,1fr))] md:grid-cols-[3rem_repeat(7,minmax(0,1fr))]"
          >
            {/*
            Die Balken liegen IN der Wochenzeile, nicht in einer eigenen
            Overlay-Ebene: eine zweite absolute Ebene muesste die Zeilenhoehen
            des Rasters nachbauen und liefe bei jeder Aenderung auseinander.
          */}
            {spans !== undefined && colourByEngagement !== undefined && (
              <SpanLayer
                segments={spans.filter((segment) => segment.rowIndex === zeilenIndex)}
                colourByEngagement={colourByEngagement}
                rowBase={zeilenIndex}
              />
            )}
            <div
              role="rowheader"
              aria-label={`Kalenderwoche ${week.isoWeek}`}
              // Explizit platziert wie die Tageszellen: die Balken belegen
              // Zellen derselben Gitterzeile, und automatisch platzierte
              // Elemente wuerden um sie herum in freie Spalten rutschen.
              style={{ gridColumn: 1, gridRow: 1 }}
              className="sr-only md:not-sr-only md:p-2 md:text-sm md:text-ink-muted"
            >
              {week.isoWeek}
            </div>

            {week.days.map((day, spaltenIndex) => {
              const anzahl = countsByDate?.[day.date] ?? 0;
              /*
               * Vergangenheit ist ein reiner Vergleich zweier LocalDates -
               * beide sind YYYY-MM-DD, der Stringvergleich ist deshalb der
               * Datumsvergleich. `today` kommt aus dem Serverlesemodell und
               * damit aus dem einen Zeitanker (EASYTREE_FIXED_TODAY); die
               * Zelle liest NIE selbst die Uhr.
               */
              const vergangen = day.date < today;

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
                  data-vergangen={vergangen ? "true" : undefined}
                  aria-label={tagesLabel(day.date, anzahl)}
                  /*
                   * Der erklaerende Text sitzt im Tooltip, wie Plan 6.3 es
                   * vorschreibt - nicht im aria-label. Das Label beschreibt
                   * den Tag, nicht die Bearbeitbarkeit, und seine Form ist
                   * anderswo zugesichert.
                   */
                  title={
                    vergangen
                      ? "gesperrt - dieser Tag liegt vor dem heutigen Datum und ist nur lesbar"
                      : undefined
                  }
                  aria-current={day.date === today ? "date" : undefined}
                  style={{ gridColumn: spaltenIndex + 2, gridRow: 1 }}
                  onKeyDown={(event) => handleKey(event, day.date)}
                  onFocus={() => setAktiv(day.date)}
                  className={[
                    // min-h-11 = 44 CSS-Pixel (Plan 6.11 fuer Mobil), ab md
                    // die volle Desktop-Zelle.
                    "min-h-11 border border-line p-0 text-left align-top md:min-h-24 md:p-1",
                    day.inMonth ? "bg-surface" : "bg-canvas text-ink-muted",
                    // Schraffur NUR zusaetzlich: gesperrt bleibt bedienbar.
                    vergangen ? "eyt-vergangen" : "",
                  ].join(" ")}
                >
                  <span className="block px-1 text-sm md:px-0">
                    {Number(day.date.slice(8, 10))}
                  </span>
                  {/*
                    Zwei Darstellungen desselben Tages, umgeschaltet per CSS
                    statt per Media-Query im JavaScript: eine Breitenmessung im
                    Client haette beim ersten Rendern noch keinen Wert und
                    erzeugte einen Hydration-Unterschied.
                  */}
                  <span className="block md:hidden">{indicatorsByDate?.[day.date]}</span>
                  <span className="hidden md:block">{cardsByDate?.[day.date]}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
