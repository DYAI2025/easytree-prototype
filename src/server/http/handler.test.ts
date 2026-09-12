import { inspect } from "node:util";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { DomainRuleError } from "../../domain/workday-derivation";
import { defineRoute } from "./handler";
import { CORRELATION_HEADER } from "./correlation";

const anfrage = (init?: RequestInit) => new Request("http://localhost/api/test", init);

describe("defineRoute", () => {
  it("beantwortet einen unbekannten Fehler mit 500 und OHNE Stacktrace", async () => {
    const fehlerLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const route = defineRoute({
      handler: async () => {
        throw new Error("Interner Zustand mit geheimem Detail");
      },
    });

    const response = await route(anfrage());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("geheimem Detail");
    expect(body.title).toBeTruthy();

    fehlerLog.mockRestore();
  });

  it("bildet einen DomainRuleError auf seinen Status und seinen type ab", async () => {
    const route = defineRoute({
      handler: async () => {
        throw new DomainRuleError("ENGAGEMENT_START_IN_PAST", "Start liegt vor heute.");
      },
    });

    const response = await route(anfrage());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.type).toBe("urn:easytree-prototype:problem:ENGAGEMENT_START_IN_PAST");
    expect(body.status).toBe(422);
    expect(body.detail).toBe("Start liegt vor heute.");
  });

  it("weist einen ungueltigen Body mit 400 und meta.issues ab", async () => {
    const route = defineRoute({
      bodySchema: z.object({ name: z.string().min(1) }),
      handler: async () => ({ ok: true }),
    });

    const response = await route(
      anfrage({
        method: "POST",
        body: JSON.stringify({ name: "" }),
        headers: { "content-type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.type).toBe("urn:easytree-prototype:problem:VALIDATION_FAILED");
    expect(Array.isArray(body.meta.issues)).toBe(true);
    expect(body.meta.issues[0].field).toBe("name");
  });

  it("spiegelt eine mitgelieferte Correlation-ID und erzeugt sonst eine UUID", async () => {
    const route = defineRoute({ handler: async (ctx) => ({ gesehen: ctx.correlationId }) });

    const mit = await route(anfrage({ headers: { [CORRELATION_HEADER]: "corr-von-aussen" } }));
    expect(mit.headers.get(CORRELATION_HEADER)).toBe("corr-von-aussen");
    expect((await mit.json()).gesehen).toBe("corr-von-aussen");

    const ohne = await route(anfrage());
    expect(ohne.headers.get(CORRELATION_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("liefert Erfolgsantworten als JSON mit dem gewuenschten Status", async () => {
    const route = defineRoute({ status: 201, handler: async () => ({ id: "abc" }) });
    const response = await route(anfrage({ method: "POST" }));

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ id: "abc" });
  });

  it("reicht die in Next 16 asynchronen Routenparameter ausgepackt weiter", async () => {
    const route = defineRoute({
      handler: async (ctx) => ({ id: ctx.params.id }),
    });

    const response = await route(anfrage(), { params: Promise.resolve({ id: "wd-42" }) });

    expect(await response.json()).toEqual({ id: "wd-42" });
  });

  it("protokolliert nur Code und Correlation-ID, nicht die Nutzereingabe", async () => {
    const aufrufe: unknown[][] = [];
    const fehlerLog = vi.spyOn(console, "error").mockImplementation((...args) => {
      aufrufe.push(args);
    });

    const route = defineRoute({
      handler: async () => {
        throw new Error("Adresse Musterweg 1, 14467 Potsdam");
      },
    });

    await route(anfrage({ headers: { [CORRELATION_HEADER]: "corr-log" } }));

    // JSON.stringify allein genuegt NICHT: ein Error serialisiert zu {} und
    // seine Meldung waere unsichtbar. util.inspect zeigt sie.
    const protokoll = inspect(aufrufe, { depth: 6 });
    expect(protokoll).toContain("corr-log");
    expect(protokoll).not.toContain("Musterweg");
    expect(protokoll).not.toContain("Potsdam");

    fehlerLog.mockRestore();
  });
});
