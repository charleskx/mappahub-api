import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../config/database'
import { geocodingLogs, partners, tenants } from '../../db/schema'

export type CreateGeocodingLog = {
  partnerId: string
  tenantId: string
  address: string
  status: 'success' | 'no_results' | 'failed'
  errorReason?: string | null
  lat?: number | null
  lng?: number | null
  provider?: string
}

export const geocodingLogsRepository = {
  async create(data: CreateGeocodingLog) {
    const [log] = await db
      .insert(geocodingLogs)
      .values({
        partnerId: data.partnerId,
        tenantId: data.tenantId,
        address: data.address,
        status: data.status,
        errorReason: data.errorReason ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        provider: data.provider ?? 'nominatim',
      })
      .returning()
    return log
  },

  /** Logs for a single partner — most recent first, scoped to the tenant */
  async findByPartner(partnerId: string, tenantId: string) {
    return db
      .select({
        id: geocodingLogs.id,
        address: geocodingLogs.address,
        status: geocodingLogs.status,
        errorReason: geocodingLogs.errorReason,
        provider: geocodingLogs.provider,
        lat: geocodingLogs.lat,
        lng: geocodingLogs.lng,
        attemptedAt: geocodingLogs.attemptedAt,
      })
      .from(geocodingLogs)
      .where(and(eq(geocodingLogs.partnerId, partnerId), eq(geocodingLogs.tenantId, tenantId)))
      .orderBy(desc(geocodingLogs.attemptedAt))
      .limit(50)
  },

  /**
   * All failed partners for a tenant — source of truth is the partners table.
   * Enriched with the most recent geocoding_log when available.
   * Partners that failed before the logging system was added still appear.
   */
  async findFailedByTenant(tenantId: string) {
    // 1. All partners with geocodeStatus = 'failed'
    const failedPartners = await db
      .select({
        id: partners.id,
        name: partners.name,
        address: partners.address,
        geocodeStatus: partners.geocodeStatus,
        updatedAt: partners.updatedAt,
      })
      .from(partners)
      .where(and(
        eq(partners.tenantId, tenantId),
        eq(partners.geocodeStatus, 'failed'),
        isNull(partners.deletedAt),
      ))
      .orderBy(desc(partners.updatedAt))

    if (failedPartners.length === 0) return []

    // 2. Most recent log per partner (only failures)
    const partnerIds = failedPartners.map(p => p.id)
    const logs = await db
      .select({
        id: geocodingLogs.id,
        partnerId: geocodingLogs.partnerId,
        address: geocodingLogs.address,
        status: geocodingLogs.status,
        errorReason: geocodingLogs.errorReason,
        provider: geocodingLogs.provider,
        attemptedAt: geocodingLogs.attemptedAt,
      })
      .from(geocodingLogs)
      .where(and(
        inArray(geocodingLogs.partnerId, partnerIds),
        sql`${geocodingLogs.status} != 'success'`,
      ))
      .orderBy(desc(geocodingLogs.attemptedAt))

    // Index: partnerId → most recent log
    const latestLog = new Map<string, typeof logs[0]>()
    for (const log of logs) {
      if (!latestLog.has(log.partnerId)) latestLog.set(log.partnerId, log)
    }

    // 3. Merge
    return failedPartners.map(p => {
      const log = latestLog.get(p.id)
      return {
        id: log?.id ?? `no-log-${p.id}`,
        partnerId: p.id,
        partnerName: p.name,
        address: log?.address ?? p.address,
        status: (log?.status ?? 'failed') as 'success' | 'no_results' | 'failed',
        errorReason: log?.errorReason ?? null,
        provider: log?.provider ?? 'nominatim',
        attemptedAt: log?.attemptedAt?.toISOString() ?? p.updatedAt.toISOString(),
        geocodeStatus: p.geocodeStatus,
        hasLog: !!log,
      }
    })
  },

  /**
   * All failed partners across all tenants — for super admin.
   * Same logic: source from partners, enrich with latest log.
   */
  async findAllFailures() {
    const failedPartners = await db
      .select({
        id: partners.id,
        name: partners.name,
        address: partners.address,
        tenantId: partners.tenantId,
        tenantName: tenants.name,
        geocodeStatus: partners.geocodeStatus,
        updatedAt: partners.updatedAt,
      })
      .from(partners)
      .innerJoin(tenants, eq(partners.tenantId, tenants.id))
      .where(and(
        eq(partners.geocodeStatus, 'failed'),
        isNull(partners.deletedAt),
      ))
      .orderBy(desc(partners.updatedAt))
      .limit(500)

    if (failedPartners.length === 0) return []

    const partnerIds = failedPartners.map(p => p.id)
    const logs = await db
      .select({
        id: geocodingLogs.id,
        partnerId: geocodingLogs.partnerId,
        address: geocodingLogs.address,
        status: geocodingLogs.status,
        errorReason: geocodingLogs.errorReason,
        provider: geocodingLogs.provider,
        attemptedAt: geocodingLogs.attemptedAt,
      })
      .from(geocodingLogs)
      .where(and(
        inArray(geocodingLogs.partnerId, partnerIds),
        sql`${geocodingLogs.status} != 'success'`,
      ))
      .orderBy(desc(geocodingLogs.attemptedAt))

    const latestLog = new Map<string, typeof logs[0]>()
    for (const log of logs) {
      if (!latestLog.has(log.partnerId)) latestLog.set(log.partnerId, log)
    }

    return failedPartners.map(p => {
      const log = latestLog.get(p.id)
      return {
        id: log?.id ?? `no-log-${p.id}`,
        partnerId: p.id,
        partnerName: p.name,
        tenantId: p.tenantId,
        tenantName: p.tenantName,
        address: log?.address ?? p.address,
        status: (log?.status ?? 'failed') as 'success' | 'no_results' | 'failed',
        errorReason: log?.errorReason ?? null,
        provider: log?.provider ?? 'nominatim',
        attemptedAt: log?.attemptedAt?.toISOString() ?? p.updatedAt.toISOString(),
        geocodeStatus: p.geocodeStatus,
        hasLog: !!log,
      }
    })
  },

  /** Summary counts per tenant — for super admin dashboard */
  async summaryByTenant() {
    return db
      .select({
        tenantId: partners.tenantId,
        tenantName: tenants.name,
        failures: sql<number>`count(*)::int`,
      })
      .from(partners)
      .innerJoin(tenants, eq(partners.tenantId, tenants.id))
      .where(and(eq(partners.geocodeStatus, 'failed'), isNull(partners.deletedAt)))
      .groupBy(partners.tenantId, tenants.name)
      .orderBy(sql`failures desc`)
  },
}
