import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../../config/database'
import { importJobs, partners, subscriptions, tenants, totpRecoveryCodes, users } from '../../db/schema'

export const adminRepository = {
  async listTenants() {
    return db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        email: tenants.email,
        active: tenants.active,
        createdAt: tenants.createdAt,
        subscriptionStatus: subscriptions.status,
        planType: subscriptions.planType,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .where(isNull(tenants.deletedAt))
      .orderBy(tenants.createdAt)
  },

  async findTenantById(id: string) {
    const [row] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        email: tenants.email,
        active: tenants.active,
        createdAt: tenants.createdAt,
        geocodingMonthlyLimit: tenants.geocodingMonthlyLimit,
        geocodingLimitExpiresAt: tenants.geocodingLimitExpiresAt,
        subscriptionStatus: subscriptions.status,
        planType: subscriptions.planType,
        stripeCustomerId: subscriptions.stripeCustomerId,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .where(eq(tenants.id, id))

    if (!row) return null

    const [{ userCount }] = await db
      .select({ userCount: count() })
      .from(users)
      .where(eq(users.tenantId, id))

    return { ...row, userCount }
  },

  async setTenantActive(id: string, active: boolean) {
    await db.update(tenants).set({ active, updatedAt: new Date() }).where(eq(tenants.id, id))
  },

  async setGeocodingLimit(id: string, limit: number | null, expiresAt: Date | null) {
    await db
      .update(tenants)
      .set({ geocodingMonthlyLimit: limit, geocodingLimitExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(tenants.id, id))
  },

  async listTenantImports(tenantId: string, limit = 10) {
    return db
      .select({
        id: importJobs.id,
        fileName: importJobs.fileName,
        fileSize: importJobs.fileSize,
        mode: importJobs.mode,
        status: importJobs.status,
        totalRows: importJobs.totalRows,
        created: importJobs.created,
        updated: importJobs.updated,
        removed: importJobs.removed,
        failed: importJobs.failed,
        rolledBackAt: importJobs.rolledBackAt,
        createdAt: importJobs.createdAt,
        finishedAt: importJobs.finishedAt,
      })
      .from(importJobs)
      .where(eq(importJobs.tenantId, tenantId))
      .orderBy(desc(importJobs.createdAt))
      .limit(limit)
  },

  async rollbackImport(jobId: string, tenantId: string) {
    // Restore partners soft-deleted by this job
    await db
      .update(partners)
      .set({ deletedAt: null, deletedByJobId: null, updatedAt: new Date() })
      .where(and(eq(partners.deletedByJobId, jobId), eq(partners.tenantId, tenantId)))

    // Soft-delete partners created by this job
    await db
      .update(partners)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(partners.importJobId, jobId),
        eq(partners.tenantId, tenantId),
        isNull(partners.deletedAt),
      ))

    // Mark job as rolled back
    await db
      .update(importJobs)
      .set({ rolledBackAt: new Date() })
      .where(and(eq(importJobs.id, jobId), eq(importJobs.tenantId, tenantId)))
  },

  async listTenantUsers(tenantId: string) {
    return db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        totpEnabled: users.totpEnabled,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt)))
      .orderBy(users.createdAt)
  },

  async disable2fa(userId: string) {
    await db
      .update(users)
      .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
      .where(eq(users.id, userId))

    await db
      .delete(totpRecoveryCodes)
      .where(eq(totpRecoveryCodes.userId, userId))
  },

  async getMetrics() {
    const [{ totalTenants }] = await db
      .select({ totalTenants: count() })
      .from(tenants)
      .where(isNull(tenants.deletedAt))

    const [{ activeTenants }] = await db
      .select({ activeTenants: count() })
      .from(subscriptions)
      .where(sql`${subscriptions.status} IN ('active', 'trialing')`)

    const [{ activeSubscriptions }] = await db
      .select({ activeSubscriptions: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'))

    const [{ monthlyCount }] = await db
      .select({ monthlyCount: count() })
      .from(subscriptions)
      .where(sql`${subscriptions.status} = 'active' AND ${subscriptions.planType} = 'monthly'`)

    const [{ annualCount }] = await db
      .select({ annualCount: count() })
      .from(subscriptions)
      .where(sql`${subscriptions.status} = 'active' AND ${subscriptions.planType} = 'annual'`)

    const [{ totalImports }] = await db.select({ totalImports: count() }).from(importJobs)

    const [{ doneImports }] = await db
      .select({ doneImports: count() })
      .from(importJobs)
      .where(eq(importJobs.status, 'done'))

    return {
      totalTenants,
      activeTenants,
      activeSubscriptions,
      monthlySubscriptions: monthlyCount,
      annualSubscriptions: annualCount,
      totalImports,
      doneImports,
    }
  },
}
