"use client";

import { useEffect, useMemo, useState } from "react";

import type { DayChangeResult } from "../../contracts/day-change";
import type { SeriesPreviewDto, WorksiteDayDetailDto } from "../../contracts/worksite-days";
import { ApiProblemError, apiPost } from "../../lib/api-client";
import { Button } from "../primitives/button";
import { Drawer } from "../primitives/drawer";
import type { DayChangeEntwurf } from "./day-drawer";

/**
 * Vorschau der Serienaenderung „dieser und folgende Tage" (REQ-F-016, A-06).
 *
 * PROTOTYPE_ONLY / OQ-001: individuell angepasste Folgetage (`origin =
 * "day_edit"`) sind VORAUSGEWAEHLT AUSGESCHLOSSEN und lassen sich nur einzeln
 * und ausdruecklich einbeziehen. Ein stilles Ueberschreiben waere ein
 * Anti-Drift-Verstoss (H-01) - deshalb steht der Hinweis auch auf der Flaeche
 * und nicht nur im Plan.
 *
 * Der Status jeder Zeile kommt vom SERVER. Wird ein Tag einbezogen, geht die
 * Auswahl erneut an die Vorschau, statt die Zeile lokal umzufaerben: die
 * Vergangenheitssperre gewinnt gegen jede Auswahl, und diese Regel lebt in
 * `resolveSeriesTargets`, nicht hier.
 */
export const OQ_001_HINWEIS =
  "Regel fuer bereits angepasste Tage ist eine Prototyp-Vorgabe (OQ-001 offen).";

export const STATUS_LABELS: Readonly<Record<SeriesPreviewDto["rows"][number]["status"], string>> = {
  unchanged: "unveraendert",
  adjusted_excluded: "individuell angepasst - ausgeschlossen",
  adjusted_included: "individuell angepasst - einbezogen",
  past_locked: "vergangen - gesperrt",
};

export interface SeriesNamen {
  readonly employees: readonly { id: string; name: string }[];
  readonly resources: readonly { id: string; name: string }[];
}

export interface SeriesPreviewDialogProps {
  readonly detail: WorksiteDayDetailDto;
  readonly entwurf: DayChangeEntwurf;
  readonly namen: SeriesNamen;
  readonly onClose: () => void;
  /**
   * Bekommt das Ergebnis der Uebernahme (EYT-175). `updatedDayIds` ist die
   * einzige belastbare Quelle fuer "wie viele Tage wurden geaendert": die
   * Zieltage der Vorschau koennen davon abweichen, weil ausgeschlossene und
   * gesperrte Tage nicht geschrieben werden. Eine im Client gezaehlte Zahl
   * waere eine Schaetzung.
   */
  readonly onApplied: (ergebnis: DayChangeResult) => void;
}

/** `2026-09-08` -> `08.09.2026`. Ohne Date-Objekt, also ohne Zeitzonenfalle. */
function deutsch(datum: string): string {
  const [jahr, monat, tag] = datum.split("-") as [string, string, string];

  return `${tag}.${monat}.${jahr}`;
}

function diff(
  vorher: readonly string[],
  nachher: readonly string[],
  namen: readonly { id: string; name: string }[],
): string[] {
  const nachschlagen = (id: string): string => namen.find((e) => e.id === id)?.name ?? id;

  return [
    ...nachher.filter((id) => !vorher.includes(id)).map((id) => `+${nachschlagen(id)}`),
    ...vorher.filter((id) => !nachher.includes(id)).map((id) => `-${nachschlagen(id)}`),
  ];
}

export function SeriesPreviewDialog({
  detail,
  entwurf,
  namen,
  onClose,
  onApplied,
}: SeriesPreviewDialogProps) {
  const [einbezogen, setEinbezogen] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<SeriesPreviewDto | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let abgebrochen = false;

    const laden = async (): Promise<void> => {
      try {
        const ergebnis = await apiPost<SeriesPreviewDto>(
          `/api/baustellentage/${detail.worksiteDayId}/aenderungen/vorschau`,
          { includeAdjustedDayIds: [...einbezogen] },
        );

        if (!abgebrochen) {
          setPreview(ergebnis);
        }
      } catch (ursache) {
        if (!abgebrochen) {
          setFehler(
            ursache instanceof ApiProblemError
              ? ursache.title
              : "Die Vorschau konnte nicht geladen werden.",
          );
        }
      }
    };

    void laden();

    return () => {
      abgebrochen = true;
    };
  }, [detail.worksiteDayId, einbezogen]);

  const zusammenfassung = useMemo(() => {
    const team = diff(
      detail.employees.map((p) => p.id),
      entwurf.employeeIds,
      namen.employees,
    );
    const mittel = diff(
      detail.resources.map((r) => r.id),
      entwurf.resourceIds,
      namen.resources,
    );

    const teile: string[] = [];

    if (team.length > 0) {
      teile.push(`Team: ${team.join(", ")}`);
    }

    if (mittel.length > 0) {
      teile.push(`Ressourcen: ${mittel.join(", ")}`);
    }

    if (entwurf.note !== (detail.note ?? "")) {
      teile.push("Hinweis wird gesetzt");
    }

    return teile.length === 0 ? "Keine inhaltliche Aenderung." : teile.join(" · ");
  }, [detail, entwurf, namen]);

  const umschalten = (worksiteDayId: string): void => {
    setEinbezogen((bisher) =>
      bisher.includes(worksiteDayId)
        ? bisher.filter((id) => id !== worksiteDayId)
        : [...bisher, worksiteDayId],
    );
  };

  const uebernehmen = async (): Promise<void> => {
    if (preview === null) {
      return;
    }

    setLaeuft(true);
    setFehler(null);

    try {
      const ergebnis = await apiPost<DayChangeResult>(
        `/api/baustellentage/${detail.worksiteDayId}/aenderungen`,
        {
          scope: "THIS_AND_FOLLOWING",
          expectedRevisionNo: detail.revisionNo,
          changes: {
            employeeIds: [...entwurf.employeeIds],
            resourceIds: [...entwurf.resourceIds],
            plannedStartTime: entwurf.plannedStartTime,
            plannedEndTime: entwurf.plannedEndTime,
            ...(entwurf.note === "" ? {} : { note: entwurf.note }),
          },
          includeAdjustedDayIds: [...einbezogen],
        },
      );

      onApplied(ergebnis);
    } catch (ursache) {
      setFehler(
        ursache instanceof ApiProblemError
          ? ursache.title
          : "Die Serienaenderung konnte nicht angewendet werden.",
      );
    } finally {
      setLaeuft(false);
    }
  };

  /*
   * Zwei Gruende, zwei Zahlen. Der Plan nennt in 6.6 nur "N ausgeschlossen";
   * eine gemeinsame Zahl aus angepassten und vergangenen Tagen waere aber
   * mehrdeutig - der eine Grund ist eine Prototyp-Vorgabe (OQ-001, aufhebbar
   * per Checkbox), der andere eine harte Regel (A-07, serverseitig unumgehbar).
   */
  const angepasstAusgeschlossen =
    preview === null ? 0 : preview.rows.filter((row) => row.status === "adjusted_excluded").length;
  const vergangenGesperrt =
    preview === null ? 0 : preview.rows.filter((row) => row.status === "past_locked").length;

  return (
    <Drawer
      open
      onOpenChange={(offen) => {
        if (!offen) {
          onClose();
        }
      }}
      title="Serienaenderung pruefen"
    >
      <p className="rounded border border-line bg-canvas p-3">{OQ_001_HINWEIS}</p>

      <p data-testid="serien-zusammenfassung" className="font-medium">
        {zusammenfassung}
      </p>

      {fehler !== null && (
        <p role="alert" className="rounded border border-line bg-danger-bg p-3 text-danger-text">
          {fehler}
        </p>
      )}

      {preview === null && fehler === null && <p role="status">Vorschau wird geladen ...</p>}

      {preview !== null && (
        <>
          <p data-testid="serien-zaehler">
            {preview.targetIds.length} Tage werden geaendert, {angepasstAusgeschlossen}{" "}
            ausgeschlossen (individuell angepasst), {vergangenGesperrt} gesperrt (vergangen)
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line p-2 text-left">
                    Datum
                  </th>
                  <th scope="col" className="border-b border-line p-2 text-left">
                    Status
                  </th>
                  <th scope="col" className="border-b border-line p-2 text-left">
                    Einbeziehen
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.worksiteDayId}>
                    <td className="border-b border-line p-2">{deutsch(row.date)}</td>
                    <td className="border-b border-line p-2">{STATUS_LABELS[row.status]}</td>
                    <td className="border-b border-line p-2">
                      {/*
                       * Nur angepasste Tage bekommen ueberhaupt ein Control.
                       * Ein deaktivierter Kasten an einem vergangenen Tag
                       * behauptete eine Moeglichkeit, die es nicht gibt - die
                       * Vergangenheitssperre ist serverseitig unumgehbar.
                       */}
                      {(row.status === "adjusted_excluded" ||
                        row.status === "adjusted_included") && (
                        /*
                         * Das Label ist hier die Bedienflaeche (EYT-176).
                         *
                         * Anders als bei den Team- und Ressourcenzeilen im
                         * Tagesdrawer stand dieser Kasten frei in der Zelle:
                         * gemessene 13x13 CSS-Pixel, ohne irgendeine groessere
                         * Flaeche, die den Griff auffinge. Die Ausweichformel
                         * "gleichwertige effektive Trefferflaeche" gab es hier
                         * also nicht - erst das umschliessende Label schafft
                         * sie, min-h-11/min-w-11 = 44x44.
                         *
                         * Das Label traegt bewusst KEINEN Text: der zugaengliche
                         * Name sitzt weiter am `input` (aria-label mit Datum),
                         * und ein zweiter Name daneben wuerde ihn ueberschreiben.
                         */
                        <label className="flex min-h-11 min-w-11 items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label={`${deutsch(row.date)} einbeziehen`}
                            checked={einbezogen.includes(row.worksiteDayId)}
                            onChange={() => umschalten(row.worksiteDayId)}
                          />
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Abbrechen
        </Button>
        <Button onClick={() => void uebernehmen()} disabled={preview === null || laeuft}>
          Uebernehmen
        </Button>
      </div>
    </Drawer>
  );
}
