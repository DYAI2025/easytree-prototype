"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";
import { useId, useMemo, useRef, useState } from "react";

import { COLOUR_KEYS, colourFor, type ColourKey } from "../../domain/colour-palette";
import { parseLocalDate, type LocalDate } from "../../domain/local-date";
import { applyDayOverrides, deriveDefaultWorkdays } from "../../domain/workday-derivation";
import { Button } from "../primitives/button";
import { DayOverridePicker } from "./day-override-picker";

export interface StepPeriodWerte {
  readonly startDate: string;
  readonly endDate?: string;
  readonly planningHorizonDate?: string;
  readonly colourKey: ColourKey;
  readonly addedDays: readonly string[];
  readonly removedDays: readonly string[];
  /** Die abgeleiteten Tage - der Server rechnet sie neu, die Uebersicht nicht. */
  readonly localDates: readonly string[];
  readonly plannedStartTime?: string;
  readonly plannedEndTime?: string;
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

function istDatum(wert: string): boolean {
  return ISO_DATUM.test(wert);
}

/**
 * Schritt 2: Zeitraum, abgeleitete Tage, Farbe, optionale Uhrzeiten.
 *
 * Die Arbeitstage entstehen aus dem Zeitraum, nicht aus Klicks im Kalender.
 * Der Tagespicker ist zugeklappt und rein optional; er korrigiert die
 * Ableitung, er ersetzt sie nicht.
 *
 * Uhrzeiten sind erst nach ausdruecklicher Aktivierung Teil des Formulars -
 * nicht als leerer String und nicht als 00:00. Ein Einsatz ohne geplante
 * Uhrzeit ist ein gueltiger Einsatz, kein unvollstaendiger.
 */
export function StepPeriod({ onNext }: { readonly onNext: (werte: StepPeriodWerte) => void }) {
  const beginnId = useId();
  const endeId = useId();
  const horizontId = useId();
  const zeitVonId = useId();
  const zeitBisId = useId();
  const horizontFehlerId = useId();

  const [start, setStart] = useState("");
  const [ende, setEnde] = useState("");
  const [endeOffen, setEndeOffen] = useState(false);
  const [horizont, setHorizont] = useState("");
  const [horizontFehler, setHorizontFehler] = useState<string | null>(null);
  const [zeitenAktiv, setZeitenAktiv] = useState(false);
  const [zeitVon, setZeitVon] = useState("08:00");
  const [zeitBis, setZeitBis] = useState("18:00");
  const [farbe, setFarbe] = useState<ColourKey>(COLOUR_KEYS[0]);
  const [pickerOffen, setPickerOffen] = useState(false);
  const [zugewaehlt, setZugewaehlt] = useState<readonly string[]>([]);
  const [abgewaehlt, setAbgewaehlt] = useState<readonly string[]>([]);

  const horizontRef = useRef<HTMLInputElement>(null);

  const bis = endeOffen ? horizont : ende;
  const zeitraumGueltig = istDatum(start) && istDatum(bis) && start <= bis;

  const tage = useMemo<readonly LocalDate[]>(() => {
    if (!zeitraumGueltig) {
      return [];
    }

    const period = { start: parseLocalDate(start), end: parseLocalDate(bis) };
    // Auf den aktuellen Zeitraum begrenzen: eine spaetere Verkuerzung darf
    // keinen Tag stehen lassen, der jetzt draussen liegt (die Domaene wirft
    // dafuer DAY_OUTSIDE_PERIOD).
    const imZeitraum = (wert: string): boolean => wert >= start && wert <= bis;

    return applyDayOverrides(deriveDefaultWorkdays(period), {
      period,
      added: zugewaehlt.filter(imZeitraum).map(parseLocalDate),
      removed: abgewaehlt.filter(imZeitraum).map(parseLocalDate),
    });
  }, [abgewaehlt, bis, start, zeitraumGueltig, zugewaehlt]);

  const ausgewaehlt = useMemo(() => new Set<string>(tage), [tage]);

  const umschalten = (datum: LocalDate): void => {
    if (ausgewaehlt.has(datum)) {
      setZugewaehlt((bisher) => bisher.filter((t) => t !== datum));
      setAbgewaehlt((bisher) => [...bisher, datum]);

      return;
    }

    setAbgewaehlt((bisher) => bisher.filter((t) => t !== datum));
    setZugewaehlt((bisher) => [...bisher, datum]);
  };

  const weiter = (): void => {
    if (endeOffen && !istDatum(horizont)) {
      setHorizontFehler("Bei offenem Ende ist ein Planungshorizont Pflicht.");
      horizontRef.current?.focus();

      return;
    }

    setHorizontFehler(null);

    const werte: Record<string, unknown> = {
      startDate: start,
      colourKey: farbe,
      addedDays: zugewaehlt,
      removedDays: abgewaehlt,
      localDates: tage,
    };

    if (endeOffen) {
      werte.planningHorizonDate = horizont;
    } else {
      werte.endDate = ende;
    }

    // Nur bei Aktivierung ueberhaupt vorhanden - siehe Kommentar oben.
    if (zeitenAktiv) {
      werte.plannedStartTime = zeitVon;
      werte.plannedEndTime = zeitBis;
    }

    onNext(werte as unknown as StepPeriodWerte);
  };

  return (
    <div className="flex flex-col gap-4">
      {/*
        Unter sm untereinander statt nebeneinander (EYT-176).

        Rechnung, nicht Geschmack: ein `input[type=date]` hat eine
        min-content-Breite von 156 px - die drei Segmente plus das
        Kalendersymbol lassen sich nicht weiter stauchen. Zwei davon plus
        gap-4 sind 328 px; der Drawer bietet bei 325 px Viewport aber nur
        325 - 1 (Rahmen) - 32 (p-4) = 292 px. Das Ende-Feld stand deshalb bei
        325 und 320 px mit `right = 345` ausserhalb des sichtbaren Drawers,
        gemessen im Produktionsbuild: `dialog.scrollWidth` 344 gegen
        `clientWidth` 324 bzw. 319.

        `min-w-0` waere hier KEINE Reparatur: die Felder schrumpften dann zwar
        rechnerisch, das Datumsfeld schneidet aber seine eigenen Segmente ab
        und ist unlesbar. Und `overflow-x-hidden` verstecken wuerde den
        Ueberlauf, nicht beheben. Der Umbruch auf eine Spalte ist die
        kleinste Aenderung, die das Feld vollstaendig sichtbar UND bedienbar
        laesst.

        Die Uhrzeitenzeile weiter unten bleibt bewusst unveraendert: ihre
        beiden Felder messen 128,5 und 126,8 px und enden bei 320 px Viewport
        auf `right = 288,3` - also innerhalb der nutzbaren 304 px. Sie ist
        kein Befund, und ohne Befund keine Aenderung.
      */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col gap-1">
          <label htmlFor={beginnId} className="font-medium">
            Beginn
          </label>
          <input
            id={beginnId}
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            /*
             * min-h-11 = 44 CSS-Pixel (WCAG 2.5.5, EYT-176).
             *
             * `p-2` allein ergab 42 px (Text 16 px, Zeilenbox 24, plus 2x8 Innenabstand,
             * plus 2 px Rahmen), ein `select` sogar nur 38. Gemessen im Produktionsbuild
             * bei 375, 325 und 320 px - dieselbe Zahl auf jeder Breite, denn die Hoehe
             * haengt nicht am Viewport. Die Untergrenze steht an jedem Feld dieser Datei;
             * eine eigene Abstraktion fuer einen CSS-Wert waere mehr Apparat als Nutzen.
             */
            className="min-h-11 rounded border border-line bg-surface p-2"
          />
        </div>

        {endeOffen ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={horizontId} className="font-medium">
              Planen bis
            </label>
            <input
              id={horizontId}
              ref={horizontRef}
              type="date"
              value={horizont}
              aria-invalid={horizontFehler === null ? undefined : true}
              aria-describedby={horizontFehler === null ? undefined : horizontFehlerId}
              onChange={(event) => {
                setHorizont(event.target.value);
                setHorizontFehler(null);
              }}
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
            {horizontFehler !== null && (
              <p id={horizontFehlerId} role="alert" className="text-danger-text">
                {horizontFehler}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor={endeId} className="font-medium">
              Ende
            </label>
            <input
              id={endeId}
              type="date"
              value={ende}
              onChange={(event) => setEnde(event.target.value)}
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
          </div>
        )}
      </div>

      {/*
        min-h-11 = 44 CSS-Pixel (WCAG 2.5.5, EYT-176): die beiden Schalter dieses Schritts.

        Die Hoehe sitzt am LABEL, nicht an der Checkbox. Die Checkbox bleibt das
        13x13 grosse Betriebssystemelement; bedient wird die Zeile, die sie
        umschliesst - ein Klick irgendwo darauf schaltet sie. Vorher war diese
        Zeile 24 px hoch, gemessen im Produktionsbuild.
      */}
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={endeOffen}
          onChange={(event) => setEndeOffen(event.target.checked)}
        />
        Ende offen
      </label>

      <p data-testid="arbeitstage" className="font-medium">
        {tage.length} Arbeitstage
      </p>

      <div>
        <Button variant="secondary" onClick={() => setPickerOffen((offen) => !offen)}>
          {pickerOffen ? "Tage anpassen schliessen" : "Tage anpassen (optional)"}
        </Button>
      </div>

      {pickerOffen && zeitraumGueltig && (
        <DayOverridePicker
          start={start}
          ende={bis}
          ausgewaehlt={ausgewaehlt}
          onToggle={umschalten}
        />
      )}

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={zeitenAktiv}
          onChange={(event) => setZeitenAktiv(event.target.checked)}
        />
        Uhrzeiten planen
      </label>

      {zeitenAktiv && (
        <div className="flex gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={zeitVonId} className="font-medium">
              Geplanter Beginn
            </label>
            <input
              id={zeitVonId}
              type="time"
              value={zeitVon}
              onChange={(event) => setZeitVon(event.target.value)}
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={zeitBisId} className="font-medium">
              Geplantes Ende
            </label>
            <input
              id={zeitBisId}
              type="time"
              value={zeitBis}
              onChange={(event) => setZeitBis(event.target.value)}
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
          </div>
        </div>
      )}

      <RadioGroup.Root
        aria-label="Farbe"
        value={farbe}
        onValueChange={(wert) => setFarbe(wert as ColourKey)}
        className="flex flex-wrap gap-2"
      >
        {COLOUR_KEYS.map((key) => (
          <RadioGroup.Item
            key={key}
            value={key}
            aria-label={colourFor(key).label}
            /*
             * Auswahl folgt dem Fokus - das verlangt das ARIA-Muster fuer
             * radiogroup. Radix waehlt beim ERSTEN Pfeildruck nicht mit: der
             * Fokus sprang auf "Ocker", gewaehlt blieb "Moos" (gemessen in
             * TASK-048). Wer mit der Tastatur eine Farbe ansteuert und
             * weitertabbt, haette stumm eine andere Farbe gespeichert.
             */
            onFocus={() => setFarbe(key)}
            className="flex min-h-11 items-center gap-2 rounded border border-line px-2 py-1 data-[state=checked]:border-action"
          >
            <span
              aria-hidden="true"
              style={{ backgroundColor: `var(--eyt-colour-${key}-frame)` }}
              className="h-3 w-3 rounded"
            />
            {colourFor(key).label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>

      <div className="flex justify-end">
        <Button onClick={weiter}>Weiter</Button>
      </div>
    </div>
  );
}
