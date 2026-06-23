import { desc, eq } from 'drizzle-orm'
import { db } from '../../config/database'
import { payments } from '../../db/schema'

export type RecordPayment = {
  tenantId: string
  provider?: string
  eventId: string
  type: 'subscription' | 'credit_pack'
  description: string
  amountCents: number
  currency?: string
  status: 'paid' | 'failed' | 'refunded'
}

export const paymentsRepository = {
  /** Registra um pagamento. Idempotente por eventId (re-entregas do webhook não duplicam). */
  async record(data: RecordPayment) {
    await db
      .insert(payments)
      .values({
        tenantId: data.tenantId,
        provider: data.provider ?? 'stripe',
        eventId: data.eventId,
        type: data.type,
        description: data.description,
        amountCents: data.amountCents,
        currency: data.currency ?? 'brl',
        status: data.status,
      })
      .onConflictDoNothing({ target: payments.eventId })
  },

  async listByTenant(tenantId: string, limit = 100) {
    return db
      .select({
        id: payments.id,
        type: payments.type,
        description: payments.description,
        amountCents: payments.amountCents,
        currency: payments.currency,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.tenantId, tenantId))
      .orderBy(desc(payments.createdAt))
      .limit(limit)
  },
}
