"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { DAY_CHANGE_SCOPES } from "../../contracts/day-change";
import type { Employee } from "../../contracts/employee";
import type { Resource } from "../../contracts/resource";
import type { WorksiteDayDetailDto } from "../../contracts/worksite-days";
import { parseLocalDate } from "../../domain/local-date";
import { ApiProblemError, apiGet, apiPost } from "../../lib/api-client";
import { formatiereDatumLang } from "../calendar/date-labels";
import { Button } from "../primitives/button";
import { Drawer } from "../primitives/drawer";
import type { SeriesNamen } from "./series-preview-dialog";

/**
 * Tagesbearbeitung eines Baustellentags (REQ-F-015, REQ-F-017, REQ-F-014).
 *
 * Drei Regeln stecken in dieser Fläche und keine davon ist Kosmetik:
 *
 * 1. Es gibt GENAU ZWEI Scopes. Eine dritte Option "gesamter Einsatz" ist
 *    HUMAN_INPUT_REQUIRED (H-02) und wird hier nicht still eingefuehrt.
 * 2. Vergangene Tage sind sichtbar, aber gesperrt (A-07, H-06). Die Sperre ist
 *    serverseitig verbindlich (422 DAY_IN_PAST_LOCKED); die Oberflaeche
 *    erklaert sie nur, statt sie zu verschweigen.
 * 3. Die Revision ist eine optimistische Sperre. Laeuft sie ins Leere, wird
 *    NICHT stumm ueberschrieben, sondern neu geladen.
 */
export const SCOPE_LABELS: Readonly<Record<(typeof DAY_CHANGE_SCOPES)[number], string>> = {
  ONLY_THIS_DAY: "Nur dieser Tag",
  THIS_AND_FOLLOWING: "Dieser und folgende Tage dieses Einsatzes",
};

export const VERGANGENHEIT_TEXT =
  "Dieser Tag liegt vor dem heutigen Datum. Rueckwirkende Aenderungen sind noch nicht freigegeben (Produktentscheidung offen).";

export interface DayChangeEntwurf {
  readonly employeeIds: readonly string[];
  readonly resourceIds: readonly string[];
  readonly plannedStartTime: string | null;
  readonly plannedEndTime: string | null;
  readonly note: string;
}

export interface DayDrawerProps {
  readonly worksiteDayId: string;
  /** Heutiges lokales Datum der Servertruth, nicht die Browserzeit. */
  readonly today: string;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  /**
   * Fuer den Scope "dieser und folgende Tage": statt direkt zu speichern wird
   * die Vorschau geoeffnet (TASK-044). Fehlt der Aufrufer, bleibt nur der
   * Tagesscope nutzbar.
   */
  /** Zweitrangige Aktion aus 6.5: die Kosten sind nie die Startflaeche. */
  readonly onShowCosts?: (engagementId: string, engagementTitle: string) => void;
  readonly onSeriesPreview?: (
    entwurf: DayChangeEntwurf,
    detail: WorksiteDayDetailDto,
    namen: SeriesNamen,
  ) => void;
  /**
   * Ersatzziel der Fokusrueckgabe (EYT-174). Unterhalb des md-Umbruchs oeffnet
   * die Karte der Tagesliste diesen Drawer, und die Liste verschwindet beim
   * Schliessen mit - der Ausloeser existiert dann nicht mehr. Der Drawer fragt
   * das hier nur in diesem Fall.
   */
  readonly restoreFocusFallback?: () => HTMLElement | null;
}

/** `HH:MM:SS` aus der Datenbank vs. `HH:MM` im Zeitfeld - hier gekuerzt. */
function zeitFuerFeld(wert: string | null): string {
  return wert === null ? "" : wert.slice(0, 5);
}

function gleicheMenge(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export function DayDrawer({
  worksiteDayId,
  today,
  onClose,
  onSaved,
  onShowCosts,
  onSeriesPreview,
  restoreFocusFallback,
}: DayDrawerProps) {
  const hinweisId = useId();
  const beginnId = useId();
  const endeId = useId();
  const scopeName = useId();

  const [detail, setDetail] = useState<WorksiteDayDetailDto | null>(null);
  const [employees, setEmployees] = useState<readonly Employee[]>([]);
  const [resources, setResources] = useState<readonly Resource[]>([]);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<DayChangeEntwurf | null>(null);
  const [scope, setScope] = useState<(typeof DAY_CHANGE_SCOPES)[number]>("ONLY_THIS_DAY");
  const [fehler, setFehler] = useState<{ code: string; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [ladezaehler, setLadezaehler] = useState(0);

  useEffect(() => {
    let abgebrochen = false;

    const laden = async (): Promise<void> => {
      try {
        const [tag, leute, mittel] = await Promise.all([
          apiGet<WorksiteDayDetailDto>(`/api/baustellentage/${worksiteDayId}`),
          apiGet<{ items: Employee[] }>("/api/mitarbeitende"),
          apiGet<{ items: Resource[] }>("/api/ressourcen"),
        ]);

        if (abgebrochen) {
          return;
        }

        setDetail(tag);
        setEmployees(leute.items);
        setResources(mittel.items);
        setEntwurf({
          employeeIds: tag.employees.map((p) => p.id),
          resourceIds: tag.resources.map((r) => r.id),
          plannedStartTime: tag.plannedStartTime,
          plannedEndTime: tag.plannedEndTime,
          note: tag.note ?? "",
        });
        setFehler(null);
      } catch {
        if (!abgebrochen) {
          setLadefehler("Der Baustellentag konnte nicht geladen werden.");
        }
      }
    };

    void laden();

    return () => {
      abgebrochen = true;
    };
  }, [worksiteDayId, ladezaehler]);

  const vergangen = detail !== null && detail.localDate < today;

  const geaendert = useMemo(() => {
    if (detail === null || entwurf === null) {
      return false;
    }

    return (
      !gleicheMenge(
        entwurf.employeeIds,
        detail.employees.map((p) => p.id),
      ) ||
      !gleicheMenge(
        entwurf.resourceIds,
        detail.resources.map((r) => r.id),
      ) ||
      zeitFuerFeld(entwurf.plannedStartTime) !== zeitFuerFeld(detail.plannedStartTime) ||
      zeitFuerFeld(entwurf.plannedEndTime) !== zeitFuerFeld(detail.plannedEndTime) ||
      entwurf.note !== (detail.note ?? "")
    );
  }, [detail, entwurf]);

  const umschalten = (id: string, feld: "employeeIds" | "resourceIds"): void => {
    setEntwurf((bisher) => {
      if (bisher === null) {
        return bisher;
      }

      const menge = bisher[feld];

      return {
        ...bisher,
        [feld]: menge.includes(id) ? menge.filter((v) => v !== id) : [...menge, id],
      };
    });
  };

  const speichern = async (): Promise<void> => {
    if (detail === null || entwurf === null) {
      return;
    }

    if (scope === "THIS_AND_FOLLOWING") {
      onSeriesPreview?.(entwurf, detail, {
        employees: employees.map((p) => ({ id: p.id, name: p.displayName })),
        resources: resources.map((r) => ({ id: r.id, name: r.name })),
      });

      return;
    }

    setLaeuft(true);
    setFehler(null);

    try {
      await apiPost(`/api/baustellentage/${detail.worksiteDayId}/aenderungen`, {
        scope,
        expectedRevisionNo: detail.revisionNo,
        changes: {
          employeeIds: [...entwurf.employeeIds],
          resourceIds: [...entwurf.resourceIds],
          plannedStartTime: entwurf.plannedStartTime,
          plannedEndTime: entwurf.plannedEndTime,
          ...(entwurf.note === "" ? {} : { note: entwurf.note }),
        },
        includeAdjustedDayIds: [],
      });

      onSaved();
    } catch (ursache) {
      const code = ursache instanceof ApiProblemError ? ursache.code : "UNEXPECTED_ERROR";

      setFehler({
        code,
        text:
          code === "STALE_REVISION"
            ? "Zwischenzeitlich geaendert: dieser Tag wurde von anderer Stelle veraendert. Bitte neu laden und die Aenderung erneut vornehmen."
            : ursache instanceof ApiProblemError
              ? ursache.title
              : "Die Aenderung konnte nicht gespeichert werden.",
      });
    } finally {
      setLaeuft(false);
    }
  };

  const gesperrt = vergangen || laeuft;

  return (
    <Drawer
      open
      onOpenChange={(offen) => {
        if (!offen) {
          onClose();
        }
      }}
      restoreFocusFallback={restoreFocusFallback}
      title="Baustellentag"
    >
      {ladefehler !== null && <p role="alert">{ladefehler}</p>}

      {detail === null && ladefehler === null && (
        <p role="status">Baustellentag wird geladen ...</p>
      )}

      {detail !== null && entwurf !== null && (
        <>
          <div
            data-testid="tageskopf"
            // Die Identitaet des Baustellentags steht im DOM, damit ein Test die
            // aus der URL rekonstruierte Ansicht gegen die Server-ID pruefen
            // kann statt nur gegen Titel und Datum (B-05).
            data-worksite-day-id={detail.worksiteDayId}
            className="flex flex-col gap-1"
          >
            <p className="font-medium">{formatiereDatumLang(parseLocalDate(detail.localDate))}</p>
            <p>
              <span
                aria-hidden="true"
                className="mr-2 inline-block h-3 w-3 rounded-sm align-middle"
                style={{ backgroundColor: `var(--eyt-colour-${detail.colourKey}-fill)` }}
              />
              {detail.engagementTitle}
            </p>
            <p className="text-ink-muted">
              {detail.worksiteName} · {detail.customerName}
            </p>
            <p>
              <span className="rounded border border-line px-2 py-0.5">
                Revision {detail.revisionNo}
              </span>
              {detail.origin === "day_edit" && (
                <span className="ml-2 rounded border border-line px-2 py-0.5">
                  individuell angepasst
                </span>
              )}
            </p>
          </div>

          {vergangen && (
            <p
              data-testid="vergangenheitsbanner"
              className="rounded border border-line bg-canvas p-3"
            >
              {VERGANGENHEIT_TEXT}
            </p>
          )}

          {fehler !== null && (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 rounded border border-line bg-danger-bg p-3 text-danger-text"
            >
              <p>{fehler.text}</p>
              {fehler.code === "STALE_REVISION" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Ausdrueckliches Nachladen des Tagesdetails. router.refresh()
                    // erneuert nur die Server Components - dieser Drawer holt
                    // seine Wahrheit selbst per apiGet und bliebe sonst alt.
                    setLadezaehler((n) => n + 1);
                  }}
                >
                  Neu laden
                </Button>
              )}
            </div>
          )}

          <fieldset data-testid="drawer-team" className="flex flex-col gap-1" disabled={gesperrt}>
            <legend className="font-medium">Einsatzteam</legend>
            {employees.map((person) => (
              /*
               * min-h-11 = 44 CSS-Pixel (WCAG 2.5.5, EYT-176).
               *
               * Die Hoehe sitzt am LABEL, nicht an der Checkbox: die Checkbox
               * bleibt das 13x13 grosse Betriebssystemelement, bedient wird
               * die Zeile, die sie umschliesst - ein Klick irgendwo darauf
               * schaltet sie. Genau das ist die "gleichwertige effektive
               * Trefferflaeche" der Akzeptanz, und `beruehrziele.spec.ts`
               * misst sie an allen vier Ecken, statt sie zu behaupten.
               */
              <label key={person.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  value={person.id}
                  aria-label={`${person.displayName}${person.roleLabel === null ? "" : `, ${person.roleLabel}`}`}
                  checked={entwurf.employeeIds.includes(person.id)}
                  onChange={() => umschalten(person.id, "employeeIds")}
                />
                <span>
                  {person.displayName}
                  {person.roleLabel !== null && (
                    <span className="text-ink-muted"> · {person.roleLabel}</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset
            data-testid="drawer-ressourcen"
            /*
             * min-w-0 zusaetzlich zum Namen unten: ein <fieldset> traegt aus
             * dem Browser-Stylesheet `min-inline-size: min-content` und
             * schrumpft deshalb NIE unter die Breite seines laengsten Wortes -
             * auch dann nicht, wenn das Kind darin laengst brechen duerfte.
             * Gemessen vor der Reparatur: die Zeile selbst war 589 px breit
             * bei 374 px nutzbarer Dialogbreite. Beim <ul> von Schritt 3 gibt
             * es diese Eigenart des Browsers nicht, dort lief nur der Text
             * ueber - derselbe Befund, zwei verschiedene Wege dorthin.
             */
            className="flex min-w-0 flex-col gap-1"
            disabled={gesperrt}
          >
            <legend className="font-medium">Ressourcen</legend>
            {resources.map((mittel) => (
              // Dieselbe 44-px-Zeile wie beim Team (EYT-176).
              <label key={mittel.id} className="flex min-h-11 items-center gap-2">
                {/*
                min-w-0 + break-words am Namen, shrink-0 an der Checkbox -
                Inhaltsrobustheit der Zeile (EYT-176 F1).

                Der Name stand hier als nackter Textknoten im Label und war
                damit ein ANONYMES Flex-Kind: anonyme Flex-Kinder lassen sich
                nicht adressieren, tragen `min-width: auto` und schrumpfen
                deshalb nie unter ihre min-content-Breite. Bei einem
                zusammenhaengenden Namen IST diese Breite der ganze Name -
                gemessen 567 px, und damit `dialog.scrollWidth` 604 gegen
                `clientWidth` 374 (ebenso 605 gegen 324 und 319).

                Das Dokument blieb dabei gruen, weil `Dialog.Content`
                `overflow-y-auto` traegt: ist eine Achse nicht `visible`,
                rechnet CSS die andere auf `auto` - der Drawer scrollte also
                selbst horizontal. Deshalb misst der Test die Scrollflaeche
                und nicht nur `documentElement`.

                Der gespeicherte Fachwert bleibt unangetastet: gekuerzt wird
                nichts, und eine Laengenvalidierung nur zur Layoutrettung gibt
                es ausdruecklich nicht.
              */}
                <input
                  type="checkbox"
                  value={mittel.id}
                  aria-label={mittel.name}
                  checked={entwurf.resourceIds.includes(mittel.id)}
                  onChange={() => umschalten(mittel.id, "resourceIds")}
                  className="shrink-0"
                />
                <span className="min-w-0 break-words">{mittel.name}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2" disabled={gesperrt}>
            <legend className="font-medium">Geplante Arbeitszeit (optional)</legend>
            <label htmlFor={beginnId}>Beginn</label>
            <input
              id={beginnId}
              type="time"
              value={zeitFuerFeld(entwurf.plannedStartTime)}
              onChange={(event) =>
                setEntwurf((bisher) =>
                  bisher === null
                    ? bisher
                    : {
                        ...bisher,
                        plannedStartTime: event.target.value === "" ? null : event.target.value,
                      },
                )
              }
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
            <label htmlFor={endeId}>Ende</label>
            <input
              id={endeId}
              type="time"
              value={zeitFuerFeld(entwurf.plannedEndTime)}
              onChange={(event) =>
                setEntwurf((bisher) =>
                  bisher === null
                    ? bisher
                    : {
                        ...bisher,
                        plannedEndTime: event.target.value === "" ? null : event.target.value,
                      },
                )
              }
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor={hinweisId} className="font-medium">
              Hinweis
            </label>
            <textarea
              id={hinweisId}
              value={entwurf.note}
              disabled={gesperrt}
              onChange={(event) =>
                setEntwurf((bisher) =>
                  bisher === null ? bisher : { ...bisher, note: event.target.value },
                )
              }
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
          </div>

          <fieldset disabled={gesperrt}>
            <legend className="font-medium">Aenderung anwenden auf</legend>
            <div role="radiogroup" aria-label="Aenderung anwenden auf" className="flex flex-col">
              {DAY_CHANGE_SCOPES.map((wert) => (
                // Dieselbe 44-px-Zeile (EYT-176): die Scope-Wahl ist die
                // folgenschwerste Auswahl des Drawers und stand mit 24 px
                // Hoehe direkt neben den Teamzeilen.
                <label key={wert} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name={scopeName}
                    value={wert}
                    checked={scope === wert}
                    onChange={() => setScope(wert)}
                  />
                  {SCOPE_LABELS[wert]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2">
            {onShowCosts !== undefined && (
              <Button
                variant="secondary"
                onClick={() => onShowCosts(detail.engagementId, detail.engagementTitle)}
              >
                Kosten anzeigen
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={() => void speichern()} disabled={gesperrt || !geaendert}>
              {scope === "THIS_AND_FOLLOWING" ? "Vorschau anzeigen ..." : "Speichern"}
            </Button>
          </div>
        </>
      )}
    </Drawer>
  );
}
