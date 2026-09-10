"use client";

import { useCallback, useState } from "react";

export interface Erfolgsmeldung {
  readonly text: string;
  /** Zaehlt jede Meldung hoch - siehe `key` unten. */
  readonly nummer: number;
}

/**
 * Der kleine gemeinsame Erfolgsmechanismus (EYT-175).
 *
 * Er gehoert in die Komponente, die die Mutation UEBERLEBT - also in das
 * Elternteil, nicht in den Drawer oder das Formular. Genau daran scheiterte der
 * naheliegende Entwurf: Tagesdrawer, Serienvorschau, Anlage-Assistent und das
 * Baustellenformular werden nach dem Speichern alle aus dem Baum genommen; eine
 * Meldung in ihnen waere im selben Moment mit verschwunden.
 *
 * Kein Kontext, kein Provider, keine Abhaengigkeit: es gibt genau zwei solche
 * Elternteile (`PlanungsAnsicht`, `CustomerPanel`). Eine Notification-Plattform
 * fuer zwei Aufrufer waere Aufwand ohne Gegenwert.
 */
export function useErfolg(): {
  readonly meldung: Erfolgsmeldung | null;
  readonly melde: (text: string) => void;
  readonly loesche: () => void;
} {
  const [meldung, setMeldung] = useState<Erfolgsmeldung | null>(null);

  const melde = useCallback((text: string): void => {
    setMeldung((bisher) => ({ text, nummer: (bisher?.nummer ?? 0) + 1 }));
  }, []);

  const loesche = useCallback((): void => setMeldung(null), []);

  return { meldung, melde, loesche };
}

/**
 * Kurze Rueckmeldung nach einer erfolgreichen Aktion.
 *
 * `role="status"` und nicht `role="alert"`: eine Erfolgsmeldung soll den
 * Vorlesefluss nicht unterbrechen. Fehler nutzen `role="alert"`.
 *
 * Der Bereich steht IMMER im Dokument, auch ohne Meldung. Das ist die
 * eigentliche Bedingung dafuer, dass assistive Technik ueberhaupt etwas
 * vorliest: eine Live-Region, die erst zusammen mit ihrem Text eingehaengt
 * wird, ist fuer sie neuer Inhalt und keine Aenderung - und bleibt
 * typischerweise stumm. Deshalb wird hier nur die DARSTELLUNG umgeschaltet, nie
 * die Existenz.
 *
 * Ohne Meldung traegt der Bereich `sr-only`. Das ist absolut positioniert und
 * damit kein Flex-Item: er belegt weder Hoehe noch einen zusaetzlichen `gap`
 * und verschiebt folglich kein Bild der Sichtpruefung.
 *
 * Geprueft ist das DOM-Verhalten (Rolle, aria-live, Knotenwechsel), NICHT ein
 * echter Durchlauf mit VoiceOver oder NVDA - ein solcher hat nicht
 * stattgefunden und wird hier auch nicht behauptet.
 */
export function Toast({
  text,
  nummer = 0,
}: {
  readonly text: string | null;
  readonly nummer?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="erfolgsmeldung"
      className={
        text === null
          ? "sr-only"
          : "rounded border border-line bg-published-bg px-3 py-2 text-published-text"
      }
    >
      {/*
        Der `key` ist Absicht: zweimal derselbe Satz - denselben Tag zweimal
        speichern - liesse den Textknoten sonst unveraendert. Ohne Mutation im
        Live-Bereich gaebe es keine zweite Ansage.
      */}
      {text !== null && <span key={nummer}>{text}</span>}
    </div>
  );
}
