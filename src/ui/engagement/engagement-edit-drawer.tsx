"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";
import { useEffect, useId, useState } from "react";

import type { EngagementDetailDto, EngagementUpdated } from "../../contracts/engagement";
import { COLOUR_KEYS, colourFor, type ColourKey } from "../../domain/colour-palette";
import { ApiProblemError, apiGet, apiPatch } from "../../lib/api-client";
import { Button } from "../primitives/button";
import { Drawer } from "../primitives/drawer";
import { deutschesDatum } from "./engagement-summary";

/**
 * Bearbeitung eines BESTEHENDEN Einsatzes (Confluence 49119274 D-007).
 *
 * Diese Flaeche ist ausdruecklich NICHT die Baustellentagbearbeitung. Sie
 * aendert den Elternkontext: Titel, Beschreibung, Farbe - und sie verlaengert
 * den Einsatz nach vorn. Was sie nicht kann, fehlt hier gar nicht erst:
 * Startdatum, Baustelle und Verkuerzung stehen nicht im Vertrag
 * (`UpdateEngagementCommand`) und deshalb auch in keinem Feld.
 *
 * Der Satz ueber der Zeitraumzeile ist Pflicht und keine Dekoration: eine
 * Verlaengerung sieht aus wie eine Massenaenderung, ist aber genau das
 * Gegenteil - bestehende Tage bleiben unangetastet, es kommen nur neue dazu
 * (Invariante 12). Wer das nicht liest, koennte den Knopf fuer gefaehrlicher
 * halten, als er ist, oder fuer harmloser.
 *
 * Die optimistische Sperre laeuft ueber `expectedUpdatedAt`. Der Wert kommt
 * ausschliesslich aus dem Readback und wird nie im Client gebaut.
 */
export const VERLAENGERUNGSHINWEIS =
  "Bestehende Baustellentage bleiben unverändert; zusätzliche Tage werden ergänzt.";

export const KONFLIKT_TEXT =
  "Zwischenzeitlich geändert: dieser Einsatz wurde von anderer Stelle verändert. Bitte neu laden und die Änderung erneut prüfen.";

export interface EngagementEditDrawerProps {
  readonly engagementId: string;
  /** Heutiges lokales Datum der Servertruth, nicht die Browserzeit. */
  readonly today: string;
  readonly onClose: () => void;
  /** Erst nach der Serverbestaetigung - mit dem Titel und der Zahl NEUER Tage. */
  readonly onSaved: (titel: string, anzahlNeueTage: number) => void;
}

interface Entwurf {
  readonly title: string;
  readonly description: string;
  readonly colourKey: ColourKey;
  /** Enddatum oder Planungshorizont - welches, entscheidet der Einsatz. */
  readonly periodDate: string;
}

function entwurfAus(detail: EngagementDetailDto): Entwurf {
  return {
    title: detail.title,
    description: detail.description ?? "",
    colourKey: detail.colourKey as ColourKey,
    periodDate: detail.endDate ?? detail.planningHorizonDate ?? "",
  };
}

export function EngagementEditDrawer({
  engagementId,
  today,
  onClose,
  onSaved,
}: EngagementEditDrawerProps) {
  const titelId = useId();
  const beschreibungId = useId();
  const zeitraumId = useId();
  const hinweisId = useId();

  const [detail, setDetail] = useState<EngagementDetailDto | null>(null);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<{ code: string; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [ladezaehler, setLadezaehler] = useState(0);

  useEffect(() => {
    let abgebrochen = false;

    const laden = async (): Promise<void> => {
      try {
        const geladen = await apiGet<EngagementDetailDto>(`/api/einsaetze/${engagementId}`);

        if (abgebrochen) {
          return;
        }

        setDetail(geladen);
        setEntwurf(entwurfAus(geladen));
        setLadefehler(null);
        setFehler(null);
      } catch {
        if (!abgebrochen) {
          setLadefehler("Der Einsatz konnte nicht geladen werden.");
        }
      }
    };

    void laden();

    return () => {
      abgebrochen = true;
    };
  }, [engagementId, ladezaehler]);

  const istOffen = detail !== null && detail.endDate === null;
  const bisherigesEnde =
    detail === null ? "" : (detail.endDate ?? detail.planningHorizonDate ?? "");

  /*
   * Untergrenze des Datumsfeldes: nie vor dem bisherigen Ende (das waere eine
   * Verkuerzung) und nie vor heute (das waere ein neuer Tag in der
   * Vergangenheit). Beide Regeln bleiben serverseitig verbindlich - das Feld
   * erklaert sie nur vorab, statt den Nutzer in einen 422 laufen zu lassen.
   */
  const fruehestes = bisherigesEnde > today ? bisherigesEnde : today;

  const speichern = async (): Promise<void> => {
    if (detail === null || entwurf === null) {
      return;
    }

    setLaeuft(true);
    setFehler(null);

    const koerper: Record<string, unknown> = {
      expectedUpdatedAt: detail.updatedAt,
      title: entwurf.title,
      colourKey: entwurf.colourKey,
    };

    /*
     * Beschreibung: drei Zustaende, nicht zwei. Ein weggelassenes Feld heisst
     * serverseitig "unveraendert" - wer den Text loescht, braucht deshalb ein
     * ausdrueckliches `null`. Vorher fehlte der Schluessel beim Leeren: das
     * Speichern meldete Erfolg, und der Reload holte den alten Text zurueck.
     *
     * Unveraendert bleibt zugleich unveraendert. Ein Titelwechsel ist keine
     * Aussage ueber die Beschreibung und loest an ihr keine Mutation aus -
     * verglichen wird deshalb getrimmt gegen die Servertruth, nicht gegen "".
     */
    const bisherigeBeschreibung = detail.description ?? "";

    if (entwurf.description.trim() !== bisherigeBeschreibung.trim()) {
      koerper.description = entwurf.description.trim() === "" ? null : entwurf.description;
    }

    // Der Zeitraum reist NUR mit, wenn er sich geaendert hat. Sonst waere jeder
    // Titelwechsel zugleich eine Zeitraumaussage.
    if (entwurf.periodDate !== "" && entwurf.periodDate !== bisherigesEnde) {
      if (istOffen) {
        koerper.planningHorizonDate = entwurf.periodDate;
      } else {
        koerper.endDate = entwurf.periodDate;
      }
    }

    try {
      const ergebnis = await apiPatch<EngagementUpdated>(`/api/einsaetze/${engagementId}`, koerper);

      // Erst JETZT - vorher ist nichts bestaetigt. Die Zahl kommt aus der
      // Antwort, nicht aus einer Differenz zweier Datumsfelder.
      onSaved(entwurf.title, ergebnis.addedWorksiteDayIds.length);
    } catch (ursache) {
      const code = ursache instanceof ApiProblemError ? ursache.code : "UNEXPECTED_ERROR";

      setFehler({
        code,
        text:
          code === "ENGAGEMENT_VERSION_CONFLICT"
            ? KONFLIKT_TEXT
            : ursache instanceof ApiProblemError
              ? ursache.title
              : "Die Änderung konnte nicht gespeichert werden.",
      });
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(offen) => {
        if (!offen) {
          onClose();
        }
      }}
      title="Einsatz bearbeiten"
    >
      {ladefehler !== null && <p role="alert">{ladefehler}</p>}

      {detail === null && ladefehler === null && <p role="status">Einsatz wird geladen ...</p>}

      {detail !== null && entwurf !== null && (
        <>
          <div
            data-testid="einsatzkopf"
            data-engagement-id={detail.id}
            className="flex flex-col gap-1"
          >
            <p className="text-ink-muted">
              {detail.worksiteName} · {detail.customerName}
            </p>
            <p>
              Beginn {deutschesDatum(detail.startDate)} · {detail.days.length}{" "}
              {detail.days.length === 1 ? "Baustellentag" : "Baustellentage"}
            </p>
          </div>

          {fehler !== null && (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 rounded border border-line bg-danger-bg p-3 text-danger-text"
            >
              <p>{fehler.text}</p>
              {fehler.code === "ENGAGEMENT_VERSION_CONFLICT" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Ausdrueckliches Nachladen: dieser Drawer holt seine
                    // Wahrheit selbst und bliebe sonst mit dem alten Token stehen.
                    setLadezaehler((n) => n + 1);
                  }}
                >
                  Neu laden
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor={titelId} className="font-medium">
              Titel
            </label>
            <input
              id={titelId}
              value={entwurf.title}
              disabled={laeuft}
              onChange={(event) =>
                setEntwurf((bisher) =>
                  bisher === null ? bisher : { ...bisher, title: event.target.value },
                )
              }
              // min-h-11 = 44 CSS-Pixel (WCAG 2.5.5, EYT-176).
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={beschreibungId} className="font-medium">
              Beschreibung
            </label>
            <textarea
              id={beschreibungId}
              value={entwurf.description}
              disabled={laeuft}
              onChange={(event) =>
                setEntwurf((bisher) =>
                  bisher === null ? bisher : { ...bisher, description: event.target.value },
                )
              }
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={zeitraumId} className="font-medium">
              {istOffen ? "Planen bis" : "Ende"}
            </label>
            <input
              id={zeitraumId}
              type="date"
              value={entwurf.periodDate}
              min={fruehestes}
              disabled={laeuft}
              aria-describedby={hinweisId}
              onChange={(event) =>
                setEntwurf((bisher) =>
                  bisher === null ? bisher : { ...bisher, periodDate: event.target.value },
                )
              }
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
            <p id={hinweisId} data-testid="verlaengerungshinweis" className="text-ink-muted">
              {VERLAENGERUNGSHINWEIS}
            </p>
          </div>

          <RadioGroup.Root
            aria-label="Farbe"
            value={entwurf.colourKey}
            disabled={laeuft}
            onValueChange={(wert) =>
              setEntwurf((bisher) =>
                bisher === null ? bisher : { ...bisher, colourKey: wert as ColourKey },
              )
            }
            className="flex flex-wrap gap-2"
          >
            {COLOUR_KEYS.map((key) => (
              <RadioGroup.Item
                key={key}
                value={key}
                aria-label={colourFor(key).label}
                /*
                 * Auswahl folgt dem Fokus - ARIA-Muster fuer radiogroup. Radix
                 * waehlt beim ERSTEN Pfeildruck sonst nicht mit (gemessen in
                 * TASK-048); dieselbe Reparatur wie in `step-period.tsx`.
                 */
                onFocus={() =>
                  setEntwurf((bisher) => (bisher === null ? bisher : { ...bisher, colourKey: key }))
                }
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

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={laeuft}>
              Abbrechen
            </Button>
            <Button onClick={() => void speichern()} disabled={laeuft}>
              Speichern
            </Button>
          </div>
        </>
      )}
    </Drawer>
  );
}
