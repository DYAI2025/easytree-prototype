import type { LocalDate } from "./local-date";

/**
 * Plan-Kostenuebersicht je Einsatz (REQ-F-019, PROTOTYPE_ONLY).
 *
 * Grundlage ist ein Tagessatz je Mitarbeiter bzw. Ressource und Baustellentag.
 * Gerechnet wird ausschliesslich in EUR-Minor-Units als `bigint`: keine Floats,
 * keine Division - und damit auch keine Rundung, um die es Streit geben
 * koennte. Der Tagessatz ist bereits ganzzahlig in Minor Units hinterlegt, ein
 * Tag wird nie geteilt.
 *
 * Fehlt eine Grundlage, ist der Betrag `null` und die Position `missing`. Ein
 * fehlender Satz darf niemals als 0 in die Summe eingehen: das saehe aus wie
 * "kostet nichts" statt "wissen wir nicht" (FR-020).
 */
export const COST_RULE_VERSION = "prototype-daily-rate-v1";

export const COST_CURRENCY = "EUR";

export type CostSubjectKind = "employee" | "resource";

export interface CostSubject {
  readonly id: string;
  readonly label: string;
  /** `null` = keine Grundlage hinterlegt. */
  readonly dailyCostMinorUnits: bigint | null;
}

export interface CostDayInput {
  readonly date: LocalDate;
  readonly employees: readonly CostSubject[];
  readonly resources: readonly CostSubject[];
  /** Nur informativ - geplante Zeiten aendern die Summe nicht. */
  readonly plannedStart?: string;
  readonly plannedEnd?: string;
}

export interface CostInput {
  readonly engagementId: string;
  readonly days: readonly CostDayInput[];
}

export interface CostPosition {
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly kind: CostSubjectKind;
  readonly amountMinorUnits: bigint | null;
  readonly missing: boolean;
}

export interface CostDay {
  readonly date: LocalDate;
  readonly positions: CostPosition[];
  readonly subtotalMinorUnits: bigint;
  readonly missingCount: number;
}

export interface CostSubjectTotal {
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly kind: CostSubjectKind;
  readonly dayCount: number;
  readonly totalMinorUnits: bigint;
  readonly missingCount: number;
}

export interface CostOverview {
  readonly engagementId: string;
  readonly currency: typeof COST_CURRENCY;
  readonly ruleVersion: typeof COST_RULE_VERSION;
  readonly days: CostDay[];
  readonly byEmployee: CostSubjectTotal[];
  readonly byResource: CostSubjectTotal[];
  readonly totalMinorUnits: bigint;
  readonly missingCount: number;
  readonly complete: boolean;
}

interface Accumulator {
  subjectId: string;
  subjectLabel: string;
  kind: CostSubjectKind;
  dayCount: number;
  totalMinorUnits: bigint;
  missingCount: number;
}

function toPosition(subject: CostSubject, kind: CostSubjectKind): CostPosition {
  const missing = subject.dailyCostMinorUnits === null;

  return {
    subjectId: subject.id,
    subjectLabel: subject.label,
    kind,
    amountMinorUnits: missing ? null : subject.dailyCostMinorUnits,
    missing,
  };
}

export function calculateEngagementCosts(input: CostInput): CostOverview {
  const totals = new Map<string, Accumulator>();
  const days: CostDay[] = [];

  let totalMinorUnits = 0n;
  let missingCount = 0;

  for (const day of input.days) {
    const positions = [
      ...day.employees.map((subject) => toPosition(subject, "employee")),
      ...day.resources.map((subject) => toPosition(subject, "resource")),
    ];

    let subtotal = 0n;
    let dayMissing = 0;

    for (const position of positions) {
      const accumulator = totals.get(position.subjectId) ?? {
        subjectId: position.subjectId,
        subjectLabel: position.subjectLabel,
        kind: position.kind,
        dayCount: 0,
        totalMinorUnits: 0n,
        missingCount: 0,
      };

      accumulator.dayCount += 1;

      if (position.amountMinorUnits === null) {
        dayMissing += 1;
        accumulator.missingCount += 1;
      } else {
        subtotal += position.amountMinorUnits;
        accumulator.totalMinorUnits += position.amountMinorUnits;
      }

      totals.set(position.subjectId, accumulator);
    }

    totalMinorUnits += subtotal;
    missingCount += dayMissing;

    days.push({
      date: day.date,
      positions,
      subtotalMinorUnits: subtotal,
      missingCount: dayMissing,
    });
  }

  const byKind = (kind: CostSubjectKind): CostSubjectTotal[] =>
    [...totals.values()].filter((entry) => entry.kind === kind).map((entry) => ({ ...entry }));

  return {
    engagementId: input.engagementId,
    currency: COST_CURRENCY,
    ruleVersion: COST_RULE_VERSION,
    days,
    byEmployee: byKind("employee"),
    byResource: byKind("resource"),
    totalMinorUnits,
    missingCount,
    complete: missingCount === 0,
  };
}
