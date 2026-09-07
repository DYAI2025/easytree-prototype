import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  pgTable,
  text,
  timestamp,
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
