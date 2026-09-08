"use client";

import { useId, useMemo, useRef, useState } from "react";

import type { EngagementCreated } from "../../contracts/engagement";
import type { Employee } from "../../contracts/employee";
import type { Resource } from "../../contracts/resource";
import { ApiProblemError, apiPost } from "../../lib/api-client";
import { Button } from "../primitives/button";
import { EngagementSummary, deutschesDatum } from "./engagement-summary";

export interface EngagementEntwurf {
  readonly worksiteId: string;
  readonly worksiteName: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate?: string;
  readonly planningHorizonDate?: string;
  readonly colourKey: string;
  readonly addedDays: readonly string[];
  readonly removedDays: readonly string[];
  readonly plannedStartTime?: string;
  readonly plannedEndTime?: string;
  /** Die abgeleiteten Tage aus Schritt 2 - nur fuer die Anzeige. */
  readonly localDates: readonly string[];
}

export interface StepTeamProps {
  readonly entwurf: EngagementEntwurf;
  readonly employees: readonly Employee[];
  readonly resources: readonly Resource[];
  /**
   * Beim OEFFNEN des Drawers erzeugt und fuer diese eine Anlage stabil.
   * Ein Schluessel je Klick waere kein Idempotenzschutz, sondern nur ein
   * teurer Zufallsgenerator.
   */
  readonly idempotencyKey: string;
  readonly onCreated: (ergebnis: EngagementCreated) => void;
}

function passt(text: string, suche: string): boolean {
  return text.toLowerCase().includes(suche.trim().toLowerCase());
}

function anzahl(wert: number, singular: string, plural: string): string {
  return `${wert} ${wert === 1 ? singular : plural}`;
}

/** Schritt 3: Team und Ressourcen waehlen, pruefen, anlegen. */
export function StepTeam({
  entwurf,
  employees,
  resources,
  idempotencyKey,
  onCreated,
}: StepTeamProps) {
  const sucheId = useId();
  const [suche, setSuche] = useState("");
  const [team, setTeam] = useState<readonly string[]>([]);
  const [mittel, setMittel] = useState<readonly string[]>([]);
  const [fehler, setFehler] = useState<{
    text: string;
    detail?: string;
    tage: readonly string[];
  } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  // Ref und nicht nur State: zwei Klicks im selben Tick wuerden denselben
  // State-Wert sehen und beide durchlaufen.
  const inArbeit = useRef(false);

  const gefiltert = useMemo(
    () => employees.filter((m) => passt(`${m.displayName} ${m.roleLabel ?? ""}`, suche)),
    [employees, suche],
  );

  const umschalten = (
    id: string,
    setzen: (aktualisierung: (bisher: readonly string[]) => readonly string[]) => void,
  ): void => {
    setzen((bisher) => (bisher.includes(id) ? bisher.filter((v) => v !== id) : [...bisher, id]));
  };

  const anlegen = async (): Promise<void> => {
    if (inArbeit.current) {
      return;
    }

    inArbeit.current = true;
    setLaeuft(true);
    setFehler(null);

    const koerper: Record<string, unknown> = {
      worksiteId: entwurf.worksiteId,
      title: entwurf.title,
      startDate: entwurf.startDate,
      colourKey: entwurf.colourKey,
      addedDays: entwurf.addedDays,
      removedDays: entwurf.removedDays,
      employeeIds: team,
      resourceIds: mittel,
    };

    if (entwurf.endDate !== undefined) {
      koerper.endDate = entwurf.endDate;
    }

    if (entwurf.planningHorizonDate !== undefined) {
      koerper.planningHorizonDate = entwurf.planningHorizonDate;
    }

    if (entwurf.plannedStartTime !== undefined) {
      koerper.plannedStartTime = entwurf.plannedStartTime;
      koerper.plannedEndTime = entwurf.plannedEndTime;
    }

    try {
      onCreated(
        await apiPost<EngagementCreated>("/api/einsaetze", koerper, {
          "Idempotency-Key": idempotencyKey,
        }),
      );
    } catch (ursache) {
      const tage =
        ursache instanceof ApiProblemError && Array.isArray(ursache.meta?.conflictingDates)
          ? (ursache.meta.conflictingDates as string[])
          : [];

      setFehler({
        text:
          ursache instanceof ApiProblemError
            ? ursache.title
            : "Der Einsatz konnte nicht angelegt werden.",
        ...(ursache instanceof Error ? { detail: ursache.message } : {}),
        tage,
      });
      // Bewusst freigeben: nach einem Fehler MUSS ein zweiter Versuch moeglich
      // sein. Der Schluessel bleibt derselbe, deshalb entsteht dabei kein
      // zweiter Einsatz.
      inArbeit.current = false;
      setLaeuft(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={sucheId} className="font-medium">
          Mitarbeitende suchen
        </label>
        <input
          id={sucheId}
          type="search"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
          className="rounded border border-line bg-surface p-2"
        />
      </div>

      <ul data-testid="mitarbeitende" className="flex flex-col gap-1">
        {gefiltert.map((m) => (
          <li key={m.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`${m.displayName}${m.roleLabel === null ? "" : `, ${m.roleLabel}`}`}
                checked={team.includes(m.id)}
                onChange={() => umschalten(m.id, setTeam)}
              />
              <span>
                {m.displayName}
                {m.roleLabel !== null && <span className="text-ink-muted"> · {m.roleLabel}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <ul data-testid="ressourcen" className="flex flex-col gap-1">
        {resources.map((r) => (
          <li key={r.id}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={r.name}
                checked={mittel.includes(r.id)}
                onChange={() => umschalten(r.id, setMittel)}
              />
              {r.name}
            </label>
          </li>
        ))}
      </ul>

      <p data-testid="auswahlzaehler" className="font-medium">
        {anzahl(team.length, "Person", "Personen")} ·{" "}
        {anzahl(mittel.length, "Ressource", "Ressourcen")}
      </p>

      <EngagementSummary
        worksiteName={entwurf.worksiteName}
        startDate={entwurf.startDate}
        endDate={entwurf.endDate}
        planningHorizonDate={entwurf.planningHorizonDate}
        localDates={entwurf.localDates}
        colourKey={entwurf.colourKey}
        employeeNames={employees.filter((m) => team.includes(m.id)).map((m) => m.displayName)}
        resourceNames={resources.filter((r) => mittel.includes(r.id)).map((r) => r.name)}
      />

      {fehler !== null && (
        <div role="alert" className="rounded border border-line bg-danger-bg p-3 text-danger-text">
          <p className="font-medium">{fehler.text}</p>
          {fehler.detail !== undefined && <p className="mt-1">{fehler.detail}</p>}
          {fehler.tage.length > 0 && (
            <p className="mt-1">Bereits verplant: {fehler.tage.map(deutschesDatum).join(", ")}</p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => void anlegen()} disabled={laeuft}>
          Einsatz anlegen
        </Button>
      </div>
    </div>
  );
}
