import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addMonths } from "../../domain/month-grid";
import { MonthToolbar } from "./month-toolbar";

afterEach(cleanup);

describe("addMonths", () => {
  it("rechnet ueber Jahresgrenzen in beide Richtungen", () => {
    expect(addMonths("2026-09", 1)).toBe("2026-10");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-09", 0)).toBe("2026-09");
  });
});

describe("MonthToolbar", () => {
  const renderToolbar = (monat = "2026-09", onNavigate = vi.fn()) => {
    render(
      <MonthToolbar monat={monat} heute="2026-09-08" onNavigate={onNavigate} onCreate={() => {}} />,
    );
    return onNavigate;
  };

  it("zeigt den Monatstitel als einzige h1", () => {
    renderToolbar();

    const ueberschriften = screen.getAllByRole("heading", { level: 1 });
    expect(ueberschriften).toHaveLength(1);
    expect(ueberschriften[0]?.textContent).toBe("September 2026");
  });

  it("blaettert vorwaerts und rueckwaerts", async () => {
    const user = userEvent.setup();
    const onNavigate = renderToolbar("2026-09");

    await user.click(screen.getByRole("button", { name: "Vorheriger Monat" }));
    expect(onNavigate).toHaveBeenCalledWith("2026-08");

    await user.click(screen.getByRole("button", { name: "Naechster Monat" }));
    expect(onNavigate).toHaveBeenCalledWith("2026-10");
  });

  it("blaettert korrekt ueber die Jahresgrenze", async () => {
    const user = userEvent.setup();
    const onNavigate = renderToolbar("2026-12");

    await user.click(screen.getByRole("button", { name: "Naechster Monat" }));
    expect(onNavigate).toHaveBeenCalledWith("2027-01");
  });

  it("springt mit Heute auf den Monat des heutigen Datums", async () => {
    const user = userEvent.setup();
    const onNavigate = renderToolbar("2026-12");

    await user.click(screen.getByRole("button", { name: "Heute" }));
    expect(onNavigate).toHaveBeenCalledWith("2026-09");
  });

  it("bietet die Einsatzanlage als Primaeraktion", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <MonthToolbar monat="2026-09" heute="2026-09-08" onNavigate={() => {}} onCreate={onCreate} />,
    );

    await user.click(screen.getByRole("button", { name: "Einsatz anlegen" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
