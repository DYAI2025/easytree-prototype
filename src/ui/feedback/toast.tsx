"use client";

/**
 * Kurze Rueckmeldung nach einer erfolgreichen Aktion.
 *
 * `role="status"` und nicht `role="alert"`: eine Erfolgsmeldung soll den
 * Vorlesefluss nicht unterbrechen. Fehler nutzen `role="alert"`.
 */
export function Toast({ text }: { readonly text: string | null }) {
  return (
    <div role="status" aria-live="polite" className="min-h-6">
      {text !== null && (
        <span className="rounded bg-published-bg px-2 py-1 text-published-text">{text}</span>
      )}
    </div>
  );
}
