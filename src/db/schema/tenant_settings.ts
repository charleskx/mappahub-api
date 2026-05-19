import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const tenantSettings = pgTable('tenant_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull()
    .unique(),
  defaultMapZoom: integer('default_map_zoom').default(12),
  defaultMapLat: doublePrecision('default_map_lat'),
  defaultMapLng: doublePrecision('default_map_lng'),
  publicMapEnabled: boolean('public_map_enabled').default(true),
  publicMapToken: varchar('public_map_token', { length: 100 }),
  brandLogoUrl: varchar('brand_logo_url', { length: 500 }),
  brandName: varchar('brand_name', { length: 200 }),
  brandWebsiteUrl: varchar('brand_website_url', { length: 500 }),
  brandColor: varchar('brand_color', { length: 7 }),
  brandFooterText: varchar('brand_footer_text', { length: 300 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
