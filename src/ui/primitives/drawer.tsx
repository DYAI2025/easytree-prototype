"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useRef, type ReactNode } from "react";

import { Button } from "./button";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export interface DrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (offen: boolean) => void;
  /** Sichtbare Ueberschrift; sie ist zugleich der Name des Dialogs. */
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /**
   * Ersatzziel der Fokusrueckgabe fuer den Fall, dass der Ausloeser das
   * Schliessen nicht ueberlebt.
   *
   * Wird ERST gefragt, wenn der gemerkte Ausloeser nicht mehr im Dokument steht
   * oder den Fokus nicht annimmt - nie als Regelweg. Und erst beim Schliessen
   * aufgeloest, nicht beim Oeffnen: das Ersatzziel entsteht in manchen Faellen
   * ueberhaupt erst durch das Schliessen.
   */
  readonly restoreFocusFallback?: () => HTMLElement | null;
}

/**
 * Fokussiert ein Ziel und MELDET, ob es geklappt hat.
 *
 * Die Rueckmeldung ist der Kern und kein Luxus: `focus()` auf einem Element,
 * das gerade `display:none` traegt - etwa die Desktop-Tageskarte unterhalb des
 * md-Umbruchs - tut kommentarlos nichts. Ohne Nachmessen haette der Drawer den
 * Fokus fuer gesetzt gehalten, waehrend er auf `<body>` liegen blieb: genau der
 * Zustand, den EYT-174 beseitigt. So entscheidet die Messung, nicht die
 * Annahme, ob der Ersatzweg gebraucht wird - unabhaengig von Viewport und
 * Eingabegeraet.
 */
function fokussiere(ziel: HTMLElement | null): boolean {
  if (ziel === null || !ziel.isConnected) {
    return false;
  }

  // preventScroll wie bei Radix: die Rueckgabe darf die Kalenderposition nicht
  // verschieben (dieselbe Ueberlegung wie `scroll: false` beim Navigieren).
  ziel.focus({ preventScroll: true });

  return document.activeElement === ziel;
}

/**
 * Seitlich einfahrender Dialog fuer die Einsatzanlage.
 *
 * Auf Radix Dialog aufgesetzt und nicht selbst gebaut: Fokusfalle, Esc und
 * `aria-modal` sind dort geloest und gegen echte Screenreader geprueft - eine
 * Eigenbauloesung waere die fehleranfaelligste Stelle der ganzen Oberflaeche.
 *
 * Die Fokusrueckgabe an den Ausloeser gehoert AUSDRUECKLICH nicht dazu: Radix
 * erledigt sie nur fuer einen `<Dialog.Trigger>`, den es hier nicht gibt. Der
 * Kommentar am `return` unten sagt genau, woran das liegt.
 *
 * `aria-labelledby` zeigt auf die sichtbare Ueberschrift statt auf einen
 * eigenen unsichtbaren Text: sonst koennen Vorlesetext und Bildschirmtext
 * auseinanderlaufen.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  restoreFocusFallback,
}: DrawerProps) {
  const titelId = useId();
  const reduziert = usePrefersReducedMotion();
  /** Das Element, das GENAU DIESEN Drawer geoeffnet hat. */
  const ausloeser = useRef<HTMLElement | null>(null);

  /*
   * Fokusrueckgabe an den Ausloeser (EYT-174 / UX-081 / UX-082).
   *
   * Warum sie nicht von allein funktioniert - nachgelesen im installierten
   * Radix, nicht vermutet:
   *
   * 1. `react-dialog@1.1.23` haengt an jeden modalen Inhalt
   *    `onCloseAutoFocus: (event) => { event.preventDefault();
   *    context.triggerRef.current?.focus(); }`.
   * 2. `triggerRef` fuellt ausschliesslich `<Dialog.Trigger>`. Dieser Drawer
   *    hat keinen: geoeffnet wird er von einer Tageskarte ueber eine
   *    NAVIGATION (B-05), nicht von einem Radix-Trigger. `triggerRef.current`
   *    ist also `null` und der `?.focus()`-Aufruf verpufft.
   * 3. Das `preventDefault()` davor hat aber bereits den Rueckfall von
   *    `react-focus-scope` abgeschaltet, der sonst
   *    `focus(previouslyFocusedElement ?? document.body)` gerufen haette.
   *
   * Ergebnis: niemand setzt den Fokus, er bleibt liegen, wo das Entfernen des
   * Drawers ihn hat fallen lassen - auf `document.body`. Genau das hat der
   * Live-QA-Lauf QA-2026-09-09-01 gemessen, fuer Maus und Tastatur.
   *
   * Die frueher hier stehende Eigenloesung konnte das nicht auffangen: sie lief
   * nur bei einem Render mit `open === false`. Im Produkt gibt es den nicht -
   * alle vier Drawer uebergeben das literale `open` und werden von ihrem
   * Elternteil AUS DEM BAUM genommen. Der Code war damit tot und nur im Test
   * gruen, der den Drawer stehen liess.
   *
   * Der Ersatz nutzt die beiden Stellen, die Radix selbst dafuer vorsieht:
   * `onOpenAutoFocus` feuert, BEVOR der Fokus in den Drawer wandert - dort
   * steht er noch auf dem echten Ausloeser. `onCloseAutoFocus` feuert nach dem
   * Entfernen des Drawers, also nachdem der Kalender bereits neu gerendert ist.
   * Kein `setTimeout`, kein Abwarten auf gut Glueck.
   */
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />
        <Dialog.Content
          aria-labelledby={titelId}
          // Radix warnt ohne Beschreibung; der Drawer traegt seinen Inhalt
          // selbst und braucht keinen zusaetzlichen Fliesstext.
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            const aktiv = document.activeElement;

            // Kein preventDefault: Radix setzt den ersten Fokus weiterhin
            // selbst in den Drawer - die Fokusfalle bleibt unangetastet.
            ausloeser.current =
              aktiv instanceof HTMLElement &&
              aktiv !== document.body &&
              aktiv !== document.documentElement
                ? aktiv
                : null;
          }}
          onCloseAutoFocus={(event) => {
            // Erst der echte Ausloeser, dann - nur falls der das Schliessen
            // nicht ueberlebt hat - das benannte Ersatzziel des Aufrufers.
            // Kein Suchlauf ueber das Dokument, keine "irgendeine erste Karte".
            if (fokussiere(ausloeser.current) || fokussiere(restoreFocusFallback?.() ?? null)) {
              // Haelt Radix davon ab, den Fokus gleich wieder auf seinen
              // (hier nicht existierenden) Trigger umzubiegen.
              event.preventDefault();
            }
          }}
          data-bewegung={reduziert ? "reduziert" : "voll"}
          className={[
            "fixed inset-y-0 right-0 flex w-full max-w-md flex-col gap-4",
            "overflow-y-auto border-l border-line bg-surface p-4 shadow-lg",
            // Die Klasse faellt weg statt nur wirkungslos zu sein: eine
            // Transition, die per CSS auf 0.01ms gesetzt ist, bleibt eine
            // Transition und feuert weiterhin Ereignisse.
            reduziert ? "" : "transition-transform duration-200",
          ]
            .filter((teil) => teil !== "")
            .join(" ")}
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title id={titelId} className="text-lg font-medium">
              {title}
            </Dialog.Title>
            {/*
              Ueber das Primitive, nicht daneben (EYT-176).

              Die 44-px-Untergrenze aus TASK-048 lebt in `buttonVariants`. Dieser
              Knopf war ein nacktes `Dialog.Close` mit eigenen Klassen und hat sie
              deshalb nie gesehen: `px-2 py-1 text-sm` ergab gemessene 87,2x30 px -
              in JEDEM Drawer, auf jedem Viewport. Genau das hat QA-2026-09-09-01
              gefunden. Der Grund war also nicht das Primitive, sondern dass es
              hier fehlte; die Reparatur ist, es zu benutzen, statt die Zahl 44 an
              einer weiteren Stelle zu wiederholen.

              `asChild` haelt Radix-Verhalten und Zugangsname unveraendert: die
              Rolle bleibt `button`, das aria-label bleibt "Dialog schliessen",
              und der Klick schliesst weiterhin genau diesen Dialog.
            */}
            <Dialog.Close asChild>
              <Button variant="secondary" aria-label="Dialog schliessen">
                Schliessen
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>

          {footer !== undefined && <div className="flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
