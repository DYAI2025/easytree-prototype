"use client";

import { useState } from "react";

import { MAX_VISIBLE_CARDS_PER_DAY } from "../../domain/month-grid";

export interface DayCardModel {
  readonly worksiteDayId: string;
  readonly engagementId: string;
  readonly title: string;
  readonly worksiteName: string;
  readonly colourKey: string;
  readonly employeeCount: number;
  readonly resourceCount: number;
}

function anzahlText(anzahl: number, singular: string, plural: string): string {
  return `${anzahl} ${anzahl === 1 ? singular : plural}`;
}

/**
 * Eine Karte je BAUSTELLENTAG - nicht je Mitarbeiter.
 *
 * Die Teamgroesse steht als Zahl auf der Karte ("5 Personen"), nicht als
 * fuenf Zeilen. Das ist die Kernentscheidung des Produkts; sie hier zu
 * verletzen waere Drift.
 *
 * Farbe ist ausschliesslich Orientierung: der Farbmarker ist aria-hidden und
 * traegt keinen Text. Jede Information steht zusaetzlich als Text.
 */
export function DayCard({
  card,
  onOpen,
}: {
  readonly card: DayCardModel;
  readonly onOpen: (worksiteDayId: string) => void;
}) {
  const zusammenfassung = `${card.worksiteName} · ${anzahlText(card.employeeCount, "Person", "Personen")} · ${anzahlText(card.resourceCount, "Ressource", "Ressourcen")}`;
  const vollText = `${card.title} — ${zusammenfassung}`;

  return (
    <button
      type="button"
      data-testid="tageskarte"
      data-farbe={card.colourKey}
      data-engagement-id={card.engagementId}
      data-worksite-day-id={card.worksiteDayId}
      title={vollText}
      aria-label={vollText}
      onClick={() => onOpen(card.worksiteDayId)}
      className="flex w-full items-stretch gap-1 rounded border border-line bg-surface text-left text-xs"
    >
      <span
        data-testid="farbmarker"
        aria-hidden="true"
        // Variable statt `bg-${key}-frame`: Tailwind erzeugt zur Laufzeit
        // zusammengesetzte Klassennamen nicht, der Marker bliebe farblos.
        style={{ backgroundColor: `var(--eyt-colour-${card.colourKey}-frame)` }}
        className="w-1 shrink-0 rounded-l"
      />
      <span className="min-w-0 flex-1 p-1">
        <span data-truncate="true" className="block truncate font-medium">
          {card.title}
        </span>
        <span data-truncate="true" className="block truncate text-ink-muted">
          {zusammenfassung}
        </span>
      </span>
    </button>
  );
}

/**
 * Mehrere Einsaetze am selben Tag stapeln untereinander. Ab der vierten Karte
 * fasst ein Disclosure-Button zusammen, damit die Zelle nicht unbegrenzt
 * waechst.
 *
 * Der Button MUSS aufklappen. Vorher war er ein Knopf ohne Handler: die
 * vierte und jede weitere Karte stand gar nicht im DOM und war ueber die
 * Oberflaeche nicht erreichbar (Befund B-02). Ein Control, das nichts tut,
 * ist schlimmer als keins - es behauptet einen Weg, den es nicht gibt.
 *
 * Bewusst kein Dialog und kein Popover: das Aufklappen an Ort und Stelle
 * braucht keinen zweiten Fokuskontext und keine neue Architektur.
 */
export function DayCardStack({
  cards,
  onOpen,
}: {
  readonly cards: readonly DayCardModel[];
  readonly onOpen: (worksiteDayId: string) => void;
}) {
  const [aufgeklappt, setAufgeklappt] = useState(false);

  const versteckt = cards.length - MAX_VISIBLE_CARDS_PER_DAY;
  const sichtbar = aufgeklappt ? cards : cards.slice(0, MAX_VISIBLE_CARDS_PER_DAY);

  return (
    <span className="mt-1 flex flex-col gap-1">
      {sichtbar.map((card) => (
        <DayCard key={card.worksiteDayId} card={card} onOpen={onOpen} />
      ))}
      {versteckt > 0 && (
        <button
          type="button"
          data-testid="mehr-karten"
          aria-expanded={aufgeklappt}
          onClick={() => setAufgeklappt((offen) => !offen)}
          className="rounded border border-line px-1 text-xs text-ink-muted"
        >
          {aufgeklappt ? "Weniger anzeigen" : `+${versteckt} weitere`}
        </button>
      )}
    </span>
  );
}
