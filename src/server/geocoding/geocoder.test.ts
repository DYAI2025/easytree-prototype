import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createFixtureGeocoder } from "./fixture.adapter";
import { createGeocoder } from "./geocoder.factory";
import { createManualGeocoder } from "./manual.adapter";
import { createNominatimGeocoder } from "./nominatim.adapter";

const USER_AGENT = "EasyTree-Prototyp (kontakt@example.org)";

const nominatimAntwort = [
  {
    display_name: "Nordring 12, Potsdam, Brandenburg, 14467, Deutschland",
    lat: "52.4009",
    lon: "13.0591",
    address: {
      road: "Nordring",
      house_number: "12",
      postcode: "14467",
      city: "Potsdam",
      country_code: "de",
    },
  },
];

function mockFetch(antwort: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(antwort), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("nominatim.adapter", () => {
  it("normalisiert ein Ergebnis und kennzeichnet die Quelle", async () => {
    const fetchMock = mockFetch(nominatimAntwort);
    const geocoder = createNominatimGeocoder({
      baseUrl: "https://nominatim.example.org",
      userAgent: USER_AGENT,
      fetchImpl: fetchMock,
      throttleMs: 0,
    });

    const kandidaten = await geocoder.search("Nordring 12 Potsdam", AbortSignal.timeout(5000));

    expect(kandidaten).toHaveLength(1);
    expect(kandidaten[0]).toMatchObject({
      postalCode: "14467",
      city: "Potsdam",
      country: "DE",
      lat: 52.4009,
      lng: 13.0591,
      source: "nominatim",
    });

    // Usage-Policy: der User-Agent ist Pflicht und muss wirklich mitgehen.
    const aufruf = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((aufruf[1].headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
  });

  it("liefert bei leerem Ergebnis eine leere Liste, keinen Fehler", async () => {
    const geocoder = createNominatimGeocoder({
      baseUrl: "https://nominatim.example.org",
      userAgent: USER_AGENT,
      fetchImpl: mockFetch([]),
      throttleMs: 0,
    });

    await expect(geocoder.search("Nirgendwo", AbortSignal.timeout(5000))).resolves.toEqual([]);
  });

  it("meldet GEOCODER_UNAVAILABLE bei HTTP 500", async () => {
    const geocoder = createNominatimGeocoder({
      baseUrl: "https://nominatim.example.org",
      userAgent: USER_AGENT,
      fetchImpl: mockFetch({ error: "boom" }, 500),
      throttleMs: 0,
    });

    await expect(geocoder.search("Nordring", AbortSignal.timeout(5000))).rejects.toMatchObject({
      code: "GEOCODER_UNAVAILABLE",
    });
  });

  it("meldet GEOCODER_UNAVAILABLE bei einem Abbruch", async () => {
    const geocoder = createNominatimGeocoder({
      baseUrl: "https://nominatim.example.org",
      userAgent: USER_AGENT,
      fetchImpl: vi.fn(async () => {
        throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
      }),
      throttleMs: 0,
    });

    await expect(geocoder.search("Nordring", AbortSignal.timeout(5000))).rejects.toMatchObject({
      code: "GEOCODER_UNAVAILABLE",
    });
  });

  it("protokolliert die Adresse NICHT im Klartext", async () => {
    const aufrufe: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => aufrufe.push(args));
    vi.spyOn(console, "warn").mockImplementation((...args) => aufrufe.push(args));

    const geocoder = createNominatimGeocoder({
      baseUrl: "https://nominatim.example.org",
      userAgent: USER_AGENT,
      fetchImpl: mockFetch({ error: "boom" }, 500),
      throttleMs: 0,
    });

    await geocoder.search("Nordring 12, 14467 Potsdam", AbortSignal.timeout(5000)).catch(() => {});

    const protokoll = JSON.stringify(aufrufe);
    expect(protokoll).not.toContain("Nordring");
    expect(protokoll).not.toContain("Potsdam");
    // Nur Laenge, Provider und Status duerfen erscheinen.
    expect(protokoll).toContain("nominatim");
  });

  it("drosselt zwei Anfragen innerhalb einer Sekunde", async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch([]);
    const geocoder = createNominatimGeocoder({
      baseUrl: "https://nominatim.example.org",
      userAgent: USER_AGENT,
      fetchImpl: fetchMock,
      throttleMs: 1000,
    });

    await geocoder.search("A", AbortSignal.timeout(5000));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const zweite = geocoder.search("B", AbortSignal.timeout(5000));
    await vi.advanceTimersByTimeAsync(200);
    // Noch gedrosselt: der zweite Aufruf hat die Leitung nicht beruehrt.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(900);
    await zweite;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("manual.adapter", () => {
  it("meldet GEOCODER_NOT_CONFIGURED", async () => {
    await expect(
      createManualGeocoder().search("Nordring", AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ code: "GEOCODER_NOT_CONFIGURED" });
  });
});

describe("fixture.adapter", () => {
  it("liefert feste Kandidaten fuer bekannte Anfragen", async () => {
    const kandidaten = await createFixtureGeocoder().search("Nordring", AbortSignal.timeout(1000));

    expect(kandidaten.length).toBeGreaterThan(0);
    expect(kandidaten[0]?.source).toBe("fixture");
  });
});

describe("geocoder.factory", () => {
  it("nimmt ohne Konfiguration den Manual-Pfad", () => {
    expect(createGeocoder({}).provider).toBe("manual");
  });

  it("bricht bei nominatim ohne GEOCODER_USER_AGENT ab", () => {
    expect(() =>
      createGeocoder({ GEOCODER_PROVIDER: "nominatim", GEOCODER_BASE_URL: "https://x.example" }),
    ).toThrow(/GEOCODER_USER_AGENT/);
  });

  it("bricht bei fixture ohne GEOCODER_ALLOW_FIXTURE ab - NICHT ueber NODE_ENV", () => {
    expect(() => createGeocoder({ GEOCODER_PROVIDER: "fixture" })).toThrow(
      /GEOCODER_ALLOW_FIXTURE/,
    );

    // Mit Flag erlaubt, unabhaengig von NODE_ENV: `next start` erzwingt
    // NODE_ENV=production, eine NODE_ENV-Pruefung waere im E2E-Lauf falsch.
    expect(
      createGeocoder({
        GEOCODER_PROVIDER: "fixture",
        GEOCODER_ALLOW_FIXTURE: "1",
        NODE_ENV: "production",
      }).provider,
    ).toBe("fixture");
  });
});

describe("Client-Grenze", () => {
  it("erwaehnt nominatim nirgends ausserhalb der Serverschicht", () => {
    const suche = (): number => {
      try {
        execFileSync("git", ["grep", "-nil", "nominatim", "--", "src/ui", "src/app"], {
          encoding: "utf8",
        });
        return 0;
      } catch (error) {
        return (error as { status?: number }).status ?? -1;
      }
    };

    // git grep endet ohne Treffer mit Exit 1 - genau das wird erwartet.
    expect(suche()).toBe(1);
  });
});
