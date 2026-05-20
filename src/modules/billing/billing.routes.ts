import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middlewares/authenticate'
import { AppError } from '../../shared/errors'
import { createCheckoutSchema } from './billing.schema'
import { billingService } from './billing.service'

export async function billingRoutes(app: FastifyInstance) {
  // Webhook must live in an isolated scope with raw body parsing
  await app.register(async sub => {
    sub.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body)
    })

    sub.post('/webhook', async (req, reply) => {
      const signature = req.headers['stripe-signature']
      if (!signature || typeof signature !== 'string') {
        throw new AppError('WEBHOOK_SIGNATURE_MISSING', 400, 'Stripe-Signature ausente')
      }

      await billingService.handleWebhookEvent(req.body as Buffer, signature)
      return reply.status(200).send({ received: true })
    })
  })

  app.get('/subscription', { preHandler: [authenticate] }, async req => {
    return billingService.getSubscription(req.tenantId)
  })

  app.post('/checkout', { preHandler: [authenticate] }, async (req, reply) => {
    if (req.userRole !== 'owner' && req.userRole !== 'super_admin') {
      throw new AppError('FORBIDDEN', 403, 'Apenas o owner pode iniciar o checkout')
    }

    const body = createCheckoutSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    const result = await billingService.createCheckoutSession(req.tenantId, body.data)
    return reply.status(201).send(result)
  })

  app.post('/portal', { preHandler: [authenticate] }, async (req, reply) => {
    if (req.userRole !== 'owner' && req.userRole !== 'super_admin') {
      throw new AppError('FORBIDDEN', 403, 'Apenas o owner pode acessar o portal de billing')
    }

    const result = await billingService.createPortalSession(req.tenantId)
    return reply.status(201).send(result)
  })
}
