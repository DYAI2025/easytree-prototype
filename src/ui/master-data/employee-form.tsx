"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { nonBlankText } from "../../contracts/customer";
import type { Employee } from "../../contracts/employee";
import { ApiProblemError, apiPatch, apiPost } from "../../lib/api-client";
import { Button } from "../primitives/button";

/**
 * Stammdatenpflege Mitarbeitende (REQ-F-012).
 *
 * Der Tagessatz ist eine DEMO-KOSTENGRUNDLAGE (`PROTOTYPE_ONLY`, A-03), keine
 * Verguetung. Fehlt er, wird das Feld gar nicht erst gesendet - der Server
 * speichert dann NULL, und die Kostenansicht zeigt spaeter "fehlt". Eine 0
 * waere eine erfundene Zahl (H-03).
 */

/** `250,00` -> `25000`. Ohne Gleitkomma: 0.1 + 0.2 ist nicht 0.3. */
export const SATZ_MUSTER = /^\d{1,15}(?:[.,]\d{1,2})?$/;

/** Dieselbe Erklaerung an jedem Satzfeld - Mitarbeitende wie Ressourcen. */
export const SATZ_HINWEIS =
  "Euro je Baustellentag, z. B. 250,00. Leer lassen, wenn kein Satz hinterlegt ist - das Feld bleibt dann leer und wird nicht als 0 gerechnet. Demo-Kostengrundlage, keine Verguetung.";

export function parseTagessatz(eingabe: string): string | undefined {
  const roh = eingabe.trim();

  if (roh === "") {
    return undefined;
  }

  const [euro, cent = ""] = roh.replace(",", ".").split(".") as [string, string?];

  return `${BigInt(euro) * 100n + BigInt(cent.padEnd(2, "0"))}`;
}

/** `25000` -> `250,00`. `null` bleibt sichtbar leer, niemals `0,00`. */
export function formatTagessatz(minorUnits: string | null): string {
  if (minorUnits === null) {
    return "fehlt";
  }

  const wert = BigInt(minorUnits);

  return `${wert / 100n},${`${wert % 100n}`.padStart(2, "0")} €`;
}

const FormularSchema = z.object({
  displayName: nonBlankText(160),
  roleLabel: z.string().trim().max(120),
  dailyCost: z
    .string()
    .trim()
    .refine((wert) => wert === "" || SATZ_MUSTER.test(wert), "Betrag wie 250,00 eingeben"),
  active: z.boolean(),
});

type Formularwerte = z.infer<typeof FormularSchema>;

export interface EmployeeFormProps {
  /** Fehlt beim Anlegen, gesetzt beim Bearbeiten. */
  readonly employee?: Employee;
  readonly onSaved: (person: Employee) => void;
  readonly onCancel?: () => void;
}

export function EmployeeForm({ employee, onSaved, onCancel }: EmployeeFormProps) {
  const nameId = useId();
  const rolleId = useId();
  const satzId = useId();
  const satzHinweisId = useId();
  const [fehler, setFehler] = useState<string | null>(null);

  const form = useForm<Formularwerte>({
    resolver: zodResolver(FormularSchema),
    defaultValues: {
      displayName: employee?.displayName ?? "",
      roleLabel: employee?.roleLabel ?? "",
      dailyCost:
        employee?.dailyCostMinorUnits === undefined || employee.dailyCostMinorUnits === null
          ? ""
          : formatTagessatz(employee.dailyCostMinorUnits).replace(" €", ""),
      active: employee?.active ?? true,
    },
  });

  const absenden = form.handleSubmit(async (werte) => {
    setFehler(null);

    const koerper: Record<string, unknown> = {
      displayName: werte.displayName,
      active: werte.active,
    };

    if (werte.roleLabel !== "") {
      koerper.roleLabel = werte.roleLabel;
    }

    // PATCH ersetzt vollstaendig: `costNote: command.costNote ?? null`. Ohne
    // dieses Durchreichen loeschte jedes Speichern den Kostenhinweis, fuer den
    // das Formular gar kein Feld hat.
    if (employee?.costNote != null && employee.costNote !== "") {
      koerper.costNote = employee.costNote;
    }

    const satz = parseTagessatz(werte.dailyCost);

    // Kein Feld statt `null`: `MinorUnitsSchema.optional()` laesst nur
    // `undefined` zu - gemessen, `null` scheitert mit "Invalid input".
    if (satz !== undefined) {
      koerper.dailyCostMinorUnits = satz;
    }

    try {
      onSaved(
        employee === undefined
          ? await apiPost<Employee>("/api/mitarbeitende", koerper)
          : await apiPatch<Employee>(`/api/mitarbeitende/${employee.id}`, koerper),
      );
    } catch (ursache) {
      setFehler(ursache instanceof ApiProblemError ? ursache.title : "Speichern fehlgeschlagen.");
    }
  });

  const nameFehler = form.formState.errors.displayName?.message;
  const satzFehler = form.formState.errors.dailyCost?.message;

  return (
    <form onSubmit={absenden} className="flex flex-col gap-3 rounded border border-line p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="font-medium">
          Name
        </label>
        <input
          id={nameId}
          {...form.register("displayName")}
          aria-invalid={nameFehler === undefined ? undefined : true}
          /*
           * min-h-11 = 44 CSS-Pixel (WCAG 2.5.5, EYT-176).
           *
           * `p-2` allein ergab 42 px (Text 16 px, Zeilenbox 24, plus 2x8 Innenabstand,
           * plus 2 px Rahmen), ein `select` sogar nur 38. Gemessen im Produktionsbuild
           * bei 375, 325 und 320 px - dieselbe Zahl auf jeder Breite, denn die Hoehe
           * haengt nicht am Viewport. Die Untergrenze steht an jedem Feld dieser Datei;
           * eine eigene Abstraktion fuer einen CSS-Wert waere mehr Apparat als Nutzen.
           */
          className="min-h-11 rounded border border-line bg-surface p-2"
        />
        {nameFehler !== undefined && (
          <p role="alert" className="text-danger-text">
            {nameFehler}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={rolleId} className="font-medium">
          Rollenbezeichnung
        </label>
        <input
          id={rolleId}
          {...form.register("roleLabel")}
          className="min-h-11 rounded border border-line bg-surface p-2"
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
          className="min-h-11 rounded border border-line bg-surface p-2"
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

      {/*
        min-h-11 = 44 CSS-Pixel (WCAG 2.5.5, EYT-176): der Aktiv-Schalter.

        Die Hoehe sitzt am LABEL, nicht an der Checkbox. Die Checkbox bleibt das
        13x13 grosse Betriebssystemelement; bedient wird die Zeile, die sie
        umschliesst - ein Klick irgendwo darauf schaltet sie. Vorher war diese
        Zeile 24 px hoch, gemessen im Produktionsbuild.
      */}
      <label className="flex min-h-11 items-center gap-2">
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

export interface EmployeeAdminProps {
  readonly employees: readonly Employee[];
}

/**
 * Liste und Formular der Seite `/mitarbeitende`.
 *
 * Nach dem Speichern wird die Servertruth neu geladen (`router.refresh()`)
 * statt die lokale Liste fortzuschreiben: die Seite soll dasselbe zeigen wie
 * ein zweiter Browserkontext (REQ-NF-001).
 */
export function EmployeeAdmin({ employees }: EmployeeAdminProps) {
  const router = useRouter();
  const [bearbeitet, setBearbeitet] = useState<Employee | "neu" | null>(null);

  const fertig = (): void => {
    setBearbeitet(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mitarbeitende</h1>
        <Button onClick={() => setBearbeitet("neu")}>Neue Person anlegen</Button>
      </div>

      {bearbeitet === "neu" && (
        <EmployeeForm onSaved={fertig} onCancel={() => setBearbeitet(null)} />
      )}

      {employees.length === 0 ? (
        <p>Noch keine Mitarbeitenden angelegt.</p>
      ) : (
        <ul data-testid="mitarbeitendenliste" className="flex flex-col gap-2">
          {employees.map((person) => (
            <li key={person.id} className="rounded border border-line p-3">
              {bearbeitet !== "neu" && bearbeitet?.id === person.id ? (
                <EmployeeForm
                  employee={person}
                  onSaved={fertig}
                  onCancel={() => setBearbeitet(null)}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <span data-testid="mitarbeitendenname" className="font-medium">
                      {person.displayName}
                    </span>
                    {person.roleLabel !== null && (
                      <span className="text-ink-muted"> · {person.roleLabel}</span>
                    )}
                    {!person.active && <span className="text-ink-muted"> · inaktiv</span>}
                    <span className="block text-ink-muted">
                      Demo-Tagessatz: {formatTagessatz(person.dailyCostMinorUnits)}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setBearbeitet(person)}
                    aria-label={`${person.displayName} bearbeiten`}
                  >
                    Bearbeiten
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
