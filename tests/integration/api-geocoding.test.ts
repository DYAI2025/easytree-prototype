import { afterEach, describe, expect, it } from "vitest";

import { POST as geocodingRoute } from "../../src/app/api/geocoding/suche/route";

const post = (body: unknown) =>
  new Request("http://localhost/api/geocoding/suche", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const urspruenglich = { ...process.env };

afterEach(() => {
  process.env.GEOCODER_PROVIDER = urspruenglich.GEOCODER_PROVIDER;
  process.env.GEOCODER_ALLOW_FIXTURE = urspruenglich.GEOCODER_ALLOW_FIXTURE;
});

describe("api-geocoding", () => {
  it("antwortet im Manual-Modus mit 422 GEOCODER_NOT_CONFIGURED", async () => {
    process.env.GEOCODER_PROVIDER = "manual";

    const response = await geocodingRoute(post({ query: "Nordring 12 Potsdam" }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.type).toBe("urn:easytree-prototype:problem:GEOCODER_NOT_CONFIGURED");
  });

  it("liefert mit freigeschaltetem Fixture-Adapter Kandidaten", async () => {
    process.env.GEOCODER_PROVIDER = "fixture";
    process.env.GEOCODER_ALLOW_FIXTURE = "1";

    const response = await geocodingRoute(post({ query: "Nordring" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provider).toBe("fixture");
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates[0].source).toBe("fixture");
  });

  it("bricht ab, wenn fixture ohne Freigabeflag angefordert wird", async () => {
    process.env.GEOCODER_PROVIDER = "fixture";
    delete process.env.GEOCODER_ALLOW_FIXTURE;

    const response = await geocodingRoute(post({ query: "Nordring" }));

    // Startfehler der Factory -> unerwarteter Fehler -> generischer 500,
    // ohne die Meldung nach aussen zu tragen.
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("GEOCODER_ALLOW_FIXTURE");
  });

  it("weist eine zu kurze Anfrage mit 400 ab", async () => {
    process.env.GEOCODER_PROVIDER = "manual";

    const response = await geocodingRoute(post({ query: "ab" }));

    expect(response.status).toBe(400);
    expect((await response.json()).type).toBe("urn:easytree-prototype:problem:VALIDATION_FAILED");
  });
});
