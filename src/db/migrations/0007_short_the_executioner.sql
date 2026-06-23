CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(20) DEFAULT 'stripe' NOT NULL,
	"event_id" varchar(200),
	"type" varchar(20) NOT NULL,
	"description" varchar(300),
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'brl' NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;