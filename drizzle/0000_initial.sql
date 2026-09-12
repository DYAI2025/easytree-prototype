CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"operation" text NOT NULL,
	"subject_id" uuid,
	"payload" jsonb,
	"correlation_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "day_resource_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_resource_allocations_unique" UNIQUE("configuration_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "day_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_team_members_unique" UNIQUE("configuration_id","employee_id")
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
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"planning_horizon_date" date,
	"colour_key" text NOT NULL,
	"planned_start_time" time,
	"planned_end_time" time,
	"initial_configuration" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagements_title_not_blank" CHECK (length(trim("engagements"."title")) > 0),
	CONSTRAINT "engagements_end_not_before_start" CHECK ("engagements"."end_date" is null or "engagements"."end_date" >= "engagements"."start_date"),
	CONSTRAINT "engagements_horizon_required_when_open" CHECK ("engagements"."end_date" is not null or "engagements"."planning_horizon_date" is not null),
	CONSTRAINT "engagements_horizon_not_before_start" CHECK ("engagements"."planning_horizon_date" is null or "engagements"."planning_horizon_date" >= "engagements"."start_date"),
	CONSTRAINT "engagements_colour_key_known" CHECK ("engagements"."colour_key" in ('moos', 'ocker', 'himmel', 'ton', 'pflaume', 'petrol', 'schiefer', 'rose'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_org_operation_key" UNIQUE("org_id","operation","idempotency_key"),
	CONSTRAINT "idempotency_records_status_plausible" CHECK ("idempotency_records"."response_status" between 100 and 599)
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
CREATE TABLE "worksite_day_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"worksite_day_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"origin" text NOT NULL,
	"planned_start_time" time,
	"planned_end_time" time,
	"note" text,
	"superseded_at" timestamp with time zone,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worksite_day_configurations_day_revision" UNIQUE("worksite_day_id","revision_no"),
	CONSTRAINT "worksite_day_configurations_revision_positive" CHECK ("worksite_day_configurations"."revision_no" >= 1),
	CONSTRAINT "worksite_day_configurations_origin_known" CHECK ("worksite_day_configurations"."origin" in ('materialized', 'day_edit', 'series_edit'))
);
--> statement-breakpoint
CREATE TABLE "worksite_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"worksite_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worksite_days_org_worksite_date" UNIQUE("org_id","worksite_id","local_date"),
	CONSTRAINT "worksite_days_org_engagement_date" UNIQUE("org_id","engagement_id","local_date")
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
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_resource_allocations" ADD CONSTRAINT "day_resource_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_resource_allocations" ADD CONSTRAINT "day_resource_allocations_configuration_id_worksite_day_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."worksite_day_configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_resource_allocations" ADD CONSTRAINT "day_resource_allocations_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_team_members" ADD CONSTRAINT "day_team_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_team_members" ADD CONSTRAINT "day_team_members_configuration_id_worksite_day_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."worksite_day_configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_team_members" ADD CONSTRAINT "day_team_members_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_worksite_id_worksites_id_fk" FOREIGN KEY ("worksite_id") REFERENCES "public"."worksites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_day_configurations" ADD CONSTRAINT "worksite_day_configurations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_day_configurations" ADD CONSTRAINT "worksite_day_configurations_worksite_day_id_worksite_days_id_fk" FOREIGN KEY ("worksite_day_id") REFERENCES "public"."worksite_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_days" ADD CONSTRAINT "worksite_days_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_days" ADD CONSTRAINT "worksite_days_worksite_id_worksites_id_fk" FOREIGN KEY ("worksite_id") REFERENCES "public"."worksites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksite_days" ADD CONSTRAINT "worksite_days_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksites" ADD CONSTRAINT "worksites_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worksite_day_configurations_one_current" ON "worksite_day_configurations" USING btree ("worksite_day_id") WHERE "worksite_day_configurations"."superseded_at" is null;