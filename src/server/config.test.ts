import { describe, expect, it } from "vitest";

import { loadServerConfig } from "./config";

describe("config", () => {
  it("nennt den Variablennamen, wenn DATABASE_URL fehlt", () => {
    expect(() => loadServerConfig({})).toThrow(/DATABASE_URL/);
  });

  it("liest eine gueltige Konfiguration und setzt GEOCODER_PROVIDER auf manual", () => {
    const config = loadServerConfig({
      DATABASE_URL: "postgres://postgres:easytree@127.0.0.1:55432/easytree_prototype",
    });

    expect(config.DATABASE_URL).toBe(
      "postgres://postgres:easytree@127.0.0.1:55432/easytree_prototype",
    );
    expect(config.GEOCODER_PROVIDER).toBe("manual");
  });
});
