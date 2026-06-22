import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 200 }).notNull(),
  active: boolean('active').default(true).notNull(),
  // Override da franquia mensal de geocoding pelo super admin. null = usa o padrão (2000).
  geocodingMonthlyLimit: integer('geocoding_monthly_limit'),
  // Validade do override. null = permanente; se no passado, volta ao padrão.
  geocodingLimitExpiresAt: timestamp('geocoding_limit_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
})
