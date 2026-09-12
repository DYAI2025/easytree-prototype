"use client";

import { useId, useRef, useState } from "react";

import type { GeocodeCandidateDto, GeocodeResultDto } from "../../contracts/geocoding";
import { ApiProblemError, apiPost } from "../../lib/api-client";
import { Button } from "../primitives/button";

/**
 * Adresssuche fuer Baustellen (REQ-F-018, REQ-NF-006).
 *
 * Die Suche laeuft AUSSCHLIESSLICH ueber die eigene Route `/api/geocoding/suche`
 * - der Browser spricht nie mit einem Adressdienst. Und sie laeuft nur auf
 * ausdrueckliche Auswertung (Knopf oder Enter), nie bei jedem Tastendruck: das
 * verbietet die Nutzungsbedingung des Dienstes, und ein Test sichert es ab.
 *
 * Der Name des Providers steht bewusst NIRGENDS als Literal in dieser Datei.
 * `geocoder.test.ts` prueft per `git grep`, dass er ausserhalb der
 * Serverschicht nicht vorkommt; die Beschriftung entsteht deshalb zur Laufzeit
 * aus dem Wert, den der Server liefert.
 */
const QUELLEN_LABEL: Readonly<Record<string, string>> = {
  manual: "manuell",
  fixture: "Fixture (Prototyp, erfundene Koordinaten)",
};

export function quelleLabel(source: string): string {
  return QUELLEN_LABEL[source] ?? `${source} (Entwicklungsadapter)`;
}

export interface AddressSearchValue {
  readonly addressLine: string;
  readonly postalCode: string;
  readonly city: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly geocodeSource: string | null;
}

export interface AddressSearchProps {
  readonly value: AddressSearchValue;
  readonly onChange: (wert: AddressSearchValue) => void;
}

type Zustand =
  | { readonly art: "leer" }
  | { readonly art: "laedt" }
  | { readonly art: "treffer"; readonly kandidaten: readonly GeocodeCandidateDto[] }
  | { readonly art: "keine" }
  | { readonly art: "fehler"; readonly text: string };

export function AddressSearch({ value, onChange }: AddressSearchProps) {
  const sucheId = useId();
  const listenId = useId();
  const adresseId = useId();
  const plzId = useId();
  const ortId = useId();

  const [suche, setSuche] = useState("");
  const [zustand, setZustand] = useState<Zustand>({ art: "leer" });
  const [aktiv, setAktiv] = useState(0);
  const [manuell, setManuell] = useState(false);
  const listeRef = useRef<HTMLUListElement>(null);

  const suchen = async (): Promise<void> => {
    const anfrage = suche.trim();

    if (anfrage === "") {
      return;
    }

    setZustand({ art: "laedt" });
    setAktiv(0);

    try {
      const ergebnis = await apiPost<GeocodeResultDto>("/api/geocoding/suche", { query: anfrage });

      setZustand(
        ergebnis.candidates.length === 0
          ? { art: "keine" }
          : { art: "treffer", kandidaten: ergebnis.candidates },
      );
    } catch (ursache) {
      // Der nicht konfigurierte Provider ist KEIN Ausfall, sondern der
      // Auslieferstand. Beide Faelle brauchen denselben Ausweg, aber nicht
      // denselben Satz - sonst sucht jemand einen Fehler, den es nicht gibt.
      setZustand({
        art: "fehler",
        text:
          ursache instanceof ApiProblemError && ursache.code === "GEOCODER_NOT_CONFIGURED"
            ? "Kein Geocoding-Provider konfiguriert. Adresse bitte manuell eingeben."
            : "Die Adresssuche ist gerade nicht erreichbar. Adresse bitte manuell eingeben.",
      });
    }
  };

  const uebernehmen = (kandidat: GeocodeCandidateDto): void => {
    onChange({
      addressLine: kandidat.addressLine,
      postalCode: kandidat.postalCode ?? "",
      city: kandidat.city ?? "",
      lat: kandidat.lat,
      lng: kandidat.lng,
      geocodeSource: kandidat.source,
    });
    setZustand({ art: "leer" });
  };

  /** Manuelle Eingabe: Koordinaten fallen weg, die Quelle wird ehrlich benannt. */
  const manuellSetzen = (teil: Partial<AddressSearchValue>): void => {
    onChange({
      addressLine: value.addressLine,
      postalCode: value.postalCode,
      city: value.city,
      ...teil,
      lat: null,
      lng: null,
      geocodeSource: "manual",
    });
  };

  const tastatur = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    if (zustand.art !== "treffer") {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAktiv((bisher) => Math.min(bisher + 1, zustand.kandidaten.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setAktiv((bisher) => Math.max(bisher - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const kandidat = zustand.kandidaten[aktiv];

      if (kandidat !== undefined) {
        uebernehmen(kandidat);
      }
    }
  };

  const manuellKnopf = (
    <Button variant="secondary" onClick={() => setManuell(true)}>
      Adresse manuell eingeben
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={sucheId} className="font-medium">
          Adresse
        </label>
        <div className="flex gap-2">
          <input
            id={sucheId}
            type="search"
            value={suche}
            onChange={(event) => setSuche(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Ein <form> darf hier nicht abgesendet werden: die Suche ist
                // ein Zwischenschritt, nicht das Speichern der Baustelle.
                event.preventDefault();
                void suchen();
              }
            }}
            /*
             * min-h-11 = 44 CSS-Pixel (WCAG 2.5.5, EYT-176).
             *
             * `p-2` allein ergab 42 px (Text 16 px, Zeilenbox 24, plus 2x8 Innenabstand,
             * plus 2 px Rahmen), ein `select` sogar nur 38. Gemessen im Produktionsbuild
             * bei 375, 325 und 320 px - dieselbe Zahl auf jeder Breite, denn die Hoehe
             * haengt nicht am Viewport. Die Untergrenze steht an jedem Feld dieser Datei;
             * eine eigene Abstraktion fuer einen CSS-Wert waere mehr Apparat als Nutzen.
             */
            className="flex-1 min-h-11 rounded border border-line bg-surface p-2"
          />
          <Button onClick={() => void suchen()} disabled={zustand.art === "laedt"}>
            Adresse suchen
          </Button>
        </div>
        <p className="text-ink-muted">
          Die Suche laeuft ueber den Server und startet erst auf Knopfdruck oder Enter - nicht bei
          jedem Tastendruck.
        </p>
      </div>

      {zustand.art === "laedt" && <p role="status">Adresse wird gesucht ...</p>}

      {zustand.art === "treffer" && (
        <ul
          ref={listeRef}
          role="listbox"
          aria-label="Suchergebnisse"
          aria-activedescendant={`${listenId}-${aktiv}`}
          tabIndex={0}
          onKeyDown={tastatur}
          className="flex flex-col rounded border border-line"
        >
          {zustand.kandidaten.map((kandidat, index) => (
            <li
              key={`${kandidat.label}-${index}`}
              id={`${listenId}-${index}`}
              role="option"
              aria-selected={index === aktiv}
              onClick={() => uebernehmen(kandidat)}
              className="cursor-pointer p-2 aria-selected:bg-canvas"
            >
              {kandidat.label}
            </li>
          ))}
        </ul>
      )}

      {zustand.art === "keine" && (
        <div className="flex flex-col items-start gap-2">
          <p>Keine Treffer zu dieser Adresse.</p>
          {manuellKnopf}
        </div>
      )}

      {zustand.art === "fehler" && (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="rounded border border-line bg-danger-bg p-3 text-danger-text">
            {zustand.text}
          </p>
          {manuellKnopf}
        </div>
      )}

      {value.addressLine !== "" && !manuell && (
        <div className="rounded border border-line p-3">
          <p className="font-medium">{value.addressLine}</p>
          <p className="text-ink-muted">
            {value.postalCode} {value.city}
          </p>
          <p className="text-ink-muted">
            {value.lat === null || value.lng === null
              ? "Keine Koordinaten"
              : `Koordinaten ${value.lat}, ${value.lng}`}
            {value.geocodeSource !== null && ` · Quelle: ${quelleLabel(value.geocodeSource)}`}
          </p>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => setManuell(true)}>
              Manuell bearbeiten
            </Button>
          </div>
        </div>
      )}

      {!manuell && zustand.art === "leer" && value.addressLine === "" && (
        <div className="flex items-start">{manuellKnopf}</div>
      )}

      {manuell && (
        <div className="flex flex-col gap-2 rounded border border-line p-3">
          <p className="text-ink-muted">
            Manuelle Eingabe: die Baustelle wird ohne Koordinaten gespeichert. Das ist ein gueltiger
            Zustand, kein Fehler.
          </p>

          <label htmlFor={adresseId} className="font-medium">
            Adresse (manuell)
          </label>
          <input
            id={adresseId}
            value={value.addressLine}
            onChange={(event) => manuellSetzen({ addressLine: event.target.value })}
            className="min-h-11 rounded border border-line bg-surface p-2"
          />

          <label htmlFor={plzId} className="font-medium">
            Postleitzahl (manuell)
          </label>
          <input
            id={plzId}
            value={value.postalCode}
            onChange={(event) => manuellSetzen({ postalCode: event.target.value })}
            className="min-h-11 rounded border border-line bg-surface p-2"
          />

          <label htmlFor={ortId} className="font-medium">
            Ort (manuell)
          </label>
          <input
            id={ortId}
            value={value.city}
            onChange={(event) => manuellSetzen({ city: event.target.value })}
            className="min-h-11 rounded border border-line bg-surface p-2"
          />

          <div className="flex items-start">
            <Button variant="secondary" onClick={() => setManuell(false)}>
              Zurueck zur Suche
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
