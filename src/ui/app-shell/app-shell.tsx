import type { ReactNode } from "react";

const NAVIGATION = [
  { href: "/planung", label: "Planung" },
  { href: "/mitarbeitende", label: "Mitarbeitende" },
  { href: "/ressourcen", label: "Ressourcen" },
  { href: "/auftraggeber", label: "Auftraggeber" },
] as const;

/**
 * Rahmen jeder Seite: Skip-Link, Kopfbereich mit Hauptnavigation und genau ein
 * `main#hauptinhalt`. Seiten liefern nur noch ihren Inhalt, kein eigenes `main`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/*
       * sr-only benutzt position:absolute und 1px Groesse, NICHT display:none.
       * Das Element bleibt dadurch fokussierbar und ist das erste Tab-Ziel.
       */}
      <a
        href="#hauptinhalt"
        className="sr-only rounded bg-action px-4 py-2 text-action-contrast focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Zum Hauptinhalt
      </a>

      <header className="border-b border-line bg-surface">
        {/*
         * flex-wrap ist Pflicht, nicht Kosmetik: bei 320 px ragten die vier
         * Links 145 px ueber den Viewport hinaus und das ganze Dokument
         * scrollte horizontal (TASK-048, REQ-NF-004).
         */}
        <nav
          aria-label="Hauptnavigation"
          className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-3"
        >
          {NAVIGATION.map((entry) => (
            <a
              key={entry.href}
              href={entry.href}
              className="inline-flex min-h-11 items-center rounded px-3 py-2 hover:bg-canvas focus-visible:bg-canvas"
            >
              {entry.label}
            </a>
          ))}
        </nav>
      </header>

      <main id="hauptinhalt" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
