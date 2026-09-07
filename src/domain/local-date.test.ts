import { describe, expect, it } from "vitest";

import { parseLocalDate } from "./local-date";

describe("parseLocalDate", () => {
  it("akzeptiert ein gültiges lokales Datum", () => {
    expect(parseLocalDate("2026-09-07")).toBe("2026-09-07");
  });

  it("weist den 31. Februar zurück", () => {
    expect(() => parseLocalDate("2026-02-31")).toThrow(/ungültig/i);
  });
});
