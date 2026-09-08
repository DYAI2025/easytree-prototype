"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState } from "react";

import type { CostOverviewDto } from "../../contracts/costs";
import { ApiProblemError, apiGet } from "../../lib/api-client";
import { Drawer } from "../primitives/drawer";

/**
 * Plan-Kosten eines Einsatzes (REQ-F-019, REQ-F-020, REQ-NF-004).
 *
 * Die eine Regel, die hier NICHT verhandelbar ist: eine fehlende
 * Kostengrundlage erscheint als „fehlt", niemals als „0,00 €" (H-03). Eine 0
 * waere eine erfundene Zahl, die Summe waere still falsch, und niemand saehe
 * es. Deshalb steht daneben ein Warnsymbol UND ein Text - Farbe allein waere
 * keine Statusinformation.
 *
 * Die Saetze selbst sind PROTOTYPE_ONLY (A-03) und keine Lohn- oder
 * Buchhaltungsdaten; die Fussnote sagt das auf der Flaeche.
 */
export const FUSSNOTE =
  "Demo-Tagessaetze (PROTOTYPE_ONLY); keine Lohn- oder Buchhaltungsdaten. Regel prototype-daily-rate-v1.";

/** `64000` -> `640,00 €`. Ohne Gleitkomma, mit Tausenderpunkt. */
export function formatEuro(minorUnits: string): string {
  const wert = BigInt(minorUnits);
  const euro = wert / 100n;
  const cent = `${wert % 100n}`.padStart(2, "0");
  const mitPunkten = `${euro}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${mitPunkten},${cent} €`;
}

function deutsch(datum: string): string {
  const [jahr, monat, tag] = datum.split("-") as [string, string, string];

  return `${tag}.${monat}.${jahr}`;
}

export interface CostDrawerProps {
  readonly engagementId: string;
  readonly engagementTitle: string;
  readonly onClose: () => void;
}

/** Betragszelle: entweder eine Zahl oder ausdruecklich „fehlt". Nie eine 0. */
function Betrag({ amountMinorUnits }: { readonly amountMinorUnits: string | null }) {
  if (amountMinorUnits === null) {
    return (
      <span data-testid="betrag-fehlt" className="text-danger-text">
        <span data-testid="warnsymbol" aria-hidden="true">
          ⚠
        </span>{" "}
        fehlt
      </span>
    );
  }

  return <span>{formatEuro(amountMinorUnits)}</span>;
}

function Tabelle({
  kopf,
  children,
}: {
  readonly kopf: readonly string[];
  readonly children: React.ReactNode;
}) {
  return (
    // overflow-x-auto liegt auf dem direkten Elternelement der Tabelle: eine
    // breite Kostentabelle darf scrollen, der Seitenkoerper nicht (REQ-NF-004).
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {kopf.map((titel) => (
              <th key={titel} scope="col" className="border-b border-line p-2 text-left">
                {titel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function CostDrawer({ engagementId, engagementTitle, onClose }: CostDrawerProps) {
  const [uebersicht, setUebersicht] = useState<CostOverviewDto | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;

    const laden = async (): Promise<void> => {
      try {
        const ergebnis = await apiGet<CostOverviewDto>(`/api/einsaetze/${engagementId}/kosten`);

        if (!abgebrochen) {
          setUebersicht(ergebnis);
        }
      } catch (ursache) {
        if (!abgebrochen) {
          setFehler(
            ursache instanceof ApiProblemError
              ? ursache.title
              : "Die Kostenuebersicht konnte nicht geladen werden.",
          );
        }
      }
    };

    void laden();

    return () => {
      abgebrochen = true;
    };
  }, [engagementId]);

  return (
    <Drawer
      open
      onOpenChange={(offen) => {
        if (!offen) {
          onClose();
        }
      }}
      title="Plan-Kosten (Demo)"
    >
      {fehler !== null && <p role="alert">{fehler}</p>}

      {uebersicht === null && fehler === null && (
        <p role="status">Kostenuebersicht wird geladen ...</p>
      )}

      {uebersicht !== null && (
        <>
          <div data-testid="kostenkopf" className="flex flex-col gap-1">
            <p className="font-medium">{engagementTitle}</p>
            <p data-testid="kostensumme" className="text-2xl font-semibold">
              {formatEuro(uebersicht.totalMinorUnits)}
            </p>
            <p>
              {uebersicht.complete ? (
                <span className="rounded border border-line px-2 py-0.5">vollstaendig</span>
              ) : (
                <span className="rounded border border-line bg-danger-bg px-2 py-0.5 text-danger-text">
                  <span aria-hidden="true">⚠</span> unvollstaendig - {uebersicht.missingCount}{" "}
                  Grundlagen fehlen
                </span>
              )}
            </p>
          </div>

          <Tabs.Root defaultValue="tag">
            <Tabs.List aria-label="Kostenaufschluesselung" className="flex gap-2">
              <Tabs.Trigger value="tag" className="rounded border border-line px-3 py-2">
                Nach Tag
              </Tabs.Trigger>
              <Tabs.Trigger value="mitarbeiter" className="rounded border border-line px-3 py-2">
                Nach Mitarbeiter
              </Tabs.Trigger>
              <Tabs.Trigger value="ressource" className="rounded border border-line px-3 py-2">
                Nach Ressource
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="tag" className="mt-3">
              <Tabelle kopf={["Datum", "Position", "Betrag", "Zwischensumme"]}>
                {uebersicht.days.flatMap((tag) =>
                  tag.positions.map((position, index) => (
                    <tr key={`${tag.date}-${position.subjectId}`}>
                      <td className="border-b border-line p-2">
                        {index === 0 ? deutsch(tag.date) : ""}
                      </td>
                      <td className="border-b border-line p-2">{position.subjectLabel}</td>
                      <td className="border-b border-line p-2">
                        <Betrag amountMinorUnits={position.amountMinorUnits} />
                      </td>
                      <td className="border-b border-line p-2">
                        {index === 0 && (
                          <span data-testid="tageszwischensumme">
                            {formatEuro(tag.subtotalMinorUnits)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              </Tabelle>
            </Tabs.Content>

            <Tabs.Content value="mitarbeiter" className="mt-3">
              <Tabelle kopf={["Mitarbeiter", "Summe", "Fehlende Grundlagen"]}>
                {uebersicht.byEmployee.map((eintrag) => (
                  <tr key={eintrag.subjectId}>
                    <td className="border-b border-line p-2">{eintrag.subjectLabel}</td>
                    <td className="border-b border-line p-2">
                      <Betrag
                        amountMinorUnits={eintrag.missingCount > 0 ? null : eintrag.totalMinorUnits}
                      />
                    </td>
                    <td className="border-b border-line p-2">{eintrag.missingCount}</td>
                  </tr>
                ))}
              </Tabelle>
            </Tabs.Content>

            <Tabs.Content value="ressource" className="mt-3">
              <Tabelle kopf={["Ressource", "Summe", "Fehlende Grundlagen"]}>
                {uebersicht.byResource.map((eintrag) => (
                  <tr key={eintrag.subjectId}>
                    <td className="border-b border-line p-2">{eintrag.subjectLabel}</td>
                    <td className="border-b border-line p-2">
                      <Betrag
                        amountMinorUnits={eintrag.missingCount > 0 ? null : eintrag.totalMinorUnits}
                      />
                    </td>
                    <td className="border-b border-line p-2">{eintrag.missingCount}</td>
                  </tr>
                ))}
              </Tabelle>
            </Tabs.Content>
          </Tabs.Root>

          <p data-testid="kostenfussnote" className="text-ink-muted">
            {FUSSNOTE}
          </p>
        </>
      )}
    </Drawer>
  );
}
