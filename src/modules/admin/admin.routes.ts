import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middlewares/authenticate'
import { adminService } from './admin.service'

export async function adminRoutes(app: FastifyInstance) {
  // Todas as rotas exigem autenticação — verificação de super_admin no service
  app.addHook('preHandler', authenticate)

  app.get('/tenants', async req => {
    return adminService.listTenants({ role: req.userRole })
  })

  app.get('/tenants/:id', async req => {
    const { id } = req.params as { id: string }
    return adminService.getTenant(id, { role: req.userRole })
  })

  app.patch('/tenants/:id/block', async (req, reply) => {
    const { id } = req.params as { id: string }
    await adminService.blockTenant(id, { role: req.userRole })
    return reply.status(204).send()
  })

  app.patch('/tenants/:id/unblock', async (req, reply) => {
    const { id } = req.params as { id: string }
    await adminService.unblockTenant(id, { role: req.userRole })
    return reply.status(204).send()
  })

  app.get('/tenants/:id/imports', async req => {
    const { id } = req.params as { id: string }
    return adminService.listTenantImports(id, { role: req.userRole })
  })

  app.get('/tenants/:id/users', async req => {
    const { id } = req.params as { id: string }
    return adminService.listTenantUsers(id, { role: req.userRole })
  })

  app.delete('/tenants/:tenantId/users/:userId/2fa', async (req, reply) => {
    const { tenantId, userId } = req.params as { tenantId: string; userId: string }
    await adminService.disable2fa(userId, tenantId, { role: req.userRole })
    return reply.status(204).send()
  })

  app.post('/tenants/:tenantId/imports/:jobId/rollback', async (req, reply) => {
    const { tenantId, jobId } = req.params as { tenantId: string; jobId: string }
    await adminService.rollbackImport(jobId, tenantId, { role: req.userRole })
    return reply.status(204).send()
  })

  app.get('/metrics', async req => {
    return adminService.getMetrics({ role: req.userRole })
  })

  app.get('/tenants/:id/geocoding', async req => {
    const { id } = req.params as { id: string }
    return adminService.getTenantGeocoding(id, { role: req.userRole })
  })

  app.patch('/tenants/:id/geocoding-limit', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { limit, expiresAt } = req.body as { limit?: number | null; expiresAt?: string | null }
    await adminService.setGeocodingLimit(id, { limit: limit ?? null, expiresAt: expiresAt ?? null }, { role: req.userRole })
    return reply.status(204).send()
  })
}
