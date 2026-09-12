import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayCard, DayCardStack, type DayCardModel } from "./day-card";

afterEach(cleanup);

const karte = (overrides: Partial<DayCardModel> = {}): DayCardModel => ({
  worksiteDayId: "wd-1",
  engagementId: "eng-1",
  title: "Baumpflege Herbstschnitt",
  worksiteName: "Parkanlage Nordring",
  colourKey: "moos",
  employeeCount: 5,
  resourceCount: 2,
  ...overrides,
});

describe("DayCard", () => {
  it("rendert EINE Karte fuer fuenf Mitarbeitende und nennt sie als Text", () => {
    const { container } = render(<DayCard card={karte()} onOpen={() => {}} />);

    // Die Kernentscheidung: ein Baustellentag ist eine Karte, unabhaengig von
    // der Teamgroesse.
    expect(container.querySelectorAll('[data-testid="tageskarte"]')).toHaveLength(1);
    expect(container.textContent).toContain("5 Personen");
    expect(container.textContent).toContain("2 Ressourcen");
  });

  it("nennt eine einzelne Person im Singular", () => {
    const { container } = render(
      <DayCard card={karte({ employeeCount: 1, resourceCount: 1 })} onOpen={() => {}} />,
    );

    expect(container.textContent).toContain("1 Person");
    expect(container.textContent).not.toContain("1 Personen");
    expect(container.textContent).toContain("1 Ressource");
  });

  it("traegt den Einsatztitel immer als Text, nicht nur als Farbe", () => {
    const { container } = render(<DayCard card={karte()} onOpen={() => {}} />);
    const el = container.querySelector('[data-testid="tageskarte"]');

    expect(el?.textContent).toContain("Baumpflege Herbstschnitt");
    // Der Farbmarker ist rein dekorativ und darf keine Information allein tragen.
    const marker = container.querySelector('[data-testid="farbmarker"]');
    expect(marker?.getAttribute("aria-hidden")).toBe("true");
    expect(marker?.textContent).toBe("");
  });

  it("haelt einen langen Namen zugaenglich vollstaendig", () => {
    const langer = "Allee am Wasserwerk - Abschnitt West, Baumreihe 1-48";
    const { container } = render(
      <DayCard card={karte({ worksiteName: langer })} onOpen={() => {}} />,
    );
    const el = container.querySelector('[data-testid="tageskarte"]');

    expect(el?.getAttribute("title")).toContain(langer);
    expect(el?.getAttribute("aria-label")).toContain(langer);
    // Sichtbar gekuerzt, aber nie abgeschnitten im zugaenglichen Namen.
    expect(container.querySelector('[data-truncate="true"]')).not.toBeNull();
  });

  it("oeffnet die Tagesbearbeitung ueber Tastatur", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(<DayCard card={karte()} onOpen={onOpen} />);

    container.querySelector<HTMLElement>('[data-testid="tageskarte"]')?.focus();
    await user.keyboard("{Enter}");

    expect(onOpen).toHaveBeenCalledExactlyOnceWith("wd-1");
  });
});

describe("DayCardStack", () => {
  const viele = (anzahl: number): DayCardModel[] =>
    Array.from({ length: anzahl }, (_, i) =>
      karte({
        worksiteDayId: `wd-${i}`,
        engagementId: `eng-${i}`,
        title: `Einsatz ${i}`,
        colourKey: i % 2 === 0 ? "moos" : "petrol",
      }),
    );

  it("stapelt zwei Einsaetze am selben Tag mit unterschiedlicher Farbklasse", () => {
    const { container } = render(<DayCardStack cards={viele(2)} onOpen={() => {}} />);
    const karten = [...container.querySelectorAll('[data-testid="tageskarte"]')];

    expect(karten).toHaveLength(2);
    const farben = karten.map((k) => k.getAttribute("data-farbe"));
    expect(new Set(farben).size).toBe(2);
  });

  it("zeigt ab der vierten Karte einen Button plus n weitere", () => {
    const { container } = render(<DayCardStack cards={viele(5)} onOpen={() => {}} />);

    expect(container.querySelectorAll('[data-testid="tageskarte"]')).toHaveLength(3);

    const mehr = container.querySelector<HTMLButtonElement>('[data-testid="mehr-karten"]');

    expect(mehr?.textContent).toBe("+2 weitere");
    // Der Button ist ein Disclosure-Control und sagt seinen Zustand an.
    expect(mehr?.getAttribute("aria-expanded")).toBe("false");
  });

  it("macht mit der Maus alle Karten des Tages sichtbar", async () => {
    const user = userEvent.setup();
    const { container } = render(<DayCardStack cards={viele(5)} onOpen={() => {}} />);

    await user.click(container.querySelector<HTMLButtonElement>('[data-testid="mehr-karten"]')!);

    expect(container.querySelectorAll('[data-testid="tageskarte"]')).toHaveLength(5);

    const mehr = container.querySelector<HTMLButtonElement>('[data-testid="mehr-karten"]');

    expect(mehr?.getAttribute("aria-expanded")).toBe("true");
    expect(mehr?.textContent).toBe("Weniger anzeigen");
  });

  it("macht mit der Tastatur alle Karten des Tages sichtbar", async () => {
    const user = userEvent.setup();
    const { container } = render(<DayCardStack cards={viele(5)} onOpen={() => {}} />);

    container.querySelector<HTMLButtonElement>('[data-testid="mehr-karten"]')!.focus();
    await user.keyboard("{Enter}");

    expect(container.querySelectorAll('[data-testid="tageskarte"]')).toHaveLength(5);
  });

  it("macht die zuvor versteckte vierte Karte erreichbar und bedienbar", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(<DayCardStack cards={viele(5)} onOpen={onOpen} />);

    // Vor dem Aufklappen existiert die vierte Karte gar nicht im DOM - genau
    // das war der Befund B-02: ein Knopf ohne Wirkung.
    expect(container.querySelector('[data-worksite-day-id="wd-3"]')).toBeNull();

    await user.click(container.querySelector<HTMLButtonElement>('[data-testid="mehr-karten"]')!);

    const vierte = container.querySelector<HTMLButtonElement>('[data-worksite-day-id="wd-3"]');

    expect(vierte).not.toBeNull();

    vierte!.focus();
    expect(document.activeElement).toBe(vierte);

    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("wd-3");
  });

  it("klappt wieder zu", async () => {
    const user = userEvent.setup();
    const { container } = render(<DayCardStack cards={viele(5)} onOpen={() => {}} />);
    const mehr = () => container.querySelector<HTMLButtonElement>('[data-testid="mehr-karten"]')!;

    await user.click(mehr());
    await user.click(mehr());

    expect(container.querySelectorAll('[data-testid="tageskarte"]')).toHaveLength(3);
    expect(mehr().getAttribute("aria-expanded")).toBe("false");
  });

  it("zeigt keinen Mehr-Button bei genau drei Karten", () => {
    const { container } = render(<DayCardStack cards={viele(3)} onOpen={() => {}} />);

    expect(container.querySelectorAll('[data-testid="tageskarte"]')).toHaveLength(3);
    expect(container.querySelector('[data-testid="mehr-karten"]')).toBeNull();
  });
});

describe("DayCard Farbmarker", () => {
  it("faerbt den Marker ueber die Palettenvariable statt ueber eine gebaute Klasse", () => {
    const { container } = render(
      <DayCard
        card={{
          worksiteDayId: "wd-1",
          engagementId: "eng-1",
          title: "Baumpflege",
          worksiteName: "Nordring",
          colourKey: "petrol",
          employeeCount: 3,
          resourceCount: 2,
        }}
        onOpen={() => {}}
      />,
    );
    const marker = container.querySelector<HTMLElement>('[data-testid="farbmarker"]')!;

    // `bg-${key}-frame` existiert als Tailwind-Klasse nicht: Tailwind liest
    // Klassennamen statisch aus dem Quelltext und sieht diese nie.
    expect(marker.className).not.toContain("petrol");
    expect(marker.style.backgroundColor).toBe("var(--eyt-colour-petrol-frame)");
  });
});
