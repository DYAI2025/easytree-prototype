"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

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
import { Button } from "../primitives/button";
import { EngagementDrawer } from "../engagement/engagement-drawer";
import { DayDrawer, type DayChangeEntwurf } from "../day/day-drawer";
import { SeriesPreviewDialog, type SeriesNamen } from "../day/series-preview-dialog";
import type { WorksiteDayDetailDto } from "../../contracts/worksite-days";

/**
 * Client-Teil der Planungsseite.
 *
 * Sie bekommt die fertige `MonthPlanningView` als Prop - die Server Component
 * liest sie direkt aus der Query. Hier wird NICHT nachgeladen: die Servertruth
 * kommt einmal herein, und der Monatswechsel laeuft ueber die URL.
 */
export function PlanungsAnsicht({ view }: { readonly view: MonthPlanningViewDto }) {
  const router = useRouter();
  const [drawerOffen, setDrawerOffen] = useState(false);
  /*
   * Der geoeffnete Baustellentag. Bis hierher hatte `DayCardStack` ein
   * `onOpen={() => {}}` - ein Control, das einen Weg behauptet, den es nicht
   * gibt. Kein Task des Plans verdrahtet die Tageskarte; TASK-045 und AC-05b
   * setzen sie aber voraus. Siehe PA-08.
   */
  const [offenerTag, setOffenerTag] = useState<string | null>(null);
  /**
   * Serienaenderung: der Tagesdrawer speichert bei diesem Scope NICHT selbst,
   * sondern reicht seinen Entwurf hierher - die Vorschau ist die verlangte
   * ausdrueckliche Bestaetigung (A-06, OQ-001).
   */
  const [serie, setSerie] = useState<{
    entwurf: DayChangeEntwurf;
    detail: WorksiteDayDetailDto;
    namen: SeriesNamen;
  } | null>(null);

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
      knoten[datum] = <DayCardStack cards={karten} onOpen={setOffenerTag} />;
    }

    return { cardsByDate: knoten, countsByDate: zahlen };
  }, [view.cards]);

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

  const wechsleMonat = (monat: string) => {
    router.push(`/planung?monat=${monat}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <MonthToolbar
        monat={view.month}
        heute={view.today}
        onNavigate={wechsleMonat}
        onCreate={() => setDrawerOffen(true)}
      />

      {view.cards.length === 0 && (
        <div className="rounded border border-line bg-surface p-4">
          <p className="font-medium">Keine Einsaetze in diesem Monat</p>
          <p className="mt-1 text-ink-muted">
            Lege den ersten Einsatz an oder waehle einen Tag im Kalender.
          </p>
          <div className="mt-3">
            <Button onClick={() => setDrawerOffen(true)}>Einsatz anlegen</Button>
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
        onCreateForDate={() => setDrawerOffen(true)}
        onMonthChange={(richtung) => wechsleMonat(addMonths(view.month, richtung))}
      />

      {offenerTag !== null && (
        <DayDrawer
          worksiteDayId={offenerTag}
          today={view.today}
          onClose={() => setOffenerTag(null)}
          onSaved={() => {
            setOffenerTag(null);
            router.refresh();
          }}
          onSeriesPreview={(entwurf, detail, namen) => setSerie({ entwurf, detail, namen })}
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
            setOffenerTag(null);
            router.refresh();
          }}
        />
      )}

      {drawerOffen && (
        <EngagementDrawer
          onClose={() => setDrawerOffen(false)}
          onCreated={() => {
            setDrawerOffen(false);
            // Die Servertruth hat sich geaendert; ohne refresh zeigte der
            // Kalender weiter den Stand von vor der Anlage.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
