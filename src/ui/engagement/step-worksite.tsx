"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { CreateCustomerCommand, type Customer } from "../../contracts/customer";
import { CreateWorksiteCommand, type Worksite } from "../../contracts/worksite";
import { ApiProblemError, apiPost } from "../../lib/api-client";
import { Button } from "../primitives/button";

export interface StepWorksiteAuswahl {
  readonly customerId: string;
  readonly worksiteId: string;
  /**
   * Der Name reist mit, statt ihn spaeter aus einer Liste nachzuschlagen:
   * eine inline angelegte Baustelle steht nur in DIESER Komponente, nicht in
   * den Stammdaten, die der Drawer beim Oeffnen geladen hat.
   */
  readonly worksiteName: string;
}

export interface StepWorksiteProps {
  readonly customers: readonly Customer[];
  readonly worksites: readonly Worksite[];
  readonly onNext: (auswahl: StepWorksiteAuswahl) => void;
}

type Formular = "kunde" | "baustelle" | null;

/**
 * Schritt 1 der Einsatzanlage: Auftraggeber und Baustelle.
 *
 * Die Baustellenliste haengt am Auftraggeber. Ohne diese Filterung waere die
 * haeufigste Fehlbedienung, eine Baustelle des falschen Kunden zu waehlen -
 * und das faellt erst auf der Rechnung auf.
 *
 * Neu angelegte Stammdaten landen in der lokalen Liste und werden sofort
 * ausgewaehlt: wer mitten im Anlegen eines Einsatzes einen Kunden nachtraegt,
 * will ihn nicht anschliessend suchen muessen.
 */
export function StepWorksite({ customers, worksites, onNext }: StepWorksiteProps) {
  const kundeId = useId();
  const baustelleId = useId();
  const fehlerId = useId();

  const [kunden, setKunden] = useState<readonly Customer[]>(customers);
  const [baustellen, setBaustellen] = useState<readonly Worksite[]>(worksites);
  const [gewaehlterKunde, setGewaehlterKunde] = useState("");
  const [gewaehlteBaustelle, setGewaehlteBaustelle] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [formular, setFormular] = useState<Formular>(null);

  const baustelleRef = useRef<HTMLSelectElement>(null);

  const sichtbareBaustellen = useMemo(
    () => baustellen.filter((b) => b.customerId === gewaehlterKunde),
    [baustellen, gewaehlterKunde],
  );

  const weiter = (): void => {
    if (gewaehlteBaustelle === "") {
      setFehler("Bitte eine Baustelle waehlen.");
      baustelleRef.current?.focus();

      return;
    }

    setFehler(null);
    onNext({
      customerId: gewaehlterKunde,
      worksiteId: gewaehlteBaustelle,
      worksiteName: baustellen.find((b) => b.id === gewaehlteBaustelle)?.name ?? "",
    });
  };

  const kundeUebernehmen = (neu: Customer): void => {
    setKunden((bisher) => [...bisher, neu]);
    setGewaehlterKunde(neu.id);
    setGewaehlteBaustelle("");
    setFormular(null);
  };

  const baustelleUebernehmen = (neu: Worksite): void => {
    setBaustellen((bisher) => [...bisher, neu]);
    setGewaehlteBaustelle(neu.id);
    setFehler(null);
    setFormular(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {kunden.length === 0 ? (
        <div className="rounded border border-line bg-canvas p-4">
          <p className="font-medium">Noch keine Auftraggeber</p>
          <p className="mt-1 text-ink-muted">
            Ein Einsatz braucht eine Baustelle, und eine Baustelle braucht einen Auftraggeber.
          </p>
          <div className="mt-3">
            <Button onClick={() => setFormular("kunde")}>Ersten Auftraggeber anlegen</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={kundeId} className="font-medium">
              Auftraggeber
            </label>
            <select
              id={kundeId}
              value={gewaehlterKunde}
              onChange={(event) => {
                setGewaehlterKunde(event.target.value);
                // Die alte Baustelle gehoert einem anderen Kunden - sie hier
                // stehen zu lassen waere genau der Fehler, den die Filterung
                // verhindern soll.
                setGewaehlteBaustelle("");
              }}
              className="rounded border border-line bg-surface p-2"
            >
              <option value="">Bitte waehlen</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <div>
              <Button variant="secondary" onClick={() => setFormular("kunde")}>
                Neuen Auftraggeber anlegen
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={baustelleId} className="font-medium">
              Baustelle
            </label>
            <select
              id={baustelleId}
              ref={baustelleRef}
              value={gewaehlteBaustelle}
              disabled={gewaehlterKunde === ""}
              aria-invalid={fehler === null ? undefined : true}
              aria-describedby={fehler === null ? undefined : fehlerId}
              onChange={(event) => {
                setGewaehlteBaustelle(event.target.value);
                setFehler(null);
              }}
              className="rounded border border-line bg-surface p-2"
            >
              <option value="">Bitte waehlen</option>
              {sichtbareBaustellen.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {fehler !== null && (
              <p id={fehlerId} role="alert" className="text-danger-text">
                {fehler}
              </p>
            )}
            {gewaehlterKunde !== "" && (
              <div>
                <Button variant="secondary" onClick={() => setFormular("baustelle")}>
                  Neue Baustelle anlegen
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {formular === "kunde" && (
        <KundeAnlegen onFertig={kundeUebernehmen} onAbbruch={() => setFormular(null)} />
      )}

      {formular === "baustelle" && gewaehlterKunde !== "" && (
        <BaustelleAnlegen
          customerId={gewaehlterKunde}
          onFertig={baustelleUebernehmen}
          onAbbruch={() => setFormular(null)}
        />
      )}

      <div className="flex justify-end">
        <Button onClick={weiter}>Weiter</Button>
      </div>
    </div>
  );
}

function KundeAnlegen({
  onFertig,
  onAbbruch,
}: {
  readonly onFertig: (kunde: Customer) => void;
  readonly onAbbruch: () => void;
}) {
  const nameId = useId();
  const [fehler, setFehler] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(CreateCustomerCommand),
    defaultValues: { name: "", contact: "", notes: "" },
  });

  const absenden = form.handleSubmit(async (werte) => {
    try {
      const koerper: Record<string, unknown> = { name: werte.name };

      if (werte.contact !== undefined) {
        koerper.contact = werte.contact;
      }

      onFertig(await apiPost<Customer>("/api/auftraggeber", koerper));
    } catch (ursache) {
      setFehler(ursache instanceof ApiProblemError ? ursache.message : "Anlegen fehlgeschlagen.");
    }
  });

  return (
    <form onSubmit={absenden} className="flex flex-col gap-2 rounded border border-line p-3">
      <label htmlFor={nameId} className="font-medium">
        Name des Auftraggebers
      </label>
      <input
        id={nameId}
        {...form.register("name")}
        aria-invalid={form.formState.errors.name === undefined ? undefined : true}
        className="rounded border border-line bg-surface p-2"
      />
      {form.formState.errors.name !== undefined && (
        <p role="alert" className="text-danger-text">
          {form.formState.errors.name.message}
        </p>
      )}
      {fehler !== null && (
        <p role="alert" className="text-danger-text">
          {fehler}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onAbbruch}>
          Abbrechen
        </Button>
        <Button type="submit">Auftraggeber speichern</Button>
      </div>
    </form>
  );
}

function BaustelleAnlegen({
  customerId,
  onFertig,
  onAbbruch,
}: {
  readonly customerId: string;
  readonly onFertig: (baustelle: Worksite) => void;
  readonly onAbbruch: () => void;
}) {
  const nameId = useId();
  const adresseId = useId();
  const [fehler, setFehler] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(CreateWorksiteCommand),
    defaultValues: { customerId, name: "", addressLine: "" },
  });

  const absenden = form.handleSubmit(async (werte) => {
    try {
      onFertig(
        await apiPost<Worksite>("/api/baustellen", {
          customerId,
          name: werte.name,
          addressLine: werte.addressLine,
        }),
      );
    } catch (ursache) {
      setFehler(ursache instanceof ApiProblemError ? ursache.message : "Anlegen fehlgeschlagen.");
    }
  });

  return (
    <form onSubmit={absenden} className="flex flex-col gap-2 rounded border border-line p-3">
      <label htmlFor={nameId} className="font-medium">
        Name der Baustelle
      </label>
      <input
        id={nameId}
        {...form.register("name")}
        aria-invalid={form.formState.errors.name === undefined ? undefined : true}
        className="rounded border border-line bg-surface p-2"
      />
      <label htmlFor={adresseId} className="font-medium">
        Adresse
      </label>
      <input
        id={adresseId}
        {...form.register("addressLine")}
        aria-invalid={form.formState.errors.addressLine === undefined ? undefined : true}
        className="rounded border border-line bg-surface p-2"
      />
      {fehler !== null && (
        <p role="alert" className="text-danger-text">
          {fehler}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onAbbruch}>
          Abbrechen
        </Button>
        <Button type="submit">Baustelle speichern</Button>
      </div>
    </form>
  );
}
