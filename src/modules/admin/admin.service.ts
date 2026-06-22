import { AppError } from '../../shared/errors'
import { geocodingCreditsRepository } from '../geocoding/geocoding-credits.repository'
import { geocodingLogsRepository } from '../geocoding/geocoding-logs.repository'
import { effectiveLimit, GEOCODING_DEFAULT_MONTHLY_LIMIT } from '../geocoding/geocoding.limits'
import { adminRepository } from './admin.repository'

type Requester = { role: string }

function assertSuperAdmin(requester: Requester) {
  if (requester.role !== 'super_admin') {
    throw new AppError('FORBIDDEN', 403, 'Acesso restrito a super admins')
  }
}

export const adminService = {
  async listTenants(requester: Requester) {
    assertSuperAdmin(requester)
    return adminRepository.listTenants()
  },

  async getTenant(id: string, requester: Requester) {
    assertSuperAdmin(requester)
    const tenant = await adminRepository.findTenantById(id)
    if (!tenant) throw new AppError('TENANT_NOT_FOUND', 404, 'Tenant não encontrado')
    return tenant
  },

  async blockTenant(id: string, requester: Requester) {
    assertSuperAdmin(requester)
    const tenant = await adminRepository.findTenantById(id)
    if (!tenant) throw new AppError('TENANT_NOT_FOUND', 404, 'Tenant não encontrado')
    if (!tenant.active) throw new AppError('ALREADY_BLOCKED', 409, 'Tenant já está bloqueado')
    await adminRepository.setTenantActive(id, false)
  },

  async unblockTenant(id: string, requester: Requester) {
    assertSuperAdmin(requester)
    const tenant = await adminRepository.findTenantById(id)
    if (!tenant) throw new AppError('TENANT_NOT_FOUND', 404, 'Tenant não encontrado')
    if (tenant.active) throw new AppError('NOT_BLOCKED', 409, 'Tenant não está bloqueado')
    await adminRepository.setTenantActive(id, true)
  },

  async listTenantImports(tenantId: string, requester: Requester) {
    assertSuperAdmin(requester)
    return adminRepository.listTenantImports(tenantId, 10)
  },

  async rollbackImport(jobId: string, tenantId: string, requester: Requester) {
    assertSuperAdmin(requester)
    await adminRepository.rollbackImport(jobId, tenantId)
  },

  async listTenantUsers(tenantId: string, requester: Requester) {
    assertSuperAdmin(requester)
    return adminRepository.listTenantUsers(tenantId)
  },

  async disable2fa(userId: string, tenantId: string, requester: Requester) {
    assertSuperAdmin(requester)
    // Confirm user belongs to that tenant before touching it
    const tenantUsers = await adminRepository.listTenantUsers(tenantId)
    const user = tenantUsers.find(u => u.id === userId)
    if (!user) throw new AppError('USER_NOT_FOUND', 404, 'Usuário não encontrado neste tenant')
    if (!user.totpEnabled) throw new AppError('2FA_NOT_ENABLED', 409, '2FA não está ativo para este usuário')
    await adminRepository.disable2fa(userId)
  },

  async getMetrics(requester: Requester) {
    assertSuperAdmin(requester)
    return adminRepository.getMetrics()
  },

  async getTenantGeocoding(tenantId: string, requester: Requester) {
    assertSuperAdmin(requester)
    const tenant = await adminRepository.findTenantById(tenantId)
    if (!tenant) throw new AppError('TENANT_NOT_FOUND', 404, 'Tenant não encontrado')

    const [used, creditsTotal] = await Promise.all([
      geocodingLogsRepository.monthlyUsage(tenantId),
      geocodingCreditsRepository.availableBalance(tenantId),
    ])

    return {
      used,
      defaultLimit: GEOCODING_DEFAULT_MONTHLY_LIMIT,
      monthlyLimit: tenant.geocodingMonthlyLimit,
      limitExpiresAt: tenant.geocodingLimitExpiresAt?.toISOString() ?? null,
      effectiveLimit: effectiveLimit(tenant),
      creditsTotal,
    }
  },

  async setGeocodingLimit(
    tenantId: string,
    input: { limit: number | null; expiresAt: string | null },
    requester: Requester,
  ) {
    assertSuperAdmin(requester)
    const tenant = await adminRepository.findTenantById(tenantId)
    if (!tenant) throw new AppError('TENANT_NOT_FOUND', 404, 'Tenant não encontrado')

    if (input.limit != null && (!Number.isInteger(input.limit) || input.limit < 0)) {
      throw new AppError('VALIDATION_ERROR', 400, 'Limite deve ser um inteiro >= 0')
    }

    let expiresAt: Date | null = null
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt)
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        throw new AppError('VALIDATION_ERROR', 400, 'Validade deve ser uma data futura')
      }
    }

    await adminRepository.setGeocodingLimit(tenantId, input.limit, expiresAt)
  },
}
