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
}: {
  readonly segments: readonly SpanSegment[];
  readonly colourByEngagement: Readonly<Record<string, string>>;
}) {
  return (
    <>
      {segments.map((segment) => (
        <div
          key={`${segment.engagementId}-${segment.rowIndex}-${segment.startCol}`}
          data-testid="span-segment"
          data-zeile={segment.rowIndex}
          data-farbe={colourByEngagement[segment.engagementId]}
          data-weiter-links={segment.continuesLeft ? "true" : undefined}
          data-weiter-rechts={segment.continuesRight ? "true" : undefined}
          aria-hidden="true"
          style={{
            gridColumnStart: segment.startCol + 1,
            gridColumnEnd: segment.endCol + 2,
            gridRowStart: segment.rowIndex + 1,
          }}
          className="pointer-events-none h-1 self-start rounded"
        />
      ))}
    </>
  );
}
