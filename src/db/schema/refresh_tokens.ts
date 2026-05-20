import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    token: varchar('token', { length: 500 }).notNull().unique(),
    familyId: uuid('family_id').notNull().defaultRandom(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  t => ({
    tokenIdx: index('refresh_tokens_token_idx').on(t.token),
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    familyIdx: index('refresh_tokens_family_idx').on(t.familyId),
  }),
)
