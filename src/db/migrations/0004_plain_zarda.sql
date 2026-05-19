ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" varchar(200);--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "brand_logo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "brand_name" varchar(200);--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "brand_website_url" varchar(500);--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "brand_color" varchar(7);--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "brand_footer_text" varchar(300);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");