import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// Histórico de pagamentos agnóstico de gateway. Alimentado pelos webhooks do provider.
// Guardar aqui (e não só no Stripe) dá uma tela de histórico in-app e sobrevive a troca de gateway.
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  provider: varchar('provider', { length: 20 }).default('stripe').notNull(),
  // ID do evento do provider (ex: Stripe event.id) — idempotência do webhook
  eventId: varchar('event_id', { length: 200 }).unique(),
  // subscription | credit_pack
  type: varchar('type', { length: 20 }).notNull(),
  description: varchar('description', { length: 300 }),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 10 }).default('brl').notNull(),
  // paid | failed | refunded
  status: varchar('status', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
