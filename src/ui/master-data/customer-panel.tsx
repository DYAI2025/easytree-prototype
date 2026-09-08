"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { nonBlankText, type Customer } from "../../contracts/customer";
import type { Worksite } from "../../contracts/worksite";
import { ApiProblemError, apiPatch, apiPost } from "../../lib/api-client";
import { AddressSearch, type AddressSearchValue } from "./address-search";
import { Button } from "../primitives/button";

/**
 * Stammdatenpflege Auftraggeber und ihre Baustellen (REQ-F-003, REQ-F-004).
 *
 * Der Auftraggeber ist hier ein ORDNUNGSBEGRIFF fuer Baustellen, kein
 * Vertriebsdatensatz: keine Leads, kein Umsatz, keine Angebote. Ein Test
 * sichert genau das ab - die Grenze verschiebt sich sonst unbemerkt, weil
 * jedes einzelne Feld fuer sich plausibel klingt.
 */

const KundeFormular = z.object({
  name: nonBlankText(),
  contact: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
});

/*
 * Adresse, PLZ, Ort und Koordinaten gehoeren der AddressSearch und liegen
 * deshalb NICHT im react-hook-form-Zustand: sie entstehen entweder aus einem
 * Suchtreffer oder aus der manuellen Eingabe, und beide Wege setzen sie
 * gemeinsam. Zwei Quellen fuer dieselben vier Felder waeren die naechste
 * Fehlerstelle.
 */
const BaustelleFormular = z.object({
  name: nonBlankText(),
  notes: z.string().trim().max(2000),
});

export interface CustomerPanelProps {
  readonly customers: readonly Customer[];
  readonly worksites: readonly Worksite[];
}

export function CustomerPanel({ customers, worksites }: CustomerPanelProps) {
  const router = useRouter();
  const [gewaehlt, setGewaehlt] = useState<string | null>(customers[0]?.id ?? null);
  const [formular, setFormular] = useState<"kunde" | "baustelle" | null>(null);
  const [bearbeiteteBaustelle, setBearbeiteteBaustelle] = useState<Worksite | null>(null);

  const kunde = useMemo(
    () => customers.find((k) => k.id === gewaehlt) ?? null,
    [customers, gewaehlt],
  );

  const baustellen = useMemo(
    () => worksites.filter((b) => b.customerId === gewaehlt),
    [worksites, gewaehlt],
  );

  const fertig = (): void => {
    setFormular(null);
    setBearbeiteteBaustelle(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Auftraggeber</h1>
        <Button
          onClick={() => {
            setBearbeiteteBaustelle(null);
            setFormular("kunde");
          }}
        >
          Neuer Auftraggeber
        </Button>
      </div>

      {formular === "kunde" && <KundeForm onSaved={fertig} onCancel={() => setFormular(null)} />}

      <div className="flex flex-col gap-4 md:flex-row">
        <section aria-label="Auftraggeberliste" className="md:w-1/3">
          <h2 className="text-lg font-semibold">Alle Auftraggeber</h2>
          {customers.length === 0 ? (
            <p className="mt-2">Noch keine Auftraggeber angelegt.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {customers.map((eintrag) => (
                <li key={eintrag.id}>
                  <button
                    type="button"
                    aria-label={`${eintrag.name} auswaehlen`}
                    aria-current={eintrag.id === gewaehlt ? "true" : undefined}
                    onClick={() => {
                      setGewaehlt(eintrag.id);
                      setFormular(null);
                      setBearbeiteteBaustelle(null);
                    }}
                    className="w-full rounded border border-line px-3 py-2 text-left aria-[current]:bg-canvas"
                  >
                    {eintrag.name}
                    {!eintrag.active && <span className="text-ink-muted"> · inaktiv</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {kunde !== null && (
          <section aria-label="Baustellen" className="flex flex-col gap-3 md:w-2/3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Baustellen von {kunde.name}</h2>
              <Button
                onClick={() => {
                  setBearbeiteteBaustelle(null);
                  setFormular("baustelle");
                }}
              >
                Neue Baustelle
              </Button>
            </div>

            {kunde.contact !== null && <p className="text-ink-muted">Kontakt: {kunde.contact}</p>}

            {formular === "baustelle" && (
              <BaustelleForm kunde={kunde} onSaved={fertig} onCancel={() => setFormular(null)} />
            )}

            {baustellen.length === 0 ? (
              <p>Fuer diesen Auftraggeber ist noch keine Baustelle angelegt.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {baustellen.map((ort) => (
                  <li key={ort.id} className="rounded border border-line p-3">
                    {bearbeiteteBaustelle?.id === ort.id ? (
                      <BaustelleForm
                        kunde={kunde}
                        worksite={ort}
                        onSaved={fertig}
                        onCancel={() => setBearbeiteteBaustelle(null)}
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          <span data-testid="baustellenname" className="font-medium">
                            {ort.name}
                          </span>
                          <span className="block text-ink-muted">
                            {ort.addressLine}
                            {ort.postalCode !== null && `, ${ort.postalCode}`}
                            {ort.city !== null && ` ${ort.city}`}
                          </span>
                          <span className="block text-ink-muted">
                            {ort.lat === null || ort.lng === null
                              ? "Keine Koordinaten hinterlegt"
                              : `Koordinaten ${ort.lat}, ${ort.lng} · Quelle: ${ort.geocodeSource ?? "unbekannt"}`}
                          </span>
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setFormular(null);
                            setBearbeiteteBaustelle(ort);
                          }}
                          aria-label={`${ort.name} bearbeiten`}
                        >
                          Bearbeiten
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function KundeForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const nameId = useId();
  const kontaktId = useId();
  const notizId = useId();
  const [fehler, setFehler] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(KundeFormular),
    defaultValues: { name: "", contact: "", notes: "" },
  });

  const absenden = form.handleSubmit(async (werte) => {
    setFehler(null);

    const koerper: Record<string, unknown> = { name: werte.name };

    if (werte.contact !== "") {
      koerper.contact = werte.contact;
    }

    if (werte.notes !== "") {
      koerper.notes = werte.notes;
    }

    try {
      await apiPost<Customer>("/api/auftraggeber", koerper);
      onSaved();
    } catch (ursache) {
      setFehler(ursache instanceof ApiProblemError ? ursache.title : "Speichern fehlgeschlagen.");
    }
  });

  const nameFehler = form.formState.errors.name?.message;

  return (
    <form
      onSubmit={absenden}
      aria-label="Neuer Auftraggeber"
      className="flex flex-col gap-2 rounded border border-line p-4"
    >
      <label htmlFor={nameId} className="font-medium">
        Name
      </label>
      <input
        id={nameId}
        {...form.register("name")}
        aria-invalid={nameFehler === undefined ? undefined : true}
        className="rounded border border-line bg-surface p-2"
      />
      {nameFehler !== undefined && (
        <p role="alert" className="text-danger-text">
          {nameFehler}
        </p>
      )}

      <label htmlFor={kontaktId} className="font-medium">
        Kontakt
      </label>
      <input
        id={kontaktId}
        {...form.register("contact")}
        className="rounded border border-line bg-surface p-2"
      />

      <label htmlFor={notizId} className="font-medium">
        Notiz
      </label>
      <textarea
        id={notizId}
        {...form.register("notes")}
        className="rounded border border-line bg-surface p-2"
      />

      {fehler !== null && (
        <p role="alert" className="text-danger-text">
          {fehler}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit">Auftraggeber speichern</Button>
      </div>
    </form>
  );
}

function BaustelleForm({
  kunde,
  worksite,
  onSaved,
  onCancel,
}: {
  readonly kunde: Customer;
  readonly worksite?: Worksite;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}) {
  const kundeId = useId();
  const nameId = useId();
  const notizId = useId();
  const [fehler, setFehler] = useState<string | null>(null);
  const [adresse, setAdresse] = useState<AddressSearchValue>({
    addressLine: worksite?.addressLine ?? "",
    postalCode: worksite?.postalCode ?? "",
    city: worksite?.city ?? "",
    lat: worksite?.lat ?? null,
    lng: worksite?.lng ?? null,
    geocodeSource: worksite?.geocodeSource ?? null,
  });
  const [adresseFehler, setAdresseFehler] = useState<string | undefined>(undefined);

  const form = useForm({
    resolver: zodResolver(BaustelleFormular),
    defaultValues: {
      name: worksite?.name ?? "",
      notes: worksite?.notes ?? "",
    },
  });

  const absenden = form.handleSubmit(async (werte) => {
    setFehler(null);

    if (adresse.addressLine.trim() === "") {
      setAdresseFehler("Pflichtfeld");

      return;
    }

    setAdresseFehler(undefined);

    const koerper: Record<string, unknown> = {
      name: werte.name,
      addressLine: adresse.addressLine,
    };

    for (const [feld, wert] of [
      ["postalCode", adresse.postalCode],
      ["city", adresse.city],
      ["notes", werte.notes],
    ] as const) {
      if (wert !== "") {
        koerper[feld] = wert;
      }
    }

    // Koordinaten nur als Paar - eine halbe Koordinate sieht aus wie ein Ort.
    // Dieselbe Regel steht als CHECK in der Datenbank und als Refinement im
    // Vertrag; hier wird sie eingehalten, nicht neu erfunden.
    if (adresse.lat !== null && adresse.lng !== null) {
      koerper.lat = adresse.lat;
      koerper.lng = adresse.lng;
    }

    if (adresse.geocodeSource !== null) {
      koerper.geocodeSource = adresse.geocodeSource;
    }

    try {
      if (worksite === undefined) {
        await apiPost<Worksite>("/api/baustellen", { customerId: kunde.id, ...koerper });
      } else {
        await apiPatch<Worksite>(`/api/baustellen/${worksite.id}`, koerper);
      }

      onSaved();
    } catch (ursache) {
      setFehler(ursache instanceof ApiProblemError ? ursache.title : "Speichern fehlgeschlagen.");
    }
  });

  const nameFehler = form.formState.errors.name?.message;

  return (
    <form
      onSubmit={absenden}
      aria-label={worksite === undefined ? "Neue Baustelle" : `Baustelle ${worksite.name}`}
      className="flex flex-col gap-2 rounded border border-line p-4"
    >
      <label htmlFor={kundeId} className="font-medium">
        Auftraggeber
      </label>
      {/*
       * Sichtbar und schreibgeschuetzt statt versteckt: die Baustelle haengt am
       * gewaehlten Auftraggeber, und wer das Formular oeffnet, soll sehen an
       * welchem. Ein Wechsel geht ueber die Liste links, nicht hier.
       */}
      <input
        id={kundeId}
        value={kunde.name}
        disabled
        readOnly
        className="rounded border border-line bg-canvas p-2 text-ink-muted"
      />

      <label htmlFor={nameId} className="font-medium">
        Name der Baustelle
      </label>
      <input
        id={nameId}
        {...form.register("name")}
        aria-invalid={nameFehler === undefined ? undefined : true}
        className="rounded border border-line bg-surface p-2"
      />
      {nameFehler !== undefined && (
        <p role="alert" className="text-danger-text">
          {nameFehler}
        </p>
      )}

      <AddressSearch
        value={adresse}
        onChange={(neu) => {
          setAdresse(neu);
          setAdresseFehler(undefined);
        }}
      />
      {adresseFehler !== undefined && (
        <p role="alert" className="text-danger-text">
          {adresseFehler}
        </p>
      )}

      <label htmlFor={notizId} className="font-medium">
        Notiz
      </label>
      <textarea
        id={notizId}
        {...form.register("notes")}
        className="rounded border border-line bg-surface p-2"
      />

      {fehler !== null && (
        <p role="alert" className="text-danger-text">
          {fehler}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit">Baustelle speichern</Button>
      </div>
    </form>
  );
}
