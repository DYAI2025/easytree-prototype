import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { localDateInZone } from "../../domain/local-date";
import { CORRELATION_HEADER, resolveCorrelationId } from "../http/correlation";
import { DEMO_ORG_ID, resolveTenant } from "../tenant/tenant-context";
import { DEFAULT_TIME_ZONE, fixedClock, serverClock, systemClock } from "./clock";

describe("systemClock", () => {
  it("liefert dasselbe lokale Datum wie localDateInZone", () => {
    expect(systemClock().todayLocal(DEFAULT_TIME_ZONE)).toBe(
      localDateInZone(new Date(), DEFAULT_TIME_ZONE),
    );
  });

  it("nutzt Europe/Berlin als Vorgabe", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Europe/Berlin");
  });
});

describe("fixedClock", () => {
  it("liefert am Vormittag den Kalendertag in Berlin", () => {
    expect(fixedClock("2026-09-07T10:00:00Z").todayLocal(DEFAULT_TIME_ZONE)).toBe("2026-09-07");
  });

  it("rechnet den spaeten Abend bereits auf den Folgetag", () => {
    expect(fixedClock("2026-09-07T22:30:00Z").todayLocal(DEFAULT_TIME_ZONE)).toBe("2026-09-08");
  });

  it("haelt now() stabil", () => {
    const clock = fixedClock("2026-09-07T10:00:00Z");

    expect(clock.now().toISOString()).toBe("2026-09-07T10:00:00.000Z");
    expect(clock.now().toISOString()).toBe(clock.now().toISOString());
  });
});

describe("serverClock", () => {
  it("uebernimmt EASYTREE_FIXED_TODAY als heutiges Datum", () => {
    const clock = serverClock({ EASYTREE_FIXED_TODAY: "2026-09-05" });

    expect(clock.todayLocal()).toBe("2026-09-05");
  });

  it("bricht bei NODE_ENV=production ohne EASYTREE_PROTOTYPE=1 ab", () => {
    expect(() =>
      serverClock({ EASYTREE_FIXED_TODAY: "2026-09-05", NODE_ENV: "production" }),
    ).toThrow(/EASYTREE_PROTOTYPE/);
  });

  it("erlaubt den Zeitanker in production mit EASYTREE_PROTOTYPE=1", () => {
    const clock = serverClock({
      EASYTREE_FIXED_TODAY: "2026-09-05",
      NODE_ENV: "production",
      EASYTREE_PROTOTYPE: "1",
    });

    expect(clock.todayLocal()).toBe("2026-09-05");
  });

  it("weist ein unplausibles Datum im Zeitanker ab", () => {
    expect(() => serverClock({ EASYTREE_FIXED_TODAY: "2026-13-45" })).toThrow(/ungültig/i);
  });

  it("faellt ohne Zeitanker auf die Systemzeit zurueck", () => {
    expect(serverClock({}).todayLocal()).toBe(localDateInZone(new Date(), DEFAULT_TIME_ZONE));
  });
});

describe("resolveTenant", () => {
  it("liefert den Demo-Mandanten serverseitig", () => {
    const tenant = resolveTenant();

    expect(tenant.orgId).toBe(DEMO_ORG_ID);
    expect(tenant.timeZone).toBe(DEFAULT_TIME_ZONE);
    expect(tenant.actor).toBe("demo-admin");
  });

  it("liest den Mandanten NIE aus einem Request", () => {
    // Grep-Assertion: die Datei darf keinen Request beruehren, sonst waere die
    // Mandantengrenze von aussen steuerbar.
    const quelle = readFileSync("src/server/tenant/tenant-context.ts", "utf8");

    expect(quelle.toLowerCase()).not.toContain("request");
    expect(quelle.toLowerCase()).not.toContain("headers");
    expect(quelle.toLowerCase()).not.toContain("searchparams");
  });
});

describe("resolveCorrelationId", () => {
  it("uebernimmt eine mitgelieferte Correlation-ID", () => {
    const headers = new Headers({ [CORRELATION_HEADER]: "corr-von-aussen" });

    expect(resolveCorrelationId(headers)).toBe("corr-von-aussen");
  });

  it("erzeugt eine neue ID, wenn keine mitkommt", () => {
    const first = resolveCorrelationId(new Headers());
    const second = resolveCorrelationId(new Headers());

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });

  it("ignoriert eine leere oder unplausible ID und erzeugt eine neue", () => {
    expect(resolveCorrelationId(new Headers({ [CORRELATION_HEADER]: "   " }))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(resolveCorrelationId(new Headers({ [CORRELATION_HEADER]: "x".repeat(300) }))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
