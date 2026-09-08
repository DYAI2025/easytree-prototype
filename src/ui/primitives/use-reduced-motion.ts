"use client";

import { useSyncExternalStore } from "react";

const ABFRAGE = "(prefers-reduced-motion: reduce)";

function abonniere(beiWechsel: () => void): () => void {
  const liste = window.matchMedia(ABFRAGE);

  liste.addEventListener("change", beiWechsel);

  return () => {
    liste.removeEventListener("change", beiWechsel);
  };
}

function lesen(): boolean {
  return window.matchMedia(ABFRAGE).matches;
}

/**
 * Meldet, ob der Nutzer Bewegung reduziert haben will.
 *
 * `useSyncExternalStore` und nicht useState+useEffect: die Medienabfrage ist
 * ein externer Speicher. Die Effektvariante setzt beim Mount synchron Zustand
 * und loest damit eine Folgerenderung aus (react-hooks/set-state-in-effect).
 *
 * Der Serverwert ist bewusst `false`: auf dem Server gibt es kein `window`,
 * und ein abweichender erster Clientwert waere eine Hydrationsdifferenz.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(abonniere, lesen, () => false);
}
