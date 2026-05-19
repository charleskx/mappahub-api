import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middlewares/authenticate'
import { subscriptionGuard } from '../../middlewares/subscription-guard'
import { AppError } from '../../shared/errors'
import { updateSettingsSchema } from './tenant.schema'
import { tenantService } from './tenant.service'

const preHandler = [authenticate, subscriptionGuard]

export async function tenantRoutes(app: FastifyInstance) {
  app.get('/settings', { preHandler }, async req => {
    return tenantService.getSettings({
      id: req.userId,
      role: req.userRole,
      tenantId: req.tenantId,
    })
  })

  app.put('/settings', { preHandler }, async req => {
    const body = updateSettingsSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    return tenantService.updateSettings(body.data, {
      id: req.userId,
      role: req.userRole,
      tenantId: req.tenantId,
    })
  })

  app.post('/upload/logo', { preHandler }, async (req, reply) => {
    const url = await tenantService.uploadLogo(req, {
      id: req.userId,
      role: req.userRole,
      tenantId: req.tenantId,
    })
    return reply.status(201).send({ url })
  })
}
