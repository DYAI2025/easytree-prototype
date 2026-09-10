import type { MonthPlanningViewDto } from "../../contracts/worksite-days";

/**
 * Der Ansichtszustand der Planung - und zwar der aus der URL.
 *
 * `CLAUDE.md` und Plan 5.6 legen denselben Vertrag fest:
 * `/planung?monat=…&tag=…&drawer=neu|tag|kosten&id=…`, und Reload rekonstruiert
 * Ansicht und geoeffneten Drawer daraus. Vorher hielt `PlanungsAnsicht` den
 * offenen Drawer in `useState` - ein Reload liess ihn verschwinden und ein Link
 * auf einen Tag existierte nicht (Befund B-05).
 *
 * Dieses Modul ist bewusst pur: keine Router-, keine Fetch-, keine
 * React-Abhaengigkeit. Dieselbe Funktion beantwortet die Frage auf dem Server
 * (Server Component beim Reload/Direktaufruf) und in den Tests.
 *
 * Zwei Entscheidungen stecken darin:
 *
 * 1. Aufloesung gegen das Lesemodell, nicht gegen die URL. `id` gilt nur, wenn
 *    das serverseitig berechnete `MonthPlanningView` den Baustellentag bzw. den
 *    Einsatz im sichtbaren Raster wirklich kennt. Damit zeigt ein
 *    rekonstruierter Drawer garantiert dieselbe Identitaet - und ein
 *    unbrauchbarer Zustand kann gar nicht erst in die Oberflaeche.
 * 2. Unbrauchbarer Zustand ist KEIN fachlicher Fehler. Er wird ignoriert; die
 *    Planung zeigt den Kalender. Eine erfundene Fehlermeldung waere schlimmer
 *    als der stille Rueckfall, weil sie ein Problem behauptet, das es fachlich
 *    nicht gibt.
 */
export const PLANUNGS_DRAWER = ["neu", "tag", "kosten"] as const;

export type PlanungsDrawer = (typeof PLANUNGS_DRAWER)[number];

export type PlanungsViewState =
  /**
   * Kein Drawer - aber moeglicherweise ein ausgewaehlter Tag: unterhalb des
   * md-Umbruchs zeigt die Tagesliste die Karten des gewaehlten Tages, ohne
   * dass ein Drawer offen waere (Plan 6.2).
   */
  | { readonly drawer: null; readonly tag: string | null }
  | { readonly drawer: "neu"; readonly tag: string | null }
  | { readonly drawer: "tag"; readonly worksiteDayId: string; readonly tag: string }
  | {
      readonly drawer: "kosten";
      readonly engagementId: string;
      readonly engagementTitle: string;
      readonly tag: string | null;
    };

/** Der Kalender ohne Drawer und ohne Auswahl - der Rueckfall fuer jeden unbrauchbaren Zustand. */
export const KEIN_DRAWER: PlanungsViewState = { drawer: null, tag: null };

export interface PlanungsUrlEingabe {
  readonly monat: string;
  readonly drawer?: PlanungsDrawer;
  readonly id?: string;
  /** Der adressierte Kalendertag; `null`/fehlend laesst ihn weg. */
  readonly tag?: string | null;
}

/**
 * Baut die eine kanonische Planungs-URL. Feste Reihenfolge der Parameter
 * (`monat`, `tag`, `drawer`, `id`) wie in Plan 5.6 - so ist ein Link
 * vergleichbar und ein Test kann auf die ganze URL schauen.
 */
export function planungsUrl({ monat, drawer, id, tag }: PlanungsUrlEingabe): string {
  const params = new URLSearchParams();

  params.set("monat", monat);

  if (tag !== undefined && tag !== null) {
    params.set("tag", tag);
  }

  if (drawer !== undefined) {
    params.set("drawer", drawer);

    if (id !== undefined) {
      params.set("id", id);
    }
  }

  return `/planung?${params.toString()}`;
}

/** Ein doppelt gesetzter Parameter ist mehrdeutig - und mehrdeutig heisst hier: nicht gesetzt. */
function einzeln(wert: string | readonly string[] | undefined): string | undefined {
  return typeof wert === "string" ? wert : undefined;
}

function istDrawer(wert: string | undefined): wert is PlanungsDrawer {
  return wert !== undefined && (PLANUNGS_DRAWER as readonly string[]).includes(wert);
}

export function resolvePlanungsViewState(
  view: MonthPlanningViewDto,
  params: Readonly<Record<string, string | string[] | undefined>>,
): PlanungsViewState {
  /*
   * Der Tag wird VOR dem Drawer aufgeloest: er ist ein eigenstaendiger
   * Ansichtszustand (die Tagesauswahl der Mobilform) und darf nicht davon
   * abhaengen, ob zusaetzlich ein Drawer offen ist.
   */
  const rasterTage = new Set(view.weeks.flatMap((woche) => woche.days.map((tag) => tag.date)));
  const rohTag = einzeln(params.tag);
  const tag = rohTag !== undefined && rasterTage.has(rohTag) ? rohTag : null;

  const drawer = einzeln(params.drawer);

  if (!istDrawer(drawer)) {
    return { drawer: null, tag };
  }

  if (drawer === "neu") {
    return { drawer: "neu", tag };
  }

  const id = einzeln(params.id);

  if (id === undefined) {
    return { drawer: null, tag };
  }

  if (drawer === "tag") {
    const karte = view.cards.find((eintrag) => eintrag.worksiteDayId === id);

    // Das Datum kommt aus dem Lesemodell, nicht aus der URL: das Modell weiss,
    // an welchem Tag der Baustellentag haengt, die URL koennte luegen.
    return karte === undefined
      ? { drawer: null, tag }
      : { drawer: "tag", worksiteDayId: id, tag: karte.date };
  }

  const einsatz = view.cards.find((eintrag) => eintrag.engagementId === id);

  return einsatz === undefined
    ? { drawer: null, tag }
    : { drawer: "kosten", engagementId: id, engagementTitle: einsatz.title, tag };
}
