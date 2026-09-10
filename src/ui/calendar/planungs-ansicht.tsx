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
import { DayIndicator, DayList } from "./day-compact";
import { MonthGrid } from "./month-grid";
import { MonthToolbar } from "./month-toolbar";
import {
  planungsUrl,
  type PlanungsUrlEingabe,
  type PlanungsViewState,
} from "./planning-view-state";
import { Button } from "../primitives/button";
import { Toast, useErfolg } from "../feedback/toast";
import {
  baustellentagGespeichert,
  einsatzAngelegt,
  serieUebernommen,
} from "../feedback/erfolgstexte";
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

  /**
   * Erfolgsbestaetigung nach Schreibaktionen (EYT-175).
   *
   * Sie liegt HIER und nicht in den Drawern: Tagesdrawer, Serienvorschau und
   * Anlage-Assistent werden beim Erfolg aus dem Baum genommen (siehe die
   * bedingten Zweige unten), eine Meldung in ihnen waere im selben Moment weg.
   * Diese Komponente bleibt stehen - auch ueber `router.refresh()` hinweg, das
   * den Serverzustand neu holt, den Client-Baum aber erhaelt.
   */
  const { meldung, melde, loesche } = useErfolg();

  const gehe = useCallback(
    (ziel: PlanungsUrlEingabe): void => {
      /*
       * Jede Navigation raeumt die alte Bestaetigung weg - ein Monatswechsel
       * oder ein neu geoeffneter Drawer soll nicht noch den Satz der letzten
       * Aktion tragen. Die Erfolgswege melden NACH `gehe`, ihr Satz ueberlebt
       * das Aufraeumen deshalb (React fasst beide Zustandsaenderungen zu einem
       * Rendern zusammen).
       */
      loesche();
      // scroll: false - ein geoeffneter Drawer darf die Kalenderposition nicht
      // an den Seitenanfang reissen.
      router.push(planungsUrl(ziel), { scroll: false });
    },
    // `loesche` ist stabil (useCallback ohne Abhaengigkeiten); `gehe` bleibt
    // damit referenzstabil und die Memos darunter rechnen nicht neu.
    [loesche, router],
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

  /**
   * Der ausgewaehlte Tag der Kompaktform. Er steht in derselben URL wie jeder
   * andere Ansichtszustand (`?monat=…&tag=…`) - eine Auswahl im React-State
   * ueberlebte keinen Reload und waere nicht teilbar (Befund B-05).
   */
  const ausgewaehlterTag = viewState.tag ?? null;

  const { cardsByDate, countsByDate, indicatorsByDate, kartenProTag } = useMemo(() => {
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
    const indikatoren: Record<string, ReactNode> = {};

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
      indikatoren[datum] = (
        <DayIndicator
          date={parseLocalDate(datum)}
          cards={karten}
          selected={datum === ausgewaehlterTag}
          // Auswaehlen ist KEIN Oeffnen: der Tag wandert in die URL, die
          // Tagesliste unter dem Raster zeigt danach seine Karten.
          onSelect={(tag) => gehe({ monat: view.month, tag })}
        />
      );
    }

    return {
      cardsByDate: knoten,
      countsByDate: zahlen,
      indicatorsByDate: indikatoren,
      kartenProTag: proTag,
    };
  }, [ausgewaehlterTag, gehe, view.cards, view.month]);

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

      {/*
        Der Live-Bereich steht IMMER hier, auch ohne Meldung - siehe die
        Begruendung an `Toast`. Ohne Meldung traegt er `sr-only`, ist also
        absolut positioniert und damit kein Flex-Item: er belegt weder Hoehe
        noch einen zusaetzlichen `gap` dieser Spalte.
      */}
      <Toast text={meldung?.text ?? null} nummer={meldung?.nummer} />

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
        indicatorsByDate={indicatorsByDate}
        countsByDate={countsByDate}
        spans={spans}
        colourByEngagement={colourByEngagement}
        onCreateForDate={(datum) => oeffneAnlage(datum)}
        onMonthChange={(richtung) => wechsleMonat(addMonths(view.month, richtung))}
      />

      {/*
        Die Tagesliste ist die zweite Haelfte der Kompaktform (Plan 6.2): das
        Raster zeigt unter 768 px nur noch Punkte und Zaehler, die Karten
        stehen hier. Ab md blendet die Liste sich selbst aus - dort tragen die
        Zellen die Karten wieder.
      */}
      {ausgewaehlterTag !== null && (kartenProTag.get(ausgewaehlterTag)?.length ?? 0) > 0 && (
        <DayList
          date={parseLocalDate(ausgewaehlterTag)}
          cards={kartenProTag.get(ausgewaehlterTag)!}
          onOpen={(worksiteDayId) =>
            gehe({
              monat: view.month,
              tag: ausgewaehlterTag,
              drawer: "tag",
              id: worksiteDayId,
            })
          }
        />
      )}

      {viewState.drawer === "tag" && (
        <DayDrawer
          key={viewState.worksiteDayId}
          worksiteDayId={viewState.worksiteDayId}
          today={view.today}
          onClose={schliesse}
          onSaved={() => {
            nachAenderung();
            /*
             * Nach `nachAenderung`, nicht davor: dessen `gehe` raeumt die alte
             * Bestaetigung weg. Das Datum kommt aus `viewState.tag`, und das
             * hat `resolvePlanungsViewState` aus dem LESEMODELL genommen
             * (`karte.date`), nicht aus der URL - die koennte luegen.
             */
            melde(baustellentagGespeichert(viewState.tag));
          }}
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
          /*
           * Fokusrueckgabe, wenn der Ausloeser das Schliessen nicht ueberlebt
           * (EYT-174). Unterhalb des md-Umbruchs kommt der Klick aus der
           * Tagesliste, und die faellt mit `tag` aus der URL weg - die Karte,
           * die den Drawer geoeffnet hat, gibt es danach nicht mehr.
           *
           * Der Ersatz ist deshalb die Flaeche, ueber die GENAU DIESER Tag
           * weiter bedienbar ist: sein Kompaktindikator. Bewusst kein Griff
           * nach "der ersten Tageskarte" - die gehoerte irgendeinem Tag. Der
           * Drawer fragt hier nur, wenn der echte Ausloeser weg ist; auf dem
           * Desktop ueberlebt er und dieser Zweig wird nie erreicht.
           */
          restoreFocusFallback={() =>
            document.querySelector<HTMLElement>(
              `[role="gridcell"][data-datum="${viewState.tag}"] [data-testid="tagesindikator"]`,
            )
          }
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
          onApplied={(ergebnis) => {
            setSerie(null);
            nachAenderung();
            // `updatedDayIds` ist die Zahl der wirklich geschriebenen Tage.
            // Die Zieltage der Vorschau koennen groesser sein - ausgeschlossene
            // und gesperrte Tage stehen dort mit drin.
            melde(serieUebernommen(ergebnis.updatedDayIds.length));
          }}
        />
      )}

      {viewState.drawer === "neu" && (
        <EngagementDrawer
          onClose={schliesse}
          onCreated={(ergebnis, titel) => {
            // Die Servertruth hat sich geaendert; ohne refresh zeigte der
            // Kalender weiter den Stand von vor der Anlage.
            nachAenderung();
            /*
             * UX-020 verlangt Name UND Anzahl. Die Anzahl ist die Laenge von
             * `worksiteDayIds` aus der 201-Antwort - die Tage, die der Server
             * wirklich materialisiert hat. Die im Assistenten abgeleitete
             * Vorschau waere eine Schaetzung und kann abweichen.
             */
            melde(einsatzAngelegt(titel, ergebnis.worksiteDayIds.length));
          }}
        />
      )}
    </div>
  );
}
