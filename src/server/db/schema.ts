import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Schema nach Abschnitt 7 des Plans.
 *
 * Jede fachliche Tabelle traegt `org_id`. Es gibt zwar nur einen Demo-Mandanten
 * und keine Anmeldung (A-02, PROTOTYPE_ONLY), aber die Spalte jetzt zu fuehren
 * kostet nichts und haelt eine spaetere Mandantentrennung offen.
 *
 * Geldbetraege sind bigint in EUR-Minor-Units, ausdruecklich `mode: "bigint"` -
 * der Drizzle-Default waere `number` und verloere ab 2^53 still an Genauigkeit.
 * NULL bedeutet "keine Grundlage hinterlegt", niemals 0.
 */

const primaryKey = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: primaryKey(),
  name: text("name").notNull(),
  timeZone: text("time_zone").notNull().default("Europe/Berlin"),
  createdAt: createdAt(),
});

const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizations.id);

export const customers = pgTable(
  "customers",
  {
    id: primaryKey(),
    orgId: orgId(),
    name: text("name").notNull(),
    contact: text("contact"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [check("customers_name_not_blank", sql`length(trim(${table.name})) > 0`)],
);

export const worksites = pgTable(
  "worksites",
  {
    id: primaryKey(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    name: text("name").notNull(),
    addressLine: text("address_line").notNull(),
    postalCode: text("postal_code"),
    city: text("city"),
    country: text("country").notNull().default("DE"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    geocodeSource: text("geocode_source"),
    geocodeResolvedAt: timestamp("geocode_resolved_at", { withTimezone: true }),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    check("worksites_name_not_blank", sql`length(trim(${table.name})) > 0`),
    // Halbe Koordinaten sind schlimmer als gar keine: sie sehen aus wie ein Ort.
    check("worksites_lat_lng_paired", sql`(${table.lat} is null) = (${table.lng} is null)`),
    check(
      "worksites_geocode_source_known",
      sql`${table.geocodeSource} is null or ${table.geocodeSource} in ('manual', 'nominatim', 'fixture')`,
    ),
  ],
);

export const employees = pgTable(
  "employees",
  {
    id: primaryKey(),
    orgId: orgId(),
    displayName: text("display_name").notNull(),
    /** Freitext, PROTOTYPE_ONLY - keine Rollenverwaltung, keine Verguetung. */
    roleLabel: text("role_label"),
    active: boolean("active").notNull().default(true),
    dailyCostMinorUnits: bigint("daily_cost_minor_units", { mode: "bigint" }),
    currency: text("currency").notNull().default("EUR"),
    costNote: text("cost_note"),
    createdAt: createdAt(),
  },
  (table) => [
    check("employees_name_not_blank", sql`length(trim(${table.displayName})) > 0`),
    check(
      "employees_daily_cost_non_negative",
      sql`${table.dailyCostMinorUnits} is null or ${table.dailyCostMinorUnits} >= 0`,
    ),
  ],
);

export const resources = pgTable(
  "resources",
  {
    id: primaryKey(),
    orgId: orgId(),
    /** A-08, PROTOTYPE_ONLY - weitere Typattribute sind HUMAN_INPUT_REQUIRED (H-05). */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    identifier: text("identifier"),
    active: boolean("active").notNull().default(true),
    dailyCostMinorUnits: bigint("daily_cost_minor_units", { mode: "bigint" }),
    currency: text("currency").notNull().default("EUR"),
    costNote: text("cost_note"),
    createdAt: createdAt(),
  },
  (table) => [
    check("resources_kind_known", sql`${table.kind} in ('vehicle', 'machine', 'equipment')`),
    check("resources_name_not_blank", sql`length(trim(${table.name})) > 0`),
    check(
      "resources_daily_cost_non_negative",
      sql`${table.dailyCostMinorUnits} is null or ${table.dailyCostMinorUnits} >= 0`,
    ),
  ],
);

/* --------------------------------------------------------------------------
 * Planung (TASK-013b)
 * ----------------------------------------------------------------------- */

/**
 * Einsatz: der Elternkontext jedes Baustellentages. Ein Baustellentag ohne
 * Einsatz darf nicht entstehen (Anti-Drift-Gate Frage 2), deshalb ist
 * `engagement_id` in `worksite_days` NOT NULL.
 */
export const engagements = pgTable(
  "engagements",
  {
    id: primaryKey(),
    orgId: orgId(),
    worksiteId: uuid("worksite_id")
      .notNull()
      .references(() => worksites.id),
    title: text("title").notNull(),
    description: text("description"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    /** Fehlt bei offenem Ende; dann ist `planning_horizon_date` Pflicht. */
    endDate: date("end_date", { mode: "string" }),
    planningHorizonDate: date("planning_horizon_date", { mode: "string" }),
    colourKey: text("colour_key").notNull(),
    plannedStartTime: time("planned_start_time"),
    plannedEndTime: time("planned_end_time"),
    /** Ausgangskonfiguration; haelt eine spaetere Einsatz-Verlaengerung (H-07) offen. */
    initialConfiguration: jsonb("initial_configuration").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("engagements_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check(
      "engagements_end_not_before_start",
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    // Offenes Ende ist erlaubt, aber nie ohne Horizont - sonst waere die
    // Materialisierung unbegrenzt.
    check(
      "engagements_horizon_required_when_open",
      sql`${table.endDate} is not null or ${table.planningHorizonDate} is not null`,
    ),
    check(
      "engagements_horizon_not_before_start",
      sql`${table.planningHorizonDate} is null or ${table.planningHorizonDate} >= ${table.startDate}`,
    ),
    check(
      "engagements_colour_key_known",
      sql`${table.colourKey} in ('moos', 'ocker', 'himmel', 'ton', 'pflaume', 'petrol', 'schiefer', 'rose')`,
    ),
  ],
);

/**
 * Identitaet des Baustellentages: (org, worksite, local_date) ist eindeutig und
 * stabil. Genau daran haengt die Kernentscheidung "ein Tag erscheint im
 * Kalender genau einmal, unabhaengig von der Teamgroesse".
 */
export const worksiteDays = pgTable(
  "worksite_days",
  {
    id: primaryKey(),
    orgId: orgId(),
    worksiteId: uuid("worksite_id")
      .notNull()
      .references(() => worksites.id),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    localDate: date("local_date", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // D-008: hoechstens ein Einsatzkontext je Baustelle und lokalem Tag.
    // Parallele Einsaetze an ANDEREN Baustellen bleiben erlaubt.
    unique("worksite_days_org_worksite_date").on(table.orgId, table.worksiteId, table.localDate),
    unique("worksite_days_org_engagement_date").on(
      table.orgId,
      table.engagementId,
      table.localDate,
    ),
  ],
);

/**
 * Tageskonfiguration als append-only Revision. Es wird nie eine Zeile
 * ueberschrieben; eine Aenderung setzt `superseded_at` der bisherigen Revision
 * und fuegt eine neue ein.
 */
export const worksiteDayConfigurations = pgTable(
  "worksite_day_configurations",
  {
    id: primaryKey(),
    orgId: orgId(),
    worksiteDayId: uuid("worksite_day_id")
      .notNull()
      .references(() => worksiteDays.id),
    revisionNo: integer("revision_no").notNull(),
    origin: text("origin").notNull(),
    plannedStartTime: time("planned_start_time"),
    plannedEndTime: time("planned_end_time"),
    note: text("note"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    correlationId: text("correlation_id"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("worksite_day_configurations_day_revision").on(table.worksiteDayId, table.revisionNo),
    check("worksite_day_configurations_revision_positive", sql`${table.revisionNo} >= 1`),
    check(
      "worksite_day_configurations_origin_known",
      sql`${table.origin} in ('materialized', 'day_edit', 'series_edit')`,
    ),
    // Partial Unique: genau eine aktuelle Revision je Tag. Das ist ein INDEX,
    // keine Constraint - in PostgreSQL also nicht DEFERRABLE. Deshalb muss die
    // Schreibreihenfolge erst superseded_at setzen und dann einfuegen.
    uniqueIndex("worksite_day_configurations_one_current")
      .on(table.worksiteDayId)
      .where(sql`${table.supersededAt} is null`),
  ],
);

export const dayTeamMembers = pgTable(
  "day_team_members",
  {
    id: primaryKey(),
    orgId: orgId(),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => worksiteDayConfigurations.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    createdAt: createdAt(),
  },
  (table) => [unique("day_team_members_unique").on(table.configurationId, table.employeeId)],
);

export const dayResourceAllocations = pgTable(
  "day_resource_allocations",
  {
    id: primaryKey(),
    orgId: orgId(),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => worksiteDayConfigurations.id),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id),
    createdAt: createdAt(),
  },
  (table) => [
    unique("day_resource_allocations_unique").on(table.configurationId, table.resourceId),
  ],
);
