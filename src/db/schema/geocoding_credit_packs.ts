import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// Lotes de créditos extras de geocoding (pré-pago). Cada compra gera um lote com
// validade própria; o consumo é FIFO por validade (o que vence antes sai primeiro).
export const geocodingCreditPacks = pgTable('geocoding_credit_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id)
    .notNull(),
  quantity: integer('quantity').notNull(),
  remaining: integer('remaining').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  // ID da sessão de checkout do Stripe — garante idempotência na entrega do webhook
  stripeSessionId: varchar('stripe_session_id', { length: 200 }).unique(),
  amountCents: integer('amount_cents'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
