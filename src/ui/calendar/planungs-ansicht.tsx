"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { MonthPlanningViewDto } from "../../contracts/worksite-days";
import {
  addMonths,
  buildMonthGrid,
  computeSpanSegments,
  type MonthGrid as MonthGridModel,
} from "../../domain/month-grid";
import { parseLocalDate, type LocalDate } from "../../domain/local-date";
import { DayCardStack, type DayCardModel } from "./day-card";
import { MonthGrid } from "./month-grid";
import { MonthToolbar } from "./month-toolbar";
import {
  planungsUrl,
  type PlanungsUrlEingabe,
  type PlanungsViewState,
} from "./planning-view-state";
import { Button } from "../primitives/button";
import { EngagementDrawer } from "../engagement/engagement-drawer";
import { DayDrawer, type DayChangeEntwurf } from "../day/day-drawer";
import { SeriesPreviewDialog, type SeriesNamen } from "../day/series-preview-dialog";
import { CostDrawer } from "../cost/cost-drawer";
import type { WorksiteDayDetailDto } from "../../contracts/worksite-days";

/**
 * Client-Teil der Planungsseite.
 *
 * Sie bekommt die fertige `MonthPlanningView` als Prop - die Server Component
 * liest sie direkt aus der Query. Hier wird NICHT nachgeladen: die Servertruth
 * kommt einmal herein.
 *
 * Der Ansichtszustand kommt genauso von aussen: welcher Drawer offen ist und
 * welchen Tag bzw. Einsatz er adressiert, steht in der URL und wird in der
 * Server Component aufgeloest (`resolvePlanungsViewState`). Diese Komponente
 * SCHREIBT den Zustand nur - jedes Oeffnen und Schliessen ist eine Navigation.
 * Vorher lag er in `useState`; damit ueberlebte kein Drawer einen Reload und
 * ein Link auf einen Tag war nicht teilbar (Befund B-05).
 *
 * Im React-State bleibt nur, was sich aus einer URL gar nicht rekonstruieren
 * laesst: der noch nicht gespeicherte Serien-Entwurf hinter der Vorschau.
 */
export function PlanungsAnsicht({
  view,
  viewState,
}: {
  readonly view: MonthPlanningViewDto;
  readonly viewState: PlanungsViewState;
}) {
  const router = useRouter();
  /**
   * Serienaenderung: der Tagesdrawer speichert bei diesem Scope NICHT selbst,
   * sondern reicht seinen Entwurf hierher - die Vorschau ist die verlangte
   * ausdrueckliche Bestaetigung (A-06, OQ-001). Der Entwurf ist ungespeicherte
   * Formulararbeit und gehoert deshalb nicht in die URL.
   */
  const [serie, setSerie] = useState<{
    entwurf: DayChangeEntwurf;
    detail: WorksiteDayDetailDto;
    namen: SeriesNamen;
  } | null>(null);

  const gehe = useCallback(
    (ziel: PlanungsUrlEingabe): void => {
      // scroll: false - ein geoeffneter Drawer darf die Kalenderposition nicht
      // an den Seitenanfang reissen.
      router.push(planungsUrl(ziel), { scroll: false });
    },
    [router],
  );

  /** Drawer zu: die Drawer-Parameter fallen weg, der Monat bleibt stehen. */
  const schliesse = useCallback((): void => gehe({ monat: view.month }), [gehe, view.month]);

  /**
   * Nach einer Mutation: zurueck auf den Kalender UND die Servertruth neu
   * holen. `router.refresh()` bleibt ausdruecklich stehen - die Navigation
   * allein garantiert keinen frischen Serverrender.
   */
  const nachAenderung = useCallback((): void => {
    gehe({ monat: view.month });
    router.refresh();
  }, [gehe, router, view.month]);

  const grid: MonthGridModel = useMemo(() => buildMonthGrid(view.month), [view.month]);

  const { cardsByDate, countsByDate } = useMemo(() => {
    const proTag = new Map<string, DayCardModel[]>();

    for (const card of view.cards) {
      const bisher = proTag.get(card.date) ?? [];
      bisher.push({
        worksiteDayId: card.worksiteDayId,
        engagementId: card.engagementId,
        title: card.title,
        worksiteName: card.worksiteName,
        colourKey: card.colourKey,
        employeeCount: card.employeeCount,
        resourceCount: card.resourceCount,
      });
      proTag.set(card.date, bisher);
    }

    const knoten: Record<string, ReactNode> = {};
    const zahlen: Record<string, number> = {};

    for (const [datum, karten] of proTag) {
      zahlen[datum] = karten.length;
      knoten[datum] = (
        <DayCardStack
          cards={karten}
          onOpen={(worksiteDayId) =>
            gehe({ monat: view.month, tag: datum, drawer: "tag", id: worksiteDayId })
          }
        />
      );
    }

    return { cardsByDate: knoten, countsByDate: zahlen };
  }, [gehe, view.cards, view.month]);

  // Die Balken kommen aus denselben Karten wie die Tageskarten: ein Einsatz
  // ist an genau den Tagen geplant, an denen er eine Karte hat.
  const { spans, colourByEngagement } = useMemo(() => {
    const tageProEinsatz = new Map<string, LocalDate[]>();
    const farben: Record<string, string> = {};

    for (const card of view.cards) {
      const bisher = tageProEinsatz.get(card.engagementId) ?? [];

      bisher.push(parseLocalDate(card.date));
      tageProEinsatz.set(card.engagementId, bisher);
      farben[card.engagementId] = card.colourKey;
    }

    const segmente = computeSpanSegments(
      grid,
      [...tageProEinsatz].map(([engagementId, days]) => ({ engagementId, days })),
    );

    return { spans: segmente, colourByEngagement: farben };
  }, [grid, view.cards]);

  // Ein Monatswechsel laesst den Drawer-Zustand fallen: der adressierte Tag
  // bzw. Einsatz muss im neuen Monat gar nicht vorkommen.
  const wechsleMonat = (monat: string) => gehe({ monat });

  const oeffneAnlage = (tag?: LocalDate) =>
    gehe({ monat: view.month, tag: tag ?? null, drawer: "neu" });

  return (
    <div className="flex flex-col gap-4">
      <MonthToolbar
        monat={view.month}
        heute={view.today}
        onNavigate={wechsleMonat}
        onCreate={() => oeffneAnlage()}
      />

      {view.cards.length === 0 && (
        <div className="rounded border border-line bg-surface p-4">
          <p className="font-medium">Keine Einsaetze in diesem Monat</p>
          <p className="mt-1 text-ink-muted">
            Lege den ersten Einsatz an oder waehle einen Tag im Kalender.
          </p>
          <div className="mt-3">
            <Button onClick={() => oeffneAnlage()}>Einsatz anlegen</Button>
          </div>
        </div>
      )}

      <MonthGrid
        grid={grid}
        today={parseLocalDate(view.today)}
        labelledBy="monatstitel"
        cardsByDate={cardsByDate}
        countsByDate={countsByDate}
        spans={spans}
        colourByEngagement={colourByEngagement}
        onCreateForDate={(datum) => oeffneAnlage(datum)}
        onMonthChange={(richtung) => wechsleMonat(addMonths(view.month, richtung))}
      />

      {viewState.drawer === "tag" && (
        <DayDrawer
          key={viewState.worksiteDayId}
          worksiteDayId={viewState.worksiteDayId}
          today={view.today}
          onClose={schliesse}
          onSaved={nachAenderung}
          onShowCosts={(engagementId) =>
            // Der Tageskontext bleibt in der URL stehen: der Kosten-Drawer ist
            // von diesem Tag aus geoeffnet worden (Produktinvariante 7).
            gehe({
              monat: view.month,
              tag: viewState.tag,
              drawer: "kosten",
              id: engagementId,
            })
          }
          onSeriesPreview={(entwurf, detail, namen) => setSerie({ entwurf, detail, namen })}
        />
      )}

      {viewState.drawer === "kosten" && (
        <CostDrawer
          key={viewState.engagementId}
          engagementId={viewState.engagementId}
          engagementTitle={viewState.engagementTitle}
          onClose={schliesse}
        />
      )}

      {serie !== null && (
        <SeriesPreviewDialog
          detail={serie.detail}
          entwurf={serie.entwurf}
          namen={serie.namen}
          onClose={() => setSerie(null)}
          onApplied={() => {
            setSerie(null);
            nachAenderung();
          }}
        />
      )}

      {viewState.drawer === "neu" && (
        <EngagementDrawer
          onClose={schliesse}
          onCreated={() => {
            // Die Servertruth hat sich geaendert; ohne refresh zeigte der
            // Kalender weiter den Stand von vor der Anlage.
            nachAenderung();
          }}
        />
      )}
    </div>
  );
}
