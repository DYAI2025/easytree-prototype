import type { SpanSegment } from "../../domain/month-grid";

/**
 * Hintergrundbalken der mehrtaegigen Einsaetze.
 *
 * Rein dekorativ: `aria-hidden`, kein Text. Die Information, welcher Einsatz
 * an welchem Tag liegt, traegt ausschliesslich die Tageskarte - ein Balken
 * allein waere Color-only-Encoding.
 *
 * Die Grid-Spalte ist um eins versetzt, weil Spalte 1 die Kalenderwoche ist.
 */
export function SpanLayer({
  segments,
  colourByEngagement,
  rowBase = 0,
}: {
  readonly segments: readonly SpanSegment[];
  readonly colourByEngagement: Readonly<Record<string, string>>;
  /**
   * Zeilenindex, der auf Gitterzeile 1 abgebildet wird.
   *
   * Das Raster rendert jede Woche als eigenes Grid mit genau einer Zeile.
   * Ohne diese Verschiebung landete ein Segment aus Wochenzeile 2 in
   * Gitterzeile 3 und erzeugte dort zwei leere Zeilen.
   */
  readonly rowBase?: number;
}) {
  return (
    <>
      {segments.map((segment) => {
        const farbe = colourByEngagement[segment.engagementId];

        return (
          <div
            key={`${segment.engagementId}-${segment.rowIndex}-${segment.startCol}`}
            data-testid="span-segment"
            data-zeile={segment.rowIndex}
            data-farbe={farbe}
            data-weiter-links={segment.continuesLeft ? "true" : undefined}
            data-weiter-rechts={segment.continuesRight ? "true" : undefined}
            aria-hidden="true"
            style={{
              gridColumnStart: segment.startCol + 1,
              gridColumnEnd: segment.endCol + 2,
              gridRowStart: segment.rowIndex - rowBase + 1,
              // Variable statt Tailwind-Klasse: der Farbschluessel kommt aus
              // den Daten, eine gebaute Klasse wuerde nie erzeugt.
              backgroundColor: farbe === undefined ? undefined : `var(--eyt-colour-${farbe}-frame)`,
            }}
            className="pointer-events-none mt-7 h-1 self-start rounded"
          />
        );
      })}
    </>
  );
}
