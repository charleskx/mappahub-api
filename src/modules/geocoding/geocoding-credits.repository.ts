import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db } from '../../config/database'
import { geocodingCreditPacks } from '../../db/schema'

export const geocodingCreditsRepository = {
  /** Total de créditos disponíveis (lotes não-expirados). */
  async availableBalance(tenantId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${geocodingCreditPacks.remaining}), 0)::int` })
      .from(geocodingCreditPacks)
      .where(and(
        eq(geocodingCreditPacks.tenantId, tenantId),
        gt(geocodingCreditPacks.remaining, 0),
        gt(geocodingCreditPacks.expiresAt, new Date()),
      ))
    return row?.total ?? 0
  },

  /** Lotes ativos (com saldo e não-expirados), por validade crescente. */
  async listActive(tenantId: string) {
    return db
      .select({
        remaining: geocodingCreditPacks.remaining,
        quantity: geocodingCreditPacks.quantity,
        expiresAt: geocodingCreditPacks.expiresAt,
      })
      .from(geocodingCreditPacks)
      .where(and(
        eq(geocodingCreditPacks.tenantId, tenantId),
        gt(geocodingCreditPacks.remaining, 0),
        gt(geocodingCreditPacks.expiresAt, new Date()),
      ))
      .orderBy(asc(geocodingCreditPacks.expiresAt))
  },

  /**
   * Consome 1 crédito do lote não-expirado que vence primeiro (FIFO por validade).
   * Atômico — o worker roda com concurrency 1. Retorna true se consumiu.
   */
  async consumeOne(tenantId: string): Promise<boolean> {
    const target = db
      .select({ id: geocodingCreditPacks.id })
      .from(geocodingCreditPacks)
      .where(and(
        eq(geocodingCreditPacks.tenantId, tenantId),
        gt(geocodingCreditPacks.remaining, 0),
        gt(geocodingCreditPacks.expiresAt, new Date()),
      ))
      .orderBy(asc(geocodingCreditPacks.expiresAt))
      .limit(1)

    const updated = await db
      .update(geocodingCreditPacks)
      .set({ remaining: sql`${geocodingCreditPacks.remaining} - 1` })
      .where(eq(geocodingCreditPacks.id, sql`(${target})`))
      .returning({ id: geocodingCreditPacks.id })

    return updated.length > 0
  },

  /** Concede um lote de créditos. Idempotente por stripeSessionId. */
  async grantPack(tenantId: string, pack: {
    quantity: number
    expiresAt: Date
    stripeSessionId: string
    amountCents: number | null
  }) {
    await db
      .insert(geocodingCreditPacks)
      .values({
        tenantId,
        quantity: pack.quantity,
        remaining: pack.quantity,
        expiresAt: pack.expiresAt,
        stripeSessionId: pack.stripeSessionId,
        amountCents: pack.amountCents,
      })
      .onConflictDoNothing({ target: geocodingCreditPacks.stripeSessionId })
  },
}
