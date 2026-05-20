import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import fastifyJwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { env } from './config/env'
import { redis } from './config/redis'
import { adminRoutes } from './modules/admin/admin.routes'
import { geocodingLogsRoutes } from './modules/geocoding/geocoding-logs.routes'
import { placesRoutes } from './modules/places/places.routes'
import { notificationsRoutes } from './modules/notifications/notifications.routes'
import { ticketsRoutes } from './modules/tickets/tickets.routes'
import { authRoutes } from './modules/auth/auth.routes'
import { billingRoutes } from './modules/billing/billing.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { exportRoutes } from './modules/export/export.routes'
import { importRoutes } from './modules/import/import.routes'
import { mapRoutes } from './modules/map/map.routes'
import { partnerRoutes } from './modules/partner/partner.routes'
import { pinTypeRoutes } from './modules/pin-type/pin-type.routes'
import { tenantRoutes } from './modules/tenant/tenant.routes'
import { userRoutes } from './modules/user/user.routes'
import { AppError } from './shared/errors'
import { Sentry } from './config/sentry'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: 'info',
      ...(env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
  })

  if (env.NODE_ENV === 'production' && !env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN deve ser definido em produção')
  }

  const allowedOrigins = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',').map(o => o.trim())
    : true // development: allow all

  await app.register(helmet, {
    contentSecurityPolicy: false, // API JSON-only — CSP não se aplica
    crossOriginEmbedderPolicy: false,
  })

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  await app.register(cookie)

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '15m' },
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
  })

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  })

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message })
    }

    if (
      error instanceof Error &&
      'statusCode' in error &&
      (error as unknown as { statusCode: number }).statusCode === 429
    ) {
      return reply
        .status(429)
        .send({ error: 'RATE_LIMIT', message: 'Muitas requisições. Tente novamente em instantes.' })
    }

    Sentry.captureException(error)
    req.log.error(error)
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Erro interno do servidor' })
  })

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(dashboardRoutes, { prefix: '/dashboard' })
  await app.register(userRoutes, { prefix: '/users' })
  await app.register(billingRoutes, { prefix: '/billing' })
  await app.register(partnerRoutes, { prefix: '/partners' })
  await app.register(pinTypeRoutes, { prefix: '/pin-types' })
  await app.register(importRoutes, { prefix: '/import' })
  await app.register(mapRoutes, { prefix: '/maps' })
  await app.register(tenantRoutes, { prefix: '/tenant' })
  await app.register(exportRoutes, { prefix: '/export' })
  await app.register(adminRoutes, { prefix: '/admin' })
  await app.register(notificationsRoutes, { prefix: '/notifications' })
  await app.register(ticketsRoutes, { prefix: '/tickets' })
  await app.register(geocodingLogsRoutes)
  await app.register(placesRoutes, { prefix: '/places' })

  return app
}
