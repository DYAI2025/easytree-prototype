CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_name_not_blank" CHECK (length(trim("customers"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"role_label" text,
	"active" boolean DEFAULT true NOT NULL,
	"daily_cost_minor_units" bigint,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"cost_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_name_not_blank" CHECK (length(trim("employees"."display_name")) > 0),
	CONSTRAINT "employees_daily_cost_non_negative" CHECK ("employees"."daily_cost_minor_units" is null or "employees"."daily_cost_minor_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"time_zone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"identifier" text,
	"active" boolean DEFAULT true NOT NULL,
	"daily_cost_minor_units" bigint,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"cost_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_kind_known" CHECK ("resources"."kind" in ('vehicle', 'machine', 'equipment')),
	CONSTRAINT "resources_name_not_blank" CHECK (length(trim("resources"."name")) > 0),
	CONSTRAINT "resources_daily_cost_non_negative" CHECK ("resources"."daily_cost_minor_units" is null or "resources"."daily_cost_minor_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "worksites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line" text NOT NULL,
	"postal_code" text,
	"city" text,
	"country" text DEFAULT 'DE' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"geocode_source" text,
	"geocode_resolved_at" timestamp with time zone,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worksites_name_not_blank" CHECK (length(trim("worksites"."name")) > 0),
	CONSTRAINT "worksites_lat_lng_paired" CHECK (("worksites"."lat" is null) = ("worksites"."lng" is null)),
	CONSTRAINT "worksites_geocode_source_known" CHECK ("worksites"."geocode_source" is null or "worksites"."geocode_source" in ('manual', 'nominatim', 'fixture'))
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;