import {
  addDays,
  compareLocalDate,
  daysInMonth,
  firstDayOfMonth,
  isoWeekOf,
  monthOf,
  parseLocalMonth,
  weekdayOf,
  type LocalDate,
  type LocalMonth,
} from "./local-date";

/** Mehr Karten je Tag werden zu "+n weitere" zusammengefasst (Plan 6.3). */
export const MAX_VISIBLE_CARDS_PER_DAY = 3;

const DAYS_PER_WEEK = 7;

export interface MonthGridDay {
  readonly date: LocalDate;
  /** false fuer Nachbarmonatstage - sie bleiben klickbar, nur gedaempft. */
  readonly inMonth: boolean;
}

export interface MonthGridWeek {
  readonly isoWeek: number;
  readonly days: MonthGridDay[];
}

export interface MonthGrid {
  readonly month: LocalMonth;
  readonly weeks: MonthGridWeek[];
}

export interface EngagementDays {
  readonly engagementId: string;
  readonly days: readonly LocalDate[];
}

export interface SpanSegment {
  readonly engagementId: string;
  /** Nullbasierter Zeilenindex im Raster. */
  readonly rowIndex: number;
  /** Tagesspalte 1..7 (Mo..So). Im CSS-Grid liegt davor die KW-Spalte. */
  readonly startCol: number;
  readonly endCol: number;
  readonly continuesLeft: boolean;
  readonly continuesRight: boolean;
}

/**
 * Montagsbeginnendes Monatsraster aus vollen Wochen (5 oder 6 Zeilen).
 *
 * Es werden immer volle Wochen gerendert, damit die Zeilen gleich breit sind
 * und Balkensegmente eine feste Spaltenzahl haben.
 */
export function buildMonthGrid(month: LocalMonth | string): MonthGrid {
  const value = parseLocalMonth(month);
  const first = firstDayOfMonth(value);
  const length = daysInMonth(value);

  // Zurueck auf den Montag der ersten Woche (weekdayOf: 1 = Montag).
  const gridStart = addDays(first, -(weekdayOf(first) - 1));
  const last = addDays(first, length - 1);
  // Vor auf den Sonntag der letzten Woche.
  const gridEnd = addDays(last, DAYS_PER_WEEK - weekdayOf(last));

  const weeks: MonthGridWeek[] = [];

  for (let cursor = gridStart; compareLocalDate(cursor, gridEnd) <= 0;) {
    const days: MonthGridDay[] = [];

    for (let column = 0; column < DAYS_PER_WEEK; column += 1) {
      const date = addDays(cursor, column);
      days.push({ date, inMonth: monthOf(date) === value });
    }

    weeks.push({ isoWeek: isoWeekOf(cursor), days });
    cursor = addDays(cursor, DAYS_PER_WEEK);
  }

  return { month: value, weeks };
}

/**
 * Zerlegt die geplanten Tage eines Einsatzes in zeilenweise Balkensegmente.
 *
 * Ein Segment umfasst nur lueckenlos aufeinanderfolgende geplante Tage. Ob der
 * Balken weiterlaeuft, entscheidet der unmittelbare Kalendernachbar der
 * Segmentkante - ueber Zeilen- und Rastergrenze hinweg. Ein Wochenende ohne
 * geplanten Tag ist damit eine Luecke, kein Uebergang.
 *
 * Die Segmente sind rein dekorativ (Plan 6.3, `aria-hidden`); die textliche
 * Zugaenglichkeit traegt die Tageskarte.
 */
export function computeSpanSegments(
  grid: MonthGrid,
  engagements: readonly EngagementDays[],
): SpanSegment[] {
  const segments: SpanSegment[] = [];

  for (const engagement of engagements) {
    const planned = new Set<string>(engagement.days);

    grid.weeks.forEach((week, rowIndex) => {
      let startColumn: number | null = null;

      for (let column = 0; column < DAYS_PER_WEEK; column += 1) {
        const isPlanned = planned.has(week.days[column]!.date);

        if (isPlanned && startColumn === null) {
          startColumn = column;
        }

        const isLastColumn = column === DAYS_PER_WEEK - 1;
        const runEnds = startColumn !== null && (!isPlanned || isLastColumn);

        if (!runEnds) {
          continue;
        }

        const endColumn = isPlanned ? column : column - 1;
        const startDate = week.days[startColumn!]!.date;
        const endDate = week.days[endColumn]!.date;

        segments.push({
          engagementId: engagement.engagementId,
          rowIndex,
          startCol: startColumn! + 1,
          endCol: endColumn + 1,
          continuesLeft: planned.has(addDays(startDate, -1)),
          continuesRight: planned.has(addDays(endDate, 1)),
        });

        startColumn = null;
      }
    });
  }

  return segments;
}
