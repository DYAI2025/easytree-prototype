"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { nonBlankText } from "../../contracts/customer";
import { RESOURCE_KINDS, type Resource, type ResourceKind } from "../../contracts/resource";
import { ApiProblemError, apiPatch, apiPost } from "../../lib/api-client";
import { Button } from "../primitives/button";
import { SATZ_HINWEIS, SATZ_MUSTER, formatTagessatz, parseTagessatz } from "./employee-form";

/**
 * Stammdatenpflege Ressourcen (REQ-F-013).
 *
 * Typen und Felder sind A-08 und damit PROTOTYPE_ONLY. Weitere Typattribute
 * sind HUMAN_INPUT_REQUIRED (H-05, OQ-006) und werden hier NICHT erfunden -
 * die Oberflaeche sagt das ausdruecklich, statt die Luecke zu verschweigen.
 */
export const OQ_006_HINWEIS = "Weitere Typattribute sind fachlich noch nicht definiert (OQ-006).";

/** Reihenfolge und Beschriftung der drei Typen - mehr gibt es nicht (A-08). */
export const TYP_LABELS: Readonly<Record<ResourceKind, string>> = {
  vehicle: "Fahrzeug",
  machine: "Maschine",
  equipment: "Geraet",
};

const TYP_GRUPPEN: Readonly<Record<ResourceKind, string>> = {
  vehicle: "Fahrzeuge",
  machine: "Maschinen",
  equipment: "Geraete",
};

const FormularSchema = z.object({
  kind: z.enum(RESOURCE_KINDS),
  name: nonBlankText(160),
  identifier: z.string().trim().max(120),
  dailyCost: z
    .string()
    .trim()
    .refine((wert) => wert === "" || SATZ_MUSTER.test(wert), "Betrag wie 250,00 eingeben"),
  active: z.boolean(),
});

type Formularwerte = z.infer<typeof FormularSchema>;

export interface ResourceFormProps {
  /** Fehlt beim Anlegen, gesetzt beim Bearbeiten. */
  readonly resource?: Resource;
  readonly onSaved: (ressource: Resource) => void;
  readonly onCancel?: () => void;
}

export function ResourceForm({ resource, onSaved, onCancel }: ResourceFormProps) {
  const typId = useId();
  const nameId = useId();
  const kennungId = useId();
  const satzId = useId();
  const satzHinweisId = useId();
  const [fehler, setFehler] = useState<string | null>(null);

  const form = useForm<Formularwerte>({
    resolver: zodResolver(FormularSchema),
    defaultValues: {
      kind: resource?.kind ?? "vehicle",
      name: resource?.name ?? "",
      identifier: resource?.identifier ?? "",
      dailyCost:
        resource?.dailyCostMinorUnits === undefined || resource.dailyCostMinorUnits === null
          ? ""
          : formatTagessatz(resource.dailyCostMinorUnits).replace(" €", ""),
      active: resource?.active ?? true,
    },
  });

  const absenden = form.handleSubmit(async (werte) => {
    setFehler(null);

    const koerper: Record<string, unknown> = {
      kind: werte.kind,
      name: werte.name,
      active: werte.active,
    };

    if (werte.identifier !== "") {
      koerper.identifier = werte.identifier;
    }

    // Wie beim Mitarbeitendenformular: PATCH ersetzt vollstaendig, also muss
    // der vorhandene Kostenhinweis mitreisen, sonst loescht ihn jedes Speichern.
    if (resource?.costNote != null && resource.costNote !== "") {
      koerper.costNote = resource.costNote;
    }

    const satz = parseTagessatz(werte.dailyCost);

    // Kein Satz heisst: Feld weglassen, damit NULL gespeichert wird - nie 0.
    if (satz !== undefined) {
      koerper.dailyCostMinorUnits = satz;
    }

    try {
      onSaved(
        resource === undefined
          ? await apiPost<Resource>("/api/ressourcen", koerper)
          : await apiPatch<Resource>(`/api/ressourcen/${resource.id}`, koerper),
      );
    } catch (ursache) {
      setFehler(ursache instanceof ApiProblemError ? ursache.title : "Speichern fehlgeschlagen.");
    }
  });

  const nameFehler = form.formState.errors.name?.message;
  const satzFehler = form.formState.errors.dailyCost?.message;

  return (
    <form onSubmit={absenden} className="flex flex-col gap-3 rounded border border-line p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={typId} className="font-medium">
          Typ
        </label>
        <select
          id={typId}
          {...form.register("kind")}
          className="rounded border border-line bg-surface p-2"
        >
          {RESOURCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {TYP_LABELS[kind]}
            </option>
          ))}
        </select>
        <p className="text-ink-muted">{OQ_006_HINWEIS}</p>
      </div>

      <div className="flex flex-col gap-1">
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
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={kennungId} className="font-medium">
          Kennung
        </label>
        <input
          id={kennungId}
          {...form.register("identifier")}
          className="rounded border border-line bg-surface p-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={satzId} className="font-medium">
          Demo-Tagessatz (Prototyp)
        </label>
        <input
          id={satzId}
          inputMode="decimal"
          {...form.register("dailyCost")}
          aria-describedby={satzHinweisId}
          aria-invalid={satzFehler === undefined ? undefined : true}
          className="rounded border border-line bg-surface p-2"
        />
        <p id={satzHinweisId} className="text-ink-muted">
          {SATZ_HINWEIS}
        </p>
        {satzFehler !== undefined && (
          <p role="alert" className="text-danger-text">
            {satzFehler}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" {...form.register("active")} />
        Aktiv
      </label>

      {fehler !== null && (
        <p role="alert" className="text-danger-text">
          {fehler}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel !== undefined && (
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Speichern
        </Button>
      </div>
    </form>
  );
}

export interface ResourceAdminProps {
  readonly resources: readonly Resource[];
}

/**
 * Liste und Formular der Seite `/ressourcen`.
 *
 * Die Liste ist nach Typ gruppiert: eine flache Liste aus Fahrzeugen,
 * Maschinen und Geraeten waere beim Zusammenstellen eines Einsatzes nicht
 * lesbar.
 */
export function ResourceAdmin({ resources }: ResourceAdminProps) {
  const router = useRouter();
  const [bearbeitet, setBearbeitet] = useState<Resource | "neu" | null>(null);

  const fertig = (): void => {
    setBearbeitet(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ressourcen</h1>
        <Button onClick={() => setBearbeitet("neu")}>Neue Ressource anlegen</Button>
      </div>

      {bearbeitet === "neu" && (
        <ResourceForm onSaved={fertig} onCancel={() => setBearbeitet(null)} />
      )}

      {resources.length === 0 ? (
        <p>Noch keine Ressourcen angelegt.</p>
      ) : (
        RESOURCE_KINDS.map((kind) => {
          const gruppe = resources.filter((r) => r.kind === kind);

          if (gruppe.length === 0) {
            return null;
          }

          return (
            <section key={kind} role="group" aria-label={TYP_GRUPPEN[kind]}>
              <h2 className="text-lg font-semibold">{TYP_GRUPPEN[kind]}</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {gruppe.map((ressource) => (
                  <li key={ressource.id} className="rounded border border-line p-3">
                    {bearbeitet !== "neu" && bearbeitet?.id === ressource.id ? (
                      <ResourceForm
                        resource={ressource}
                        onSaved={fertig}
                        onCancel={() => setBearbeitet(null)}
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          <span data-testid="ressourcenname" className="font-medium">
                            {ressource.name}
                          </span>
                          {ressource.identifier !== null && (
                            <span className="text-ink-muted"> · {ressource.identifier}</span>
                          )}
                          {!ressource.active && <span className="text-ink-muted"> · inaktiv</span>}
                          <span className="block text-ink-muted">
                            Demo-Tagessatz: {formatTagessatz(ressource.dailyCostMinorUnits)}
                          </span>
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => setBearbeitet(ressource)}
                          aria-label={`${ressource.name} bearbeiten`}
                        >
                          Bearbeiten
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
