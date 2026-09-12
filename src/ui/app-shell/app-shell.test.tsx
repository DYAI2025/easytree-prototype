import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

/*
 * jsdom hat keine Layout-Engine. Die Regel color-contrast braucht
 * HTMLCanvasElement#getContext, das jsdom nicht implementiert; sie landet
 * deshalb nie in `violations`, sondern in `incomplete`, und gibt bei jedem Lauf
 * "Not implemented: HTMLCanvasElement's getContext()" aus. Kontrast wird
 * stattdessen im echten Browser geprueft (TASK-005 / TASK-032).
 */
const AXE_OPTIONS: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
};

/*
 * Ohne `globals: true` kann @testing-library/react sein afterEach(cleanup)
 * nicht selbst registrieren (es prueft `typeof afterEach === "function"`).
 * Ohne diese Zeile stapeln sich die Container in document.body.
 */
afterEach(cleanup);

function formatViolations(violations: axe.Result[]): string[] {
  return violations.map((v) => `${v.id} (${v.impact}) :: ${v.help}`);
}

describe("AppShell", () => {
  it("stellt den Skip-Link als erstes fokussierbares Element auf #hauptinhalt", () => {
    const { container } = render(<AppShell>Inhalt</AppShell>);

    const focusable = container.querySelectorAll<HTMLElement>("a[href], button, [tabindex]");
    const first = focusable[0];

    expect(first?.tagName).toBe("A");
    expect(first?.getAttribute("href")).toBe("#hauptinhalt");
    expect(first?.textContent).toBe("Zum Hauptinhalt");
  });

  it("haelt die Landmarks header, nav und genau ein main", () => {
    const { container } = render(<AppShell>Inhalt</AppShell>);

    expect(container.querySelectorAll("header")).toHaveLength(1);
    expect(container.querySelectorAll("nav")).toHaveLength(1);
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Hauptnavigation");
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector("main")?.id).toBe("hauptinhalt");
  });

  it("bietet die vier Hauptnavigationsziele an", () => {
    const { container } = render(<AppShell>Inhalt</AppShell>);

    const hrefs = [...container.querySelectorAll("nav a")].map((a) => a.getAttribute("href"));

    expect(hrefs).toEqual(["/planung", "/mitarbeitende", "/ressourcen", "/auftraggeber"]);
  });

  /*
   * REQ-F-012 verlangt ausdruecklich "Navigation Mitarbeitende GETRENNT von
   * Ressourcen". Der href-Test darueber prueft die Liste als Ganzes; dieser
   * Test prueft die eine Eigenschaft, die dabei verloren gehen koennte: zwei
   * eigene Ziele mit eigenen Beschriftungen, nicht ein zusammengefasster
   * Punkt "Stammdaten".
   */
  it("fuehrt Mitarbeitende und Ressourcen als getrennte Navigationsziele", () => {
    render(<AppShell>Inhalt</AppShell>);

    const navigation = screen.getByRole("navigation", { name: "Hauptnavigation" });
    const mitarbeitende = within(navigation).getByRole("link", { name: "Mitarbeitende" });
    const ressourcen = within(navigation).getByRole("link", { name: "Ressourcen" });

    expect(mitarbeitende).not.toBe(ressourcen);
    expect(mitarbeitende.getAttribute("href")).toBe("/mitarbeitende");
    expect(ressourcen.getAttribute("href")).toBe("/ressourcen");
  });

  it("meldet 0 axe-Violations", async () => {
    const { container } = render(<AppShell>Inhalt</AppShell>);

    const results = await axe.run(container, AXE_OPTIONS);

    expect(formatViolations(results.violations)).toEqual([]);
  });
});
