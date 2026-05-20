import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../config/database'
import { refreshTokens, tenants, users } from '../../db/schema'

export const authRepository = {
  async findUserByEmail(email: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1)
    return user ?? null
  },

  async findUserById(id: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1)
    return user ?? null
  },

  async findUserByGoogleId(googleId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.googleId, googleId), isNull(users.deletedAt)))
      .limit(1)
    return user ?? null
  },

  // token recebido já deve ser o HASH (HMAC-SHA256)
  async findUserByVerifyToken(tokenHash: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.emailVerifyToken, tokenHash), isNull(users.deletedAt)))
      .limit(1)
    return user ?? null
  },

  // token recebido já deve ser o HASH (HMAC-SHA256)
  async findUserByResetToken(tokenHash: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.resetPasswordToken, tokenHash),
          isNull(users.deletedAt),
          gt(users.resetPasswordExpiresAt, new Date()),
        ),
      )
      .limit(1)
    return user ?? null
  },

  async findTenantBySlug(slug: string) {
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1)
    return tenant ?? null
  },

  async updateUser(id: string, data: Partial<typeof users.$inferInsert>) {
    await db.update(users).set(data).where(eq(users.id, id))
  },

  // token recebido já deve ser o HASH (HMAC-SHA256)
  async findRefreshToken(tokenHash: string) {
    const [rt] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, tokenHash))
      .limit(1)
    return rt ?? null
  },

  async createRefreshToken(data: {
    userId: string
    tenantId: string
    token: string   // HASH — nunca o valor bruto
    familyId: string
    expiresAt: Date
  }) {
    await db.insert(refreshTokens).values(data)
  },

  async revokeRefreshToken(id: string) {
    await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, id))
  },

  /** Revoga toda a família de tokens — chamado quando reuse de token revogado é detectado. */
  async revokeRefreshTokenFamily(familyId: string) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
  },
}
