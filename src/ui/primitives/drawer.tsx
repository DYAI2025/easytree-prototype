"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { usePrefersReducedMotion } from "./use-reduced-motion";

export interface DrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (offen: boolean) => void;
  /** Sichtbare Ueberschrift; sie ist zugleich der Name des Dialogs. */
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

/**
 * Seitlich einfahrender Dialog fuer die Einsatzanlage.
 *
 * Auf Radix Dialog aufgesetzt und nicht selbst gebaut: Fokusfalle,
 * Fokusrueckgabe an den Ausloeser, Esc und `aria-modal` sind dort geloest und
 * gegen echte Screenreader geprueft - eine Eigenbauloesung waere die
 * fehleranfaelligste Stelle der ganzen Oberflaeche.
 *
 * `aria-labelledby` zeigt auf die sichtbare Ueberschrift statt auf einen
 * eigenen unsichtbaren Text: sonst koennen Vorlesetext und Bildschirmtext
 * auseinanderlaufen.
 */
export function Drawer({ open, onOpenChange, title, children, footer }: DrawerProps) {
  const titelId = useId();
  const reduziert = usePrefersReducedMotion();
  const letzterFokus = useRef<HTMLElement | null>(null);
  const warOffen = useRef(false);

  /*
   * Fokusrueckgabe an den Ausloeser - ausdruecklich selbst gemacht.
   *
   * Radix bringt eine eigene Rueckgabe mit, die hier aber messbar nicht
   * greift: nach Esc lag der Fokus auf <body> statt auf dem Ausloeser (auch
   * 200 ms spaeter). Ein Nutzer der Tastatur waere damit am Seitenanfang
   * gelandet. Deshalb merkt sich der Drawer, solange er zu ist, das zuletzt
   * fokussierte Element und stellt es beim Schliessen wieder her - aber nur,
   * wenn der Fokus tatsaechlich ins Leere gefallen ist, damit eine
   * funktionierende Rueckgabe nicht ueberschrieben wird.
   */
  useEffect(() => {
    if (open) {
      warOffen.current = true;

      return;
    }

    const merke = (ereignis: FocusEvent): void => {
      letzterFokus.current = ereignis.target as HTMLElement;
    };

    document.addEventListener("focusin", merke);

    if (warOffen.current) {
      warOffen.current = false;

      const ziel = letzterFokus.current;

      if (ziel !== null && document.body.contains(ziel)) {
        setTimeout(() => {
          if (document.activeElement === document.body) {
            ziel.focus();
          }
        }, 0);
      }
    }

    return () => {
      document.removeEventListener("focusin", merke);
    };
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />
        <Dialog.Content
          aria-labelledby={titelId}
          // Radix warnt ohne Beschreibung; der Drawer traegt seinen Inhalt
          // selbst und braucht keinen zusaetzlichen Fliesstext.
          aria-describedby={undefined}
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
            <Dialog.Close
              className="rounded border border-line px-2 py-1 text-sm"
              aria-label="Dialog schliessen"
            >
              Schliessen
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>

          {footer !== undefined && <div className="flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
