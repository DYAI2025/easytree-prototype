import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { Badge } from "./badge";
import { Button } from "./button";

const AXE_OPTIONS: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
};

afterEach(cleanup);

describe("Button", () => {
  it("rendert einen Button mit Beschriftung", () => {
    const { container } = render(<Button>Einsatz anlegen</Button>);

    const button = container.querySelector("button");

    expect(button?.textContent).toBe("Einsatz anlegen");
    expect(button?.getAttribute("type")).toBe("button");
  });

  it("laesst spaetere Utility-Klassen gewinnen statt sie zu verdoppeln", () => {
    const { container } = render(<Button className="bg-danger-bg">X</Button>);

    const klass = container.querySelector("button")?.className ?? "";

    expect(klass).toContain("bg-danger-bg");
    expect(klass).not.toContain("bg-action");
  });
});

describe("Badge", () => {
  it("traegt Status nie nur ueber Farbe: Icon und Text zusammen", () => {
    const { container } = render(<Badge variant="danger">Konflikt</Badge>);

    expect(container.textContent).toContain("Konflikt");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("meldet 0 axe-Violations fuer alle Varianten", async () => {
    const { container } = render(
      <>
        <Badge variant="published">Geplant</Badge>
        <Badge variant="draft">Entwurf</Badge>
        <Badge variant="danger">Konflikt</Badge>
        <Badge variant="info">Hinweis</Badge>
      </>,
    );

    const results = await axe.run(container, AXE_OPTIONS);

    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
