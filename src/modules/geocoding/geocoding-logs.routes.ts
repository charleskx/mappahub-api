import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../config/database'
import { authenticate } from '../../middlewares/authenticate'
import { subscriptionGuard } from '../../middlewares/subscription-guard'
import { partners } from '../../db/schema'
import { AppError } from '../../shared/errors'
import { defineAbilityFor } from '../../shared/permissions'
import { emitToTenant } from '../../shared/sse-bus'
import { tenants } from '../../db/schema'
import { geocodingCreditsRepository } from './geocoding-credits.repository'
import { geocodingLogsRepository } from './geocoding-logs.repository'
import { effectiveLimit } from './geocoding.limits'
import { geocodeAddress } from './geocoding.service'

export async function geocodingLogsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', subscriptionGuard)

  app.get('/geocoding-logs', async (req, reply) => {
    const logs = await geocodingLogsRepository.findFailedByTenant(req.tenantId)
    return reply.send(logs)
  })

  // Uso de geocoding do tenant: franquia mensal + saldo de créditos extras
  app.get('/geocoding-usage', async (req, reply) => {
    const [tenant] = await db
      .select({
        geocodingMonthlyLimit: tenants.geocodingMonthlyLimit,
        geocodingLimitExpiresAt: tenants.geocodingLimitExpiresAt,
      })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .limit(1)

    const freeLimit = effectiveLimit(tenant ?? { geocodingMonthlyLimit: null, geocodingLimitExpiresAt: null })
    const [usage, creditLots] = await Promise.all([
      geocodingLogsRepository.monthlyUsage(req.tenantId),
      geocodingCreditsRepository.listActive(req.tenantId),
    ])

    const now = new Date()
    const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    return reply.send({
      freeUsed: Math.min(usage, freeLimit),
      freeLimit,
      resetsAt: resetsAt.toISOString(),
      limitExpiresAt: tenant?.geocodingLimitExpiresAt?.toISOString() ?? null,
      creditsTotal: creditLots.reduce((sum, l) => sum + l.remaining, 0),
      creditLots: creditLots.map(l => ({ remaining: l.remaining, expiresAt: l.expiresAt.toISOString() })),
    })
  })

  app.get('/geocoding-logs/partner/:partnerId', async (req, reply) => {
    const { partnerId } = req.params as { partnerId: string }
    const logs = await geocodingLogsRepository.findByPartner(partnerId, req.tenantId)
    return reply.send(logs)
  })

  // Validate an address and, if found, apply it to the partner
  app.post('/geocoding-logs/fix-address/:partnerId', async (req, reply) => {
    if (!defineAbilityFor({ role: req.userRole }).can('update', 'Partner')) {
      throw new AppError('FORBIDDEN', 403, 'Sem permissão para editar parceiros')
    }

    const { partnerId } = req.params as { partnerId: string }
    const { address, confirm } = req.body as { address: string; confirm?: boolean }

    if (!address?.trim()) throw new AppError('VALIDATION_ERROR', 400, 'Endereço obrigatório')

    const [partner] = await db
      .select({ id: partners.id, tenantId: partners.tenantId })
      .from(partners)
      .where(eq(partners.id, partnerId))
      .limit(1)

    if (!partner || partner.tenantId !== req.tenantId)
      throw new AppError('NOT_FOUND', 404, 'Parceiro não encontrado')

    let geo: Awaited<ReturnType<typeof geocodeAddress>>
    try {
      geo = await geocodeAddress(address.trim())
    } catch {
      throw new AppError('ADDRESS_NOT_FOUND', 422, 'Endereço não encontrado. Tente ser mais específico.')
    }
    if (!geo) throw new AppError('ADDRESS_NOT_FOUND', 422, 'Endereço não encontrado. Tente ser mais específico.')

    if (!confirm) {
      return reply.send({ valid: true, lat: geo.lat, lng: geo.lng, city: geo.city, state: geo.state })
    }

    await db.update(partners).set({
      address: address.trim(),
      lat: geo.lat,
      lng: geo.lng,
      city: geo.city,
      state: geo.state,
      geocodeStatus: 'done',
      geocodedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(partners.id, partnerId))

    emitToTenant(req.tenantId, { type: 'geocoding-updated', partnerId })
    emitToTenant(req.tenantId, { type: 'notification' })

    return reply.send({ applied: true, lat: geo.lat, lng: geo.lng, city: geo.city, state: geo.state })
  })
}
