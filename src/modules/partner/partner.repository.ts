import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { db } from '../../config/database'
import { partnerColumns, partnerValues, partners, pinTypes } from '../../db/schema'
import { slugify } from '../../shared/utils'
import type { CreatePartnerInput, ListPartnersInput, UpdatePartnerInput } from './partner.schema'

export const partnerRepository = {
  async findAll(tenantId: string, filters: ListPartnersInput) {
    const { page, limit, search, visibility, pinTypeId, geocodeStatus, source, city } = filters
    const offset = (page - 1) * limit

    const conditions = [eq(partners.tenantId, tenantId), isNull(partners.deletedAt)]
    if (search) {
      const term = `%${search}%`
      conditions.push(or(ilike(partners.name, term), ilike(partners.address, term))!)
    }
    if (visibility) conditions.push(eq(partners.visibility, visibility))
    if (pinTypeId) conditions.push(eq(partners.pinTypeId, pinTypeId))
    if (geocodeStatus) conditions.push(eq(partners.geocodeStatus, geocodeStatus))
    if (source) conditions.push(eq(partners.source, source))
    if (city) conditions.push(ilike(partners.city, `%${city}%`))

    const [countRow, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(partners)
        .where(and(...conditions))
        .then(r => r[0]),
      db
        .select({
          id: partners.id,
          tenantId: partners.tenantId,
          name: partners.name,
          address: partners.address,
          lat: partners.lat,
          lng: partners.lng,
          geocodedAt: partners.geocodedAt,
          geocodeStatus: partners.geocodeStatus,
          visibility: partners.visibility,
          source: partners.source,
          externalKey: partners.externalKey,
          city: partners.city,
          state: partners.state,
          notes: partners.notes,
          createdAt: partners.createdAt,
          updatedAt: partners.updatedAt,
          deletedAt: partners.deletedAt,
          pinTypeId: pinTypes.id,
          pinTypeName: pinTypes.name,
          pinTypeColor: pinTypes.color,
        })
        .from(partners)
        .leftJoin(pinTypes, eq(partners.pinTypeId, pinTypes.id))
        .where(and(...conditions))
        .orderBy(asc(partners.name))
        .limit(limit)
        .offset(offset),
    ])

    const data = await Promise.all(
      rows.map(r =>
        attachDynamicValues({
          ...r,
          pinType: r.pinTypeId
            ? { id: r.pinTypeId, name: r.pinTypeName ?? '', color: r.pinTypeColor ?? '' }
            : null,
        }),
      ),
    )

    return { data, total: countRow.count }
  },

  async findById(id: string, tenantId: string) {
    const [row] = await db
      .select({
        id: partners.id,
        tenantId: partners.tenantId,
        name: partners.name,
        address: partners.address,
        lat: partners.lat,
        lng: partners.lng,
        geocodedAt: partners.geocodedAt,
        geocodeStatus: partners.geocodeStatus,
        visibility: partners.visibility,
        source: partners.source,
        externalKey: partners.externalKey,
        city: partners.city,
        state: partners.state,
        notes: partners.notes,
        createdAt: partners.createdAt,
        updatedAt: partners.updatedAt,
        deletedAt: partners.deletedAt,
        pinTypeId: pinTypes.id,
        pinTypeName: pinTypes.name,
        pinTypeColor: pinTypes.color,
      })
      .from(partners)
      .leftJoin(pinTypes, eq(partners.pinTypeId, pinTypes.id))
      .where(and(eq(partners.id, id), eq(partners.tenantId, tenantId), isNull(partners.deletedAt)))

    if (!row) return null
    return attachDynamicValues({
      ...row,
      pinType: row.pinTypeId
        ? { id: row.pinTypeId, name: row.pinTypeName ?? '', color: row.pinTypeColor ?? '' }
        : null,
    })
  },

  async findByExternalKey(externalKey: string, tenantId: string) {
    return db.query.partners.findFirst({
      where: and(
        eq(partners.externalKey, externalKey),
        eq(partners.tenantId, tenantId),
        isNull(partners.deletedAt),
      ),
    })
  },

  async findByName(name: string, tenantId: string) {
    return db.query.partners.findFirst({
      where: and(
        eq(partners.name, name),
        eq(partners.tenantId, tenantId),
        isNull(partners.deletedAt),
      ),
    })
  },

  async create(
    tenantId: string,
    data: CreatePartnerInput & { source?: string; externalKey?: string; pinTypeId?: string | null; importJobId?: string },
  ) {
    const [partner] = await db
      .insert(partners)
      .values({
        tenantId,
        name: data.name,
        address: data.address,
        pinTypeId: data.pinTypeId ?? null,
        visibility: data.visibility,
        source: data.source ?? 'dashboard',
        externalKey: data.externalKey,
        importJobId: data.importJobId ?? null,
        updatedAt: new Date(),
      })
      .returning()

    if (data.dynamicValues && Object.keys(data.dynamicValues).length > 0) {
      await upsertDynamicValues(partner.id, tenantId, data.dynamicValues)
    }

    return partner
  },

  async update(
    id: string,
    tenantId: string,
    data: UpdatePartnerInput & { pinTypeId?: string | null; externalKey?: string; source?: string },
  ) {
    const updates: Partial<typeof partners.$inferInsert> = { updatedAt: new Date() }
    if (data.name !== undefined) updates.name = data.name
    if (data.address !== undefined) updates.address = data.address
    if ('pinTypeId' in data) updates.pinTypeId = data.pinTypeId ?? null
    if (data.visibility !== undefined) updates.visibility = data.visibility
    if ('notes' in data) updates.notes = data.notes ?? null
    if (data.externalKey !== undefined) updates.externalKey = data.externalKey
    if (data.source !== undefined) updates.source = data.source

    const [updated] = await db
      .update(partners)
      .set(updates)
      .where(and(eq(partners.id, id), eq(partners.tenantId, tenantId)))
      .returning()

    if (data.dynamicValues) {
      await upsertDynamicValues(id, tenantId, data.dynamicValues)
    }

    return updated
  },

  async updateGeocode(
    id: string,
    geo: { lat: number; lng: number; city?: string; state?: string } | null,
    status: 'done' | 'failed',
  ) {
    await db
      .update(partners)
      .set({
        lat: geo?.lat,
        lng: geo?.lng,
        city: geo?.city,
        state: geo?.state,
        geocodedAt: new Date(),
        geocodeStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(partners.id, id))
  },

  async softDelete(id: string, tenantId: string) {
    await db
      .update(partners)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(partners.id, id), eq(partners.tenantId, tenantId)))
  },

  /** Soft-deletes imported partners whose ID is NOT in `keepIds` (full-replace mode). Only touches source='import' rows. */
  async softDeleteNonProcessedImports(tenantId: string, keepIds: string[], jobId?: string) {
    const jobIdVal = jobId ?? null
    if (keepIds.length === 0) {
      await db
        .update(partners)
        .set({ deletedAt: new Date(), updatedAt: new Date(), deletedByJobId: jobIdVal })
        .where(and(eq(partners.tenantId, tenantId), eq(partners.source, 'import'), isNull(partners.deletedAt)))
      return
    }
    await db.execute(
      sql`UPDATE partners SET deleted_at = NOW(), updated_at = NOW(), deleted_by_job_id = ${jobIdVal}
          WHERE tenant_id = ${tenantId}
            AND source = 'import'
            AND deleted_at IS NULL
            AND id NOT IN (${sql.join(keepIds.map(k => sql`${k}`), sql`, `)})`,
    )
  },

  async findAllImportedIds(tenantId: string): Promise<string[]> {
    const rows = await db
      .select({ id: partners.id })
      .from(partners)
      .where(and(eq(partners.tenantId, tenantId), eq(partners.source, 'import'), isNull(partners.deletedAt)))
    return rows.map(r => r.id)
  },

  async getColumns(tenantId: string) {
    return db.query.partnerColumns.findMany({
      where: eq(partnerColumns.tenantId, tenantId),
      orderBy: (c, { asc }) => [asc(c.sortOrder), asc(c.label)],
    })
  },
}

type PartnerRow = {
  id: string
  tenantId: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  geocodedAt: Date | null
  geocodeStatus: string | null
  visibility: string
  source: string | null
  externalKey: string | null
  city: string | null
  state: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  pinType: { id: string; name: string; color: string } | null
}

async function attachDynamicValues(partner: PartnerRow) {
  const rows = await db
    .select({ key: partnerColumns.key, value: partnerValues.value })
    .from(partnerValues)
    .innerJoin(partnerColumns, eq(partnerColumns.id, partnerValues.columnId))
    .where(eq(partnerValues.partnerId, partner.id))

  const dynamic: Record<string, string | null> = {}
  for (const row of rows) dynamic[row.key] = row.value ?? null

  return { ...partner, dynamicValues: dynamic }
}

async function upsertDynamicValues(
  partnerId: string,
  tenantId: string,
  values: Record<string, string>,
) {
  for (const [rawKey, value] of Object.entries(values)) {
    const key = slugify(rawKey)
    if (!key) continue

    let col = await db.query.partnerColumns.findFirst({
      where: and(eq(partnerColumns.tenantId, tenantId), eq(partnerColumns.key, key)),
    })

    if (!col) {
      const [inserted] = await db
        .insert(partnerColumns)
        .values({ tenantId, key, label: rawKey, updatedAt: new Date() })
        .onConflictDoNothing()
        .returning()
      col = inserted
    }

    if (!col) continue

    await db
      .insert(partnerValues)
      .values({ partnerId, columnId: col.id, value })
      .onConflictDoUpdate({
        target: [partnerValues.partnerId, partnerValues.columnId],
        set: { value },
      })
  }
}
