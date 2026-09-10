"use client";

import type { LocalDate } from "../../domain/local-date";
import { DayCardStack, type DayCardModel } from "./day-card";
import { formatiereDatumLang } from "./date-labels";

/**
 * Die Kompaktform des Kalenders fuer schmale Viewports (Plan 6.2).
 *
 * Unter 768 px passt das Desktop-Kartenlayout nicht in eine Tageszelle. Die
 * erste Candidate-Runde von TASK-049 hat gezeigt, was ohne diese Form
 * passiert: das Raster wurde in eine horizontale Scrollregion gedraengt, und
 * die Karten standen unlesbar zusammengequetscht in 40 px breiten Zellen.
 *
 * Stattdessen zeigt die Zelle hier nur, DASS an diesem Tag geplant ist -
 * Farbpunkte plus Zaehler - und die Karten selbst wandern nach Auswahl in die
 * Tagesliste unter dem Raster.
 */
export function anzahlEinsaetze(anzahl: number): string {
  return `${anzahl} ${anzahl === 1 ? "Einsatz" : "Einsaetze"}`;
}

/** Wieviele Punkte hoechstens gezeichnet werden, bevor "+n" uebernimmt. */
const MAX_PUNKTE = 3;

export function DayIndicator({
  date,
  cards,
  selected,
  onSelect,
}: {
  readonly date: LocalDate;
  readonly cards: readonly DayCardModel[];
  readonly selected: boolean;
  readonly onSelect: (date: LocalDate) => void;
}) {
  const sichtbar = cards.slice(0, MAX_PUNKTE);
  const rest = cards.length - sichtbar.length;

  return (
    <button
      type="button"
      data-testid="tagesindikator"
      data-ausgewaehlt={selected ? "true" : undefined}
      aria-pressed={selected}
      // Der zugaengliche Name traegt das volle Datum: der sichtbare Zaehler
      // steht ohne Kontext in einer Zelle, deren Datum nur als Zahl daneben
      // steht.
      aria-label={`${formatiereDatumLang(date)}, ${anzahlEinsaetze(cards.length)}, Tagesliste anzeigen`}
      onClick={() => onSelect(date)}
      /*
       * min-h-11 / min-w-11 = 44 CSS-Pixel (WCAG 2.5.5) - die Flaeche ist auf
       * dem Telefon das einzige Bedienelement der Zelle.
       *
       * min-w-11 ist die Antwort auf 320 px (EYT-176). Dort teilen sich sieben
       * Tagesspalten die vollen 320 px: 45,71 px je Spur, davon gehen 2 px
       * Zellrahmen ab - der Knopf war 43,7 px breit und damit 0,3 px zu
       * schmal. Die Spur breiter zu machen ist unmoeglich, ohne das Dokument
       * horizontal zu verschieben; die Untergrenze loest es ohne Nebenwirkung:
       * der Knopf waechst um 0,3 px in den EIGENEN Zellrahmen hinein und
       * bleibt 0,7 px vor dessen Aussenkante. Die Trefferflaeche des Nachbarn
       * beginnt erst hinter dessen eigenem Rahmen, also 2 px weiter - die
       * Flaechen beruehren sich nicht. `beruehrziele.spec.ts` misst das
       * paarweise nach, statt es zu behaupten.
       *
       * Die Auswahl ist NICHT nur farblich markiert: der Ring ist eine
       * Formaenderung, aria-pressed traegt sie fuer Screenreader, und die
       * Tagesliste darunter nennt das Datum im Klartext.
       */
      className={[
        "mt-0.5 flex min-h-11 min-w-11 w-full flex-col items-start justify-center gap-1 rounded px-1",
        selected ? "ring-2 ring-action" : "",
      ].join(" ")}
    >
      <span aria-hidden="true" className="flex flex-wrap items-center gap-0.5">
        {sichtbar.map((karte) => (
          <span
            key={karte.worksiteDayId}
            data-testid="farbpunkt"
            // Variable statt zusammengesetztem Klassennamen: Tailwind erzeugt
            // `bg-${key}-frame` zur Laufzeit nicht.
            style={{ backgroundColor: `var(--eyt-colour-${karte.colourKey}-frame)` }}
            className="block size-2 rounded-full"
          />
        ))}
        {rest > 0 && <span className="text-[0.625rem] leading-none text-ink-muted">+{rest}</span>}
      </span>
      {/*
        Der Zaehler ist Text, nicht nur ein Punktmuster - Farbe allein traegt
        in diesem Produkt nie Information.

        Das Wort steht erst ab sm: bei 320/375 px ist eine Tageszelle rund
        45 px breit, "2 Einsaetze" braucht dort mehr Platz und wurde zu "2 …"
        abgeschnitten - eine Ellipse, die aussieht wie ein Darstellungsfehler.
        Die ZAHL ist auf jeder Breite vollstaendig sichtbar, und der volle
        Wortlaut steht immer im zugaenglichen Namen des Knopfs.
      */}
      <span className="block w-full truncate text-left text-[0.6875rem] leading-none text-ink-muted">
        {cards.length}
        <span className="hidden sm:inline"> {cards.length === 1 ? "Einsatz" : "Einsaetze"}</span>
      </span>
    </button>
  );
}

/**
 * Die Karten des ausgewaehlten Tages, unter dem Raster (Plan 6.2).
 *
 * Sie traegt die volle Datumsangabe als Ueberschrift: der ausgewaehlte Tag
 * muss auch ohne Farbwahrnehmung erkennbar sein.
 */
export function DayList({
  date,
  cards,
  onOpen,
}: {
  readonly date: LocalDate;
  readonly cards: readonly DayCardModel[];
  readonly onOpen: (worksiteDayId: string) => void;
}) {
  return (
    <section
      data-testid="tagesliste"
      aria-label="Ausgewaehlter Tag"
      className="rounded border border-line bg-surface p-3 md:hidden"
    >
      <h2 className="font-medium">{formatiereDatumLang(date)}</h2>
      <p className="mb-2 text-ink-muted">{anzahlEinsaetze(cards.length)}</p>
      <DayCardStack cards={cards} onOpen={onOpen} />
    </section>
  );
}
