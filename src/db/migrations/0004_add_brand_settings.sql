ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "brand_logo_url" varchar(500),
  ADD COLUMN IF NOT EXISTS "brand_name" varchar(200),
  ADD COLUMN IF NOT EXISTS "brand_website_url" varchar(500),
  ADD COLUMN IF NOT EXISTS "brand_color" varchar(7),
  ADD COLUMN IF NOT EXISTS "brand_footer_text" varchar(300);
