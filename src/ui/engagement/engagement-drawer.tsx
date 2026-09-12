"use client";

import { useEffect, useId, useState } from "react";

import type { Customer } from "../../contracts/customer";
import type { Employee } from "../../contracts/employee";
import type { EngagementCreated } from "../../contracts/engagement";
import type { Resource } from "../../contracts/resource";
import type { Worksite } from "../../contracts/worksite";
import { apiGet } from "../../lib/api-client";
import { Drawer } from "../primitives/drawer";
import { StepPeriod, type StepPeriodWerte } from "./step-period";
import { StepTeam, type EngagementEntwurf } from "./step-team";
import { StepWorksite, type StepWorksiteAuswahl } from "./step-worksite";

interface Stammdaten {
  readonly customers: readonly Customer[];
  readonly worksites: readonly Worksite[];
  readonly employees: readonly Employee[];
  readonly resources: readonly Resource[];
}

/**
 * Zusammenbau der Einsatzanlage aus den drei Schritten.
 *
 * Die Komponente wird NUR gemountet, solange der Drawer offen ist. Daraus
 * folgt zweierlei ohne einen einzigen Effekt: der Idempotency-Key entsteht
 * genau einmal je Oeffnung (lazy initial state), und ein abgebrochener
 * Entwurf bleibt nicht als Zustand liegen.
 */
export function EngagementDrawer({
  onClose,
  onCreated,
}: {
  readonly onClose: () => void;
  /**
   * Der Titel wandert mit nach oben (EYT-175): UX-020 verlangt eine
   * Erfolgsmeldung, die den Einsatz identifizierbar nennt, und
   * `EngagementCreated` traegt nur Ids und Datumswerte. Der Titel ist genau
   * der Wert, den der Server soeben angenommen hat - `entwurf.title` ist das
   * Feld, das im Rumpf von `POST /api/einsaetze` steht.
   *
   * Die Meldung selbst entsteht bewusst NICHT hier: dieser Drawer wird beim
   * Erfolg aus dem Baum genommen und naehme sie mit.
   */
  readonly onCreated: (ergebnis: EngagementCreated, titel: string) => void;
}) {
  const titelId = useId();
  const titelFehlerId = useId();

  const [schluessel] = useState(() => crypto.randomUUID());
  const [stammdaten, setStammdaten] = useState<Stammdaten | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [schritt, setSchritt] = useState<1 | 2 | 3>(1);
  const [titel, setTitel] = useState("");
  const [titelFehler, setTitelFehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<StepWorksiteAuswahl | null>(null);
  const [zeitraum, setZeitraum] = useState<StepPeriodWerte | null>(null);

  useEffect(() => {
    let abgebrochen = false;

    const laden = async (): Promise<void> => {
      try {
        const [kunden, baustellen, leute, mittel] = await Promise.all([
          apiGet<{ items: Customer[] }>("/api/auftraggeber"),
          apiGet<{ items: Worksite[] }>("/api/baustellen"),
          apiGet<{ items: Employee[] }>("/api/mitarbeitende"),
          apiGet<{ items: Resource[] }>("/api/ressourcen"),
        ]);

        if (!abgebrochen) {
          setStammdaten({
            customers: kunden.items,
            worksites: baustellen.items,
            employees: leute.items,
            resources: mittel.items,
          });
        }
      } catch {
        if (!abgebrochen) {
          setLadefehler("Stammdaten konnten nicht geladen werden.");
        }
      }
    };

    void laden();

    return () => {
      abgebrochen = true;
    };
  }, []);

  const weiterAusSchritt1 = (gewaehlt: StepWorksiteAuswahl): void => {
    if (titel.trim() === "") {
      setTitelFehler("Bitte einen Titel eingeben.");

      return;
    }

    setTitelFehler(null);
    setAuswahl(gewaehlt);
    setSchritt(2);
  };

  const entwurf: EngagementEntwurf | null =
    auswahl === null || zeitraum === null
      ? null
      : {
          worksiteId: auswahl.worksiteId,
          worksiteName: auswahl.worksiteName,
          title: titel.trim(),
          startDate: zeitraum.startDate,
          ...(zeitraum.endDate === undefined ? {} : { endDate: zeitraum.endDate }),
          ...(zeitraum.planningHorizonDate === undefined
            ? {}
            : { planningHorizonDate: zeitraum.planningHorizonDate }),
          ...(zeitraum.plannedStartTime === undefined
            ? {}
            : {
                plannedStartTime: zeitraum.plannedStartTime,
                plannedEndTime: zeitraum.plannedEndTime,
              }),
          colourKey: zeitraum.colourKey,
          addedDays: zeitraum.addedDays,
          removedDays: zeitraum.removedDays,
          localDates: zeitraum.localDates,
        };

  return (
    <Drawer open onOpenChange={(offen) => !offen && onClose()} title="Einsatz anlegen">
      <p data-testid="drawer-schritt" className="text-ink-muted">
        Schritt {schritt} von 3
      </p>

      {ladefehler !== null && (
        <p role="alert" className="text-danger-text">
          {ladefehler}
        </p>
      )}

      {stammdaten === null && ladefehler === null && <p>Stammdaten werden geladen …</p>}

      {stammdaten !== null && schritt === 1 && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={titelId} className="font-medium">
              Titel
            </label>
            <input
              id={titelId}
              value={titel}
              aria-invalid={titelFehler === null ? undefined : true}
              aria-describedby={titelFehler === null ? undefined : titelFehlerId}
              onChange={(event) => {
                setTitel(event.target.value);
                setTitelFehler(null);
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
              className="min-h-11 rounded border border-line bg-surface p-2"
            />
            {titelFehler !== null && (
              <p id={titelFehlerId} role="alert" className="text-danger-text">
                {titelFehler}
              </p>
            )}
          </div>

          <StepWorksite
            customers={stammdaten.customers}
            worksites={stammdaten.worksites}
            onNext={weiterAusSchritt1}
          />
        </>
      )}

      {stammdaten !== null && schritt === 2 && (
        <StepPeriod
          onNext={(werte) => {
            setZeitraum(werte);
            setSchritt(3);
          }}
        />
      )}

      {stammdaten !== null && schritt === 3 && entwurf !== null && (
        <StepTeam
          entwurf={entwurf}
          employees={stammdaten.employees}
          resources={stammdaten.resources}
          idempotencyKey={schluessel}
          onCreated={(ergebnis) => onCreated(ergebnis, entwurf.title)}
        />
      )}
    </Drawer>
  );
}
