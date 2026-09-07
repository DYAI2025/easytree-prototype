"use client";

import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import type { MonthPlanningViewDto } from "../../contracts/worksite-days";
import {
  addMonths,
  buildMonthGrid,
  type MonthGrid as MonthGridModel,
} from "../../domain/month-grid";
import { parseLocalDate } from "../../domain/local-date";
import { DayCardStack, type DayCardModel } from "./day-card";
import { MonthGrid } from "./month-grid";
import { MonthToolbar } from "./month-toolbar";
import { Button } from "../primitives/button";

/**
 * Client-Teil der Planungsseite.
 *
 * Sie bekommt die fertige `MonthPlanningView` als Prop - die Server Component
 * liest sie direkt aus der Query. Hier wird NICHT nachgeladen: die Servertruth
 * kommt einmal herein, und der Monatswechsel laeuft ueber die URL.
 */
export function PlanungsAnsicht({ view }: { readonly view: MonthPlanningViewDto }) {
  const router = useRouter();

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
      knoten[datum] = <DayCardStack cards={karten} onOpen={() => {}} onMore={() => {}} />;
    }

    return { cardsByDate: knoten, countsByDate: zahlen };
  }, [view.cards]);

  const wechsleMonat = (monat: string) => {
    router.push(`/planung?monat=${monat}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <MonthToolbar
        monat={view.month}
        heute={view.today}
        onNavigate={wechsleMonat}
        onCreate={() => {}}
      />

      {view.cards.length === 0 && (
        <div className="rounded border border-line bg-surface p-4">
          <p className="font-medium">Keine Einsaetze in diesem Monat</p>
          <p className="mt-1 text-ink-muted">
            Lege den ersten Einsatz an oder waehle einen Tag im Kalender.
          </p>
          <div className="mt-3">
            <Button onClick={() => {}}>Einsatz anlegen</Button>
          </div>
        </div>
      )}

      <MonthGrid
        grid={grid}
        today={parseLocalDate(view.today)}
        labelledBy="monatstitel"
        cardsByDate={cardsByDate}
        countsByDate={countsByDate}
        onCreateForDate={() => {}}
        onMonthChange={(richtung) => wechsleMonat(addMonths(view.month, richtung))}
      />
    </div>
  );
}
