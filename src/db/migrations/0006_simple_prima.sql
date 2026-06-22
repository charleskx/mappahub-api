CREATE TABLE "geocoding_credit_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"remaining" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"stripe_session_id" varchar(200),
	"amount_cents" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "geocoding_credit_packs_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "geocoding_monthly_limit" integer;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "geocoding_limit_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "geocoding_credit_packs" ADD CONSTRAINT "geocoding_credit_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;