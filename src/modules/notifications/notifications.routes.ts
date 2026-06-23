import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middlewares/authenticate'
import { onTenantEvent } from '../../shared/sse-bus'
import { notificationsService } from './notifications.service'

export async function notificationsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [authenticate] }, async req => {
    return notificationsService.list(req.tenantId, req.userRole)
  })

  // SSE — real-time push for notifications and geocoding updates.
  // Auth via Authorization header (handled by authenticate middleware) — no token in URL.
  app.get('/events', { preHandler: [authenticate] }, async (req, reply) => {
    const tenantId = req.tenantId

    // Flush CORS and other Fastify headers to reply.raw before hijacking —
    // reply.hijack() bypasses Fastify's send lifecycle so buffered headers never arrive otherwise.
    for (const [key, val] of Object.entries(reply.getHeaders())) {
      if (val !== undefined) reply.raw.setHeader(key, val as string | number | string[])
    }
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.hijack()

    const send = (event: string, data: object) => {
      try {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      } catch {}
    }

    reply.raw.write(': connected\n\n')

    // Heartbeat a cada 15s mantém a conexão "ativa" para proxies/CDN (ex.: Cloudflare,
    // que encerra com 524 conexões sem dados por ~100s). Margem folgada contra o timeout.
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': heartbeat\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 15_000)

    const unsubscribe = onTenantEvent(tenantId, event => {
      send(event.type, event)
    })

    req.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
      reply.raw.end()
    })
  })
}
