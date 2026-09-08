import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildMonthGrid } from "../../domain/month-grid";
import { parseLocalDate } from "../../domain/local-date";
import { MonthGrid } from "./month-grid";
import { DayCardStack } from "./day-card";

afterEach(cleanup);

const grid = buildMonthGrid("2026-09");

function renderGrid(overrides: Partial<Parameters<typeof MonthGrid>[0]> = {}) {
  return render(
    <>
      <h1 id="monatstitel">September 2026</h1>
      <MonthGrid
        grid={grid}
        today={parseLocalDate("2026-09-10")}
        labelledBy="monatstitel"
        onCreateForDate={() => {}}
        onMonthChange={() => {}}
        {...overrides}
      />
    </>,
  );
}

describe("MonthGrid: Struktur und ARIA", () => {
  it("ist ein grid und verweist auf den Monatstitel", () => {
    const { container } = renderGrid();
    const gridEl = container.querySelector('[role="grid"]');

    expect(gridEl).not.toBeNull();
    expect(gridEl?.getAttribute("aria-labelledby")).toBe("monatstitel");
  });

  it("hat acht Spaltenkoepfe: Kalenderwoche plus Mo bis So", () => {
    const { container } = renderGrid();
    const koepfe = [...container.querySelectorAll('[role="columnheader"]')];

    expect(koepfe).toHaveLength(8);
    expect(koepfe[0]?.getAttribute("aria-label")).toBe("Kalenderwoche");
    expect(koepfe.slice(1).map((k) => k.textContent)).toEqual([
      "Mo",
      "Di",
      "Mi",
      "Do",
      "Fr",
      "Sa",
      "So",
    ]);
  });

  it("fuehrt je Zeile einen rowheader mit der Kalenderwoche", () => {
    const { container } = renderGrid();
    const zeilenkoepfe = [...container.querySelectorAll('[role="rowheader"]')];

    // Fuenf Datenzeilen im September 2026.
    expect(zeilenkoepfe).toHaveLength(5);
    expect(zeilenkoepfe[0]?.textContent).toContain("36");
    expect(zeilenkoepfe[0]?.getAttribute("aria-label")).toBe("Kalenderwoche 36");
  });

  it("hat 35 Tageszellen mit vollstaendigem Datumslabel", () => {
    const { container } = renderGrid();
    const zellen = [...container.querySelectorAll('[role="gridcell"]')];

    expect(zellen).toHaveLength(35);
    // Das Label muss ohne visuellen Kontext verstaendlich sein.
    expect(zellen[0]?.getAttribute("aria-label")).toBe("Montag, 31. August 2026, keine Einsaetze");
    const zehnter = zellen.find((z) => z.getAttribute("data-datum") === "2026-09-10");
    expect(zehnter?.getAttribute("aria-label")).toBe(
      "Donnerstag, 10. September 2026, keine Einsaetze",
    );
  });

  it("markiert genau den heutigen Tag mit aria-current", () => {
    const { container } = renderGrid();
    const heute = [...container.querySelectorAll('[aria-current="date"]')];

    expect(heute).toHaveLength(1);
    expect(heute[0]?.getAttribute("data-datum")).toBe("2026-09-10");
  });

  it("kennzeichnet Nachbarmonatstage, laesst sie aber bedienbar", () => {
    const { container } = renderGrid();
    const august = container.querySelector('[data-datum="2026-08-31"]');

    expect(august?.getAttribute("data-ausserhalb")).toBe("true");
    // Nachbarmonatstage sind klickbar - aria-disabled waere falsch.
    expect(august?.getAttribute("aria-disabled")).toBeNull();
  });

  it("laesst die Tageszahl auch ohne Farbe erkennbar", () => {
    const { container } = renderGrid();
    const zelle = container.querySelector('[data-datum="2026-09-10"]');

    expect(zelle?.textContent).toContain("10");
  });
});

describe("MonthGrid: Roving Tabindex und Tastatur", () => {
  const zellen = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLElement>('[role="gridcell"]'),
  ];

  const aktiv = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]');

  it("haelt genau eine Zelle im Tabfluss", () => {
    const { container } = renderGrid();

    expect(zellen(container).filter((z) => z.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(zellen(container).filter((z) => z.getAttribute("tabindex") === "-1")).toHaveLength(34);
  });

  it("startet auf dem heutigen Tag", () => {
    const { container } = renderGrid();

    expect(aktiv(container)?.getAttribute("data-datum")).toBe("2026-09-10");
  });

  it("bewegt den Fokus mit den Pfeiltasten", async () => {
    const user = userEvent.setup();
    const { container } = renderGrid();

    aktiv(container)?.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.getAttribute("data-datum")).toBe("2026-09-11");

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.getAttribute("data-datum")).toBe("2026-09-18");

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.getAttribute("data-datum")).toBe("2026-09-17");

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement?.getAttribute("data-datum")).toBe("2026-09-10");
  });

  it("ueberspringt die Kalenderwochen-Spalte", async () => {
    const user = userEvent.setup();
    const { container } = renderGrid();

    // Montag 2026-09-07 ist der Zeilenanfang; links davon steht die KW-Spalte.
    container.querySelector<HTMLElement>('[data-datum="2026-09-07"]')?.focus();
    await user.keyboard("{ArrowLeft}");

    // Der Fokus landet auf dem Vortag der vorigen Zeile, nie auf dem rowheader.
    expect(document.activeElement?.getAttribute("role")).toBe("gridcell");
    expect(document.activeElement?.getAttribute("data-datum")).toBe("2026-09-06");
  });

  it("springt mit Home und End an Zeilenanfang und -ende", async () => {
    const user = userEvent.setup();
    const { container } = renderGrid();

    container.querySelector<HTMLElement>('[data-datum="2026-09-10"]')?.focus();
    await user.keyboard("{Home}");
    expect(document.activeElement?.getAttribute("data-datum")).toBe("2026-09-07");

    await user.keyboard("{End}");
    expect(document.activeElement?.getAttribute("data-datum")).toBe("2026-09-13");
  });

  it("zieht den Tabindex mit dem Fokus mit", async () => {
    const user = userEvent.setup();
    const { container } = renderGrid();

    aktiv(container)?.focus();
    await user.keyboard("{ArrowRight}");

    expect(zellen(container).filter((z) => z.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(aktiv(container)?.getAttribute("data-datum")).toBe("2026-09-11");
  });
});

describe("MonthGrid: Aktionen und Barrierefreiheit", () => {
  it("startet die Einsatzanlage mit dem Datum der Zelle", async () => {
    const user = userEvent.setup();
    const onCreateForDate = vi.fn();
    const { container } = renderGrid({ onCreateForDate });

    container.querySelector<HTMLElement>('[data-datum="2026-09-15"]')?.focus();
    await user.keyboard("{Enter}");

    expect(onCreateForDate).toHaveBeenCalledExactlyOnceWith("2026-09-15");
  });

  it("startet die Einsatzanlage auch mit der Leertaste", async () => {
    const user = userEvent.setup();
    const onCreateForDate = vi.fn();
    const { container } = renderGrid({ onCreateForDate });

    container.querySelector<HTMLElement>('[data-datum="2026-09-15"]')?.focus();
    await user.keyboard(" ");

    expect(onCreateForDate).toHaveBeenCalledExactlyOnceWith("2026-09-15");
  });

  it("wechselt den Monat mit PageUp und PageDown", async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    const { container } = renderGrid({ onMonthChange });

    container.querySelector<HTMLElement>('[data-datum="2026-09-10"]')?.focus();
    await user.keyboard("{PageUp}");
    expect(onMonthChange).toHaveBeenCalledWith(-1);

    await user.keyboard("{PageDown}");
    expect(onMonthChange).toHaveBeenCalledWith(1);
    expect(onMonthChange).toHaveBeenCalledTimes(2);
  });

  it("meldet 0 axe-Violations", async () => {
    const { container } = renderGrid();

    const ergebnis = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });

    expect(ergebnis.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

describe("MonthGrid Tastatur in der Zelle", () => {
  it("laesst Enter an ein Element IN der Zelle durch, statt es abzufangen", async () => {
    const user = userEvent.setup();
    const onCreateForDate = vi.fn();
    const onOpen = vi.fn();

    const { container } = render(
      <MonthGrid
        grid={buildMonthGrid("2026-09")}
        today={parseLocalDate("2026-09-01")}
        labelledBy="titel"
        onCreateForDate={onCreateForDate}
        onMonthChange={() => {}}
        cardsByDate={{
          "2026-09-07": (
            <DayCardStack
              cards={[
                {
                  worksiteDayId: "wd-1",
                  engagementId: "eng-1",
                  title: "Baumpflege",
                  worksiteName: "Nordring",
                  colourKey: "moos",
                  employeeCount: 1,
                  resourceCount: 0,
                },
              ]}
              onOpen={onOpen}
            />
          ),
        }}
      />,
    );

    const karte = container.querySelector<HTMLButtonElement>('[data-testid="tageskarte"]')!;

    karte.focus();
    await user.keyboard("{Enter}");

    // Der Zellenhandler darf nur reagieren, wenn die ZELLE selbst den Fokus
    // hat. Sonst verschluckt sein preventDefault die Aktivierung jedes
    // Knopfs in der Zelle - gemessen im Browser an "+n weitere".
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("wd-1");
    expect(onCreateForDate).not.toHaveBeenCalled();
  });

  it("reagiert weiterhin, wenn die Zelle selbst den Fokus hat", async () => {
    const user = userEvent.setup();
    const onCreateForDate = vi.fn();

    const { container } = render(
      <MonthGrid
        grid={buildMonthGrid("2026-09")}
        today={parseLocalDate("2026-09-01")}
        labelledBy="titel"
        onCreateForDate={onCreateForDate}
        onMonthChange={() => {}}
      />,
    );

    container.querySelector<HTMLElement>('[role="gridcell"][data-datum="2026-09-07"]')!.focus();
    await user.keyboard("{Enter}");

    expect(onCreateForDate).toHaveBeenCalledExactlyOnceWith("2026-09-07");
  });
});
