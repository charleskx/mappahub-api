import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/modules/admin/admin.repository', () => ({
  adminRepository: {
    listTenants: vi.fn(),
    findTenantById: vi.fn(),
    setTenantActive: vi.fn(),
    listTenantImports: vi.fn(),
    rollbackImport: vi.fn(),
    listTenantUsers: vi.fn(),
    disable2fa: vi.fn(),
    getMetrics: vi.fn(),
    setGeocodingLimit: vi.fn(),
  },
}))

vi.mock('../src/modules/geocoding/geocoding-credits.repository', () => ({
  geocodingCreditsRepository: {
    availableBalance: vi.fn(),
    listActive: vi.fn(),
    consumeOne: vi.fn(),
    grantPack: vi.fn(),
  },
}))

vi.mock('../src/modules/geocoding/geocoding-logs.repository', () => ({
  geocodingLogsRepository: {
    monthlyUsage: vi.fn(),
  },
}))

vi.mock('../src/modules/pin-type/pin-type.repository', () => ({
  pinTypeRepository: {
    findAll: vi.fn(),
    existsByName: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}))

vi.mock('../src/modules/dashboard/dashboard.repository', () => ({
  dashboardRepository: {
    getPartnerStats: vi.fn(),
    getImportStats: vi.fn(),
    getByState: vi.fn(),
    getByCity: vi.fn(),
    getByPinType: vi.fn(),
    getRecentImports: vi.fn(),
    getPartnersByMonth: vi.fn(),
  },
}))

vi.mock('../src/modules/map/map.repository', () => ({
  mapRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findPins: vi.fn(),
    findByEmbedToken: vi.fn(),
    findPublicPins: vi.fn(),
    findLocalities: vi.fn(),
    findPublicPinTypes: vi.fn(),
  },
}))

vi.mock('../src/modules/tenant/tenant.repository', () => ({
  tenantRepository: {
    findSettings: vi.fn(),
    findTenantStatus: vi.fn(),
    upsertSettings: vi.fn(),
  },
}))

vi.mock('../src/modules/partner/partner.repository', () => ({
  partnerRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    getColumns: vi.fn(),
  },
}))

vi.mock('../src/queues/geocoding.queue', () => ({
  geocodingQueue: { add: vi.fn() },
}))

vi.mock('../src/config/database', () => ({
  db: {
    select: vi.fn(),
  },
}))

vi.mock('../src/config/r2', () => ({
  r2: { send: vi.fn() },
}))

vi.mock('../src/queues/import.queue', () => ({
  importQueue: { add: vi.fn() },
}))

vi.mock('../src/modules/import/import.repository', () => ({
  importRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
  },
}))

vi.mock('../src/modules/user/user.repository', () => ({
  userRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findOwner: vi.fn(),
  },
}))

vi.mock('../src/modules/auth/auth.service', () => ({
  authService: { sendInvite: vi.fn() },
}))

vi.mock('../src/modules/billing/billing.repository', () => ({
  billingRepository: {
    findSubscriptionByTenantId: vi.fn(),
    findTenantById: vi.fn(),
    findTenantOwner: vi.fn(),
    updateSubscription: vi.fn(),
    findTenantByStripeCustomerId: vi.fn(),
    findExpiringTrials: vi.fn(),
  },
}))

vi.mock('../src/modules/notifications/notifications.repository', () => ({
  notificationsRepository: {
    getRecentImports: vi.fn(),
    getGeocodingFailures: vi.fn(),
    getTrialDaysLeft: vi.fn(),
    getOpenTickets: vi.fn(),
    getRecentStaffReplies: vi.fn(),
  },
}))

vi.mock('../src/modules/tickets/tickets.repository', () => ({
  ticketsRepository: {
    create: vi.fn(),
    findAll: vi.fn(),
    findAllGlobal: vi.fn(),
    findById: vi.fn(),
    getMessages: vi.fn(),
    addMessage: vi.fn(),
    updateStatus: vi.fn(),
  },
}))

vi.mock('../src/config/stripe', () => ({
  stripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}))

vi.mock('../src/shared/mailer', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/shared/mailer')>()
  return { ...actual, sendMail: vi.fn() }
})

import { adminRepository } from '../src/modules/admin/admin.repository'
import { adminService } from '../src/modules/admin/admin.service'
import { geocodingCreditsRepository } from '../src/modules/geocoding/geocoding-credits.repository'
import { geocodingLogsRepository } from '../src/modules/geocoding/geocoding-logs.repository'
import { billingRepository } from '../src/modules/billing/billing.repository'
import { billingService } from '../src/modules/billing/billing.service'
import { dashboardRepository } from '../src/modules/dashboard/dashboard.repository'
import { dashboardService } from '../src/modules/dashboard/dashboard.service'
import { exportService } from '../src/modules/export/export.service'
import { importRepository } from '../src/modules/import/import.repository'
import { importService } from '../src/modules/import/import.service'
import { mapRepository } from '../src/modules/map/map.repository'
import { mapService } from '../src/modules/map/map.service'
import { notificationsRepository } from '../src/modules/notifications/notifications.repository'
import { notificationsService } from '../src/modules/notifications/notifications.service'
import { partnerRepository } from '../src/modules/partner/partner.repository'
import { partnerService } from '../src/modules/partner/partner.service'
import { pinTypeRepository } from '../src/modules/pin-type/pin-type.repository'
import { pinTypeService } from '../src/modules/pin-type/pin-type.service'
import { tenantRepository } from '../src/modules/tenant/tenant.repository'
import { tenantService } from '../src/modules/tenant/tenant.service'
import { ticketsRepository } from '../src/modules/tickets/tickets.repository'
import { ticketsService } from '../src/modules/tickets/tickets.service'
import { userRepository } from '../src/modules/user/user.repository'
import { userService } from '../src/modules/user/user.service'
import { db } from '../src/config/database'
import { r2 } from '../src/config/r2'
import { stripe } from '../src/config/stripe'
import { geocodingQueue } from '../src/queues/geocoding.queue'
import { importQueue } from '../src/queues/import.queue'
import { sendMail } from '../src/shared/mailer'

const owner = { id: 'u1', role: 'owner', tenantId: 't1' }
const admin = { id: 'u1', role: 'admin', tenantId: 't1' }
const employee = { id: 'u1', role: 'employee', tenantId: 't1' }
const superAdmin = { role: 'super_admin' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('adminService', () => {
  it('requires super admin', async () => {
    await expect(adminService.listTenants({ role: 'owner' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('lists and fetches tenants', async () => {
    vi.mocked(adminRepository.listTenants).mockResolvedValue([{ id: 't1' }] as never)
    vi.mocked(adminRepository.findTenantById).mockResolvedValue({ id: 't1', active: true } as never)
    await expect(adminService.listTenants(superAdmin)).resolves.toEqual([{ id: 't1' }])
    await expect(adminService.getTenant('t1', superAdmin)).resolves.toMatchObject({ id: 't1' })
  })

  it('blocks and unblocks tenants with state checks', async () => {
    vi.mocked(adminRepository.findTenantById).mockResolvedValueOnce({ id: 't1', active: true } as never)
    await adminService.blockTenant('t1', superAdmin)
    expect(adminRepository.setTenantActive).toHaveBeenCalledWith('t1', false)

    vi.mocked(adminRepository.findTenantById).mockResolvedValueOnce({ id: 't1', active: false } as never)
    await adminService.unblockTenant('t1', superAdmin)
    expect(adminRepository.setTenantActive).toHaveBeenCalledWith('t1', true)
  })

  it('validates disable2fa target user', async () => {
    vi.mocked(adminRepository.listTenantUsers).mockResolvedValue([{ id: 'u2', totpEnabled: true }] as never)
    await adminService.disable2fa('u2', 't1', superAdmin)
    expect(adminRepository.disable2fa).toHaveBeenCalledWith('u2')

    vi.mocked(adminRepository.listTenantUsers).mockResolvedValue([{ id: 'u2', totpEnabled: false }] as never)
    await expect(adminService.disable2fa('u2', 't1', superAdmin)).rejects.toMatchObject({ code: '2FA_NOT_ENABLED' })
  })

  it('reports tenant geocoding usage with effective limit and credits', async () => {
    vi.mocked(adminRepository.findTenantById).mockResolvedValue({
      id: 't1', geocodingMonthlyLimit: 5000, geocodingLimitExpiresAt: null,
    } as never)
    vi.mocked(geocodingLogsRepository.monthlyUsage).mockResolvedValue(1200 as never)
    vi.mocked(geocodingCreditsRepository.availableBalance).mockResolvedValue(800 as never)

    await expect(adminService.getTenantGeocoding('t1', superAdmin)).resolves.toMatchObject({
      used: 1200,
      defaultLimit: 2000,
      monthlyLimit: 5000,
      effectiveLimit: 5000,
      creditsTotal: 800,
    })
  })

  it('sets and restores the geocoding limit, rejecting invalid input', async () => {
    vi.mocked(adminRepository.findTenantById).mockResolvedValue({ id: 't1' } as never)

    await adminService.setGeocodingLimit('t1', { limit: 10000, expiresAt: null }, superAdmin)
    expect(adminRepository.setGeocodingLimit).toHaveBeenCalledWith('t1', 10000, null)

    await adminService.setGeocodingLimit('t1', { limit: null, expiresAt: null }, superAdmin)
    expect(adminRepository.setGeocodingLimit).toHaveBeenCalledWith('t1', null, null)

    await expect(adminService.setGeocodingLimit('t1', { limit: -5, expiresAt: null }, superAdmin))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(adminService.setGeocodingLimit('t1', { limit: 100, expiresAt: '2000-01-01T00:00:00.000Z' }, superAdmin))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('requires super admin for geocoding limit', async () => {
    await expect(adminService.getTenantGeocoding('t1', { role: 'owner' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(adminService.setGeocodingLimit('t1', { limit: 1, expiresAt: null }, { role: 'owner' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects geocoding ops for a missing tenant', async () => {
    vi.mocked(adminRepository.findTenantById).mockResolvedValue(null as never)
    await expect(adminService.getTenantGeocoding('t1', superAdmin)).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' })
    await expect(adminService.setGeocodingLimit('t1', { limit: 1, expiresAt: null }, superAdmin))
      .rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' })
  })

  it('passes through the remaining super-admin reads', async () => {
    vi.mocked(adminRepository.listTenantImports).mockResolvedValue([{ id: 'j1' }] as never)
    await expect(adminService.listTenantImports('t1', superAdmin)).resolves.toEqual([{ id: 'j1' }])

    await adminService.rollbackImport('j1', 't1', superAdmin)
    expect(adminRepository.rollbackImport).toHaveBeenCalledWith('j1', 't1')

    vi.mocked(adminRepository.listTenantUsers).mockResolvedValue([{ id: 'u2' }] as never)
    await expect(adminService.listTenantUsers('t1', superAdmin)).resolves.toEqual([{ id: 'u2' }])

    vi.mocked(adminRepository.getMetrics).mockResolvedValue({ tenants: 1 } as never)
    await expect(adminService.getMetrics(superAdmin)).resolves.toEqual({ tenants: 1 })
  })
})

describe('pinTypeService', () => {
  it('creates, updates and deletes pin types', async () => {
    vi.mocked(pinTypeRepository.existsByName).mockResolvedValue(false as never)
    vi.mocked(pinTypeRepository.create).mockResolvedValue({ id: 'p1' } as never)
    await expect(pinTypeService.create({ name: 'VIP', color: '#ff0000' }, owner)).resolves.toEqual({ id: 'p1' })

    vi.mocked(pinTypeRepository.findById).mockResolvedValue({ id: 'p1' } as never)
    vi.mocked(pinTypeRepository.update).mockResolvedValue({ id: 'p1', name: 'Gold' } as never)
    await expect(pinTypeService.update('p1', { name: 'Gold' }, owner)).resolves.toMatchObject({ name: 'Gold' })

    await pinTypeService.delete('p1', owner)
    expect(pinTypeRepository.softDelete).toHaveBeenCalledWith('p1', 't1')
  })

  it('rejects forbidden and duplicate operations', async () => {
    await expect(pinTypeService.create({ name: 'VIP', color: '#ff0000' }, employee)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    vi.mocked(pinTypeRepository.existsByName).mockResolvedValue(true as never)
    await expect(pinTypeService.create({ name: 'VIP', color: '#ff0000' }, owner)).rejects.toMatchObject({ code: 'PIN_TYPE_NAME_TAKEN' })
  })
})

describe('dashboardService', () => {
  it('aggregates stats and normalizes nullable fields', async () => {
    vi.mocked(dashboardRepository.getPartnerStats).mockResolvedValue({
      total: 10,
      thisMonthCount: 2,
      lastMonthCount: 1,
      geocodedDone: 7,
      geocodedFailed: 1,
      publicCount: 8,
      internalCount: 2,
    } as never)
    vi.mocked(dashboardRepository.getImportStats).mockResolvedValue({ total: 3, thisMonthCount: 1, lastMonthCount: 1 } as never)
    vi.mocked(dashboardRepository.getByState).mockResolvedValue([{ state: 'SP', count: 2 }, { state: null, count: 1 }] as never)
    vi.mocked(dashboardRepository.getByCity).mockResolvedValue([{ city: 'Sao Paulo', state: 'SP', count: 2 }, { city: null, state: 'SP', count: 1 }] as never)
    vi.mocked(dashboardRepository.getByPinType).mockResolvedValue([{ id: 'p1', name: 'VIP', color: '#fff', count: 1 }] as never)
    vi.mocked(dashboardRepository.getRecentImports).mockResolvedValue([{ id: 'i1', fileName: null, status: 'done', mode: 'full', totalRows: null, created: null, updated: 1, removed: null, failed: null, createdAt: new Date('2026-01-01'), finishedAt: null, userName: null }] as never)
    vi.mocked(dashboardRepository.getPartnersByMonth).mockResolvedValue([{ month: '2026-01', count: 1 }] as never)

    const result = await dashboardService.getStats('t1')
    expect(result.partners.geocodedPct).toBe(70)
    expect(result.geo.byState).toEqual([{ state: 'SP', count: 2 }])
    expect(result.recentImports[0].userName).toBe('Sistema')
  })
})

describe('mapService', () => {
  it('creates public maps only when enabled', async () => {
    vi.mocked(tenantRepository.findSettings).mockResolvedValue({ publicMapEnabled: true } as never)
    vi.mocked(mapRepository.create).mockImplementation(async (_tenantId, data) => ({ id: 'm1', ...data }) as never)
    const map = await mapService.create({ name: 'Public', type: 'public' }, admin)
    expect(map).toMatchObject({ id: 'm1', type: 'public' })
    expect((map as { embedToken: string }).embedToken).toHaveLength(48)
  })

  it('rejects disabled public maps and missing maps', async () => {
    vi.mocked(tenantRepository.findSettings).mockResolvedValue({ publicMapEnabled: false } as never)
    await expect(mapService.create({ name: 'Public', type: 'public' }, admin)).rejects.toMatchObject({ code: 'PUBLIC_MAP_DISABLED' })
    vi.mocked(mapRepository.findById).mockResolvedValue(null as never)
    await expect(mapService.getById('missing', admin)).rejects.toMatchObject({ code: 'MAP_NOT_FOUND' })
  })

  it('returns embed snippets and public data', async () => {
    vi.mocked(mapRepository.findById).mockResolvedValue({ id: 'm1', embedToken: 'tok' } as never)
    await expect(mapService.getEmbedSnippet('m1', 'iframe', admin)).resolves.toMatchObject({ snippet: expect.stringContaining('/embed/public/tok') })
    await expect(mapService.getEmbedSnippet('m1', 'script', admin)).resolves.toMatchObject({ snippet: expect.stringContaining('MappaHubMap.init') })

    vi.mocked(mapRepository.findByEmbedToken).mockResolvedValue({ id: 'm1', tenantId: 't1' } as never)
    vi.mocked(tenantRepository.findSettings).mockResolvedValue({ publicMapEnabled: true, brandName: 'Brand' } as never)
    vi.mocked(tenantRepository.findTenantStatus).mockResolvedValue({ tenantActive: true, subscriptionActive: true } as never)
    vi.mocked(mapRepository.findPublicPins).mockResolvedValue([{ id: 'pin' }] as never)
    await expect(mapService.getPublicPins('tok')).resolves.toEqual([{ id: 'pin' }])
    await expect(mapService.getPublicConfig('tok')).resolves.toMatchObject({ brandName: 'Brand' })
  })

  it('updates, deletes, lists pins and rejects disabled public maps', async () => {
    vi.mocked(mapRepository.findAll).mockResolvedValue([{ id: 'm1' }] as never)
    await expect(mapService.list(admin)).resolves.toEqual([{ id: 'm1' }])

    vi.mocked(mapRepository.findById).mockResolvedValue({ id: 'm1' } as never)
    vi.mocked(mapRepository.update).mockResolvedValue({ id: 'm1', active: false } as never)
    await expect(mapService.update('m1', { active: false }, admin)).resolves.toMatchObject({ active: false })

    vi.mocked(mapRepository.findPins).mockResolvedValue([{ id: 'pin' }] as never)
    await expect(mapService.getPins('m1', {}, admin)).resolves.toEqual([{ id: 'pin' }])

    await mapService.generateEmbedToken('m1', admin)
    expect(mapRepository.update).toHaveBeenCalledWith('m1', 't1', { embedToken: expect.any(String) })

    await mapService.delete('m1', owner)
    expect(mapRepository.softDelete).toHaveBeenCalledWith('m1', 't1')

    vi.mocked(mapRepository.findByEmbedToken).mockResolvedValue({ id: 'm1', tenantId: 't1' } as never)
    vi.mocked(tenantRepository.findTenantStatus).mockResolvedValue({ tenantActive: false, subscriptionActive: true } as never)
    await expect(mapService.getPublicPinTypes('tok')).rejects.toMatchObject({ code: 'MAP_DISABLED' })
  })
})

describe('partnerService', () => {
  it('lists and creates partners with geocoding job', async () => {
    vi.mocked(partnerRepository.findAll).mockResolvedValue({ data: [{ id: 'p1' }], total: 1 } as never)
    await expect(partnerService.list(owner, { page: 1, limit: 10 })).resolves.toMatchObject({ totalPages: 1 })

    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ planType: 'annual' }] }) }),
    } as never)
    vi.mocked(partnerRepository.create).mockResolvedValue({ id: 'p1', address: 'Rua 1' } as never)
    await partnerService.create({ name: 'A', address: 'Rua 1', visibility: 'public' }, owner)
    expect(geocodingQueue.add).toHaveBeenCalledWith('geocode', { partnerId: 'p1', address: 'Rua 1', tenantId: 't1' }, { priority: 1 })
  })

  it('updates, deletes and rejects missing partners', async () => {
    vi.mocked(partnerRepository.findById).mockResolvedValue({ id: 'p1', address: 'Old' } as never)
    vi.mocked(partnerRepository.update).mockResolvedValue({ id: 'p1', address: 'New' } as never)
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ planType: 'monthly' }] }) }),
    } as never)
    await expect(partnerService.update('p1', { address: 'New' }, owner)).resolves.toMatchObject({ address: 'New' })
    expect(geocodingQueue.add).toHaveBeenCalledWith('geocode', { partnerId: 'p1', address: 'New', tenantId: 't1' }, { priority: 2 })

    await partnerService.delete('p1', owner)
    expect(partnerRepository.softDelete).toHaveBeenCalledWith('p1', 't1')

    vi.mocked(partnerRepository.findById).mockResolvedValue(null as never)
    await expect(partnerService.getById('missing', owner)).rejects.toMatchObject({ code: 'PARTNER_NOT_FOUND' })
  })
})

describe('importService', () => {
  it('creates import job and queues processing', async () => {
    vi.mocked(importRepository.create).mockResolvedValue({ id: 'job1' } as never)
    await expect(importService.upload('imports/test-uuid.csv', 'file.csv', 10, owner, 'incremental')).resolves.toEqual({ jobId: 'job1' })
    expect(importQueue.add).toHaveBeenCalledWith('process', {
      jobId: 'job1',
      tenantId: 't1',
      userId: 'u1',
      fileName: 'file.csv',
      r2Key: 'imports/test-uuid.csv',
      mode: 'incremental',
    })
  })

  it('rejects employees without import permission and missing jobs', async () => {
    await expect(importService.upload('imports/test-uuid.csv', 'file.csv', 10, { ...employee, role: 'viewer' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    vi.mocked(importRepository.findById).mockResolvedValue(null as never)
    await expect(importService.getJob('missing', owner)).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' })
  })
})

describe('userService', () => {
  const rawUser = {
    id: 'u2',
    tenantId: 't1',
    name: 'User',
    email: 'u@example.com',
    role: 'employee',
    passwordHash: 'hash',
    totpSecret: 'secret',
    emailVerifyToken: 'token',
    emailVerifyExpiresAt: null,
    resetPasswordToken: null,
    resetPasswordExpiresAt: null,
  }

  it('sanitizes fetched, invited and updated users', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(rawUser as never)
    const fetched = await userService.getUserById('u2', 't1')
    expect(fetched).not.toHaveProperty('passwordHash')
    expect(fetched).not.toHaveProperty('totpSecret')

    vi.mocked(userRepository.findAll).mockResolvedValue([] as never)
    vi.mocked(userRepository.create).mockResolvedValue(rawUser as never)
    const invited = await userService.inviteUser({ email: 'u@example.com', name: 'User', role: 'employee' }, { ...owner, name: 'Owner' })
    expect(invited).not.toHaveProperty('passwordHash')

    vi.mocked(userRepository.update).mockResolvedValue({ ...rawUser, name: 'New' } as never)
    const updated = await userService.updateUser('u2', { name: 'New' }, owner)
    expect(updated).toMatchObject({ name: 'New' })
    expect(updated).not.toHaveProperty('passwordHash')
  })

  it('enforces update/delete rules', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({ ...rawUser, role: 'owner' } as never)
    await expect(userService.updateUser('u2', { role: 'admin' }, owner)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(userService.deleteUser('u1', owner)).rejects.toMatchObject({ code: 'CANNOT_DELETE_SELF' })
    await expect(userService.deleteUser('u2', owner)).rejects.toMatchObject({ code: 'CANNOT_DELETE_OWNER' })
  })
})

describe('billingService', () => {
  it('returns subscription and creates checkout session', async () => {
    vi.mocked(billingRepository.findSubscriptionByTenantId).mockResolvedValueOnce({ status: 'active' } as never)
    await expect(billingService.getSubscription('t1')).resolves.toMatchObject({ status: 'active' })

    vi.stubEnv('STRIPE_PRICE_MONTHLY', 'price_monthly')
    vi.mocked(billingRepository.findSubscriptionByTenantId).mockResolvedValueOnce({ stripeCustomerId: null } as never)
    vi.mocked(billingRepository.findTenantById).mockResolvedValue({ name: 'Tenant' } as never)
    vi.mocked(billingRepository.findTenantOwner).mockResolvedValue({ email: 'owner@example.com' } as never)
    vi.mocked(stripe.customers.create).mockResolvedValue({ id: 'cus_1' } as never)
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://stripe.test/session' } as never)
    await expect(billingService.createCheckoutSession('t1', { plan: 'monthly' })).resolves.toEqual({ url: 'https://stripe.test/session' })
  })

  it('handles webhook subscription updates', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1' } },
    } as never)
    vi.mocked(billingRepository.findTenantByStripeCustomerId).mockResolvedValue({ tenantId: 't1' } as never)
    await billingService.handleWebhookEvent(Buffer.from('{}'), 'sig')
    expect(billingRepository.updateSubscription).toHaveBeenCalledWith('t1', { status: 'past_due' })
  })

  it('creates portal sessions and handles checkout/subscription webhook events', async () => {
    vi.mocked(billingRepository.findSubscriptionByTenantId).mockResolvedValue({ stripeCustomerId: 'cus_1' } as never)
    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({ url: 'https://stripe.test/portal' } as never)
    await expect(billingService.createPortalSession('t1')).resolves.toEqual({ url: 'https://stripe.test/portal' })

    vi.stubEnv('STRIPE_PRICE_ANNUAL', 'price_annual_test')
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: { metadata: { tenantId: 't1' }, subscription: 'sub_1' } },
    } as never)
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      items: { data: [{ price: { id: 'price_annual_test' } }] },
      current_period_start: 100,
      current_period_end: 200,
    } as never)
    await billingService.handleWebhookEvent(Buffer.from('{}'), 'sig')
    expect(billingRepository.updateSubscription).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'active' }))

    vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce({
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_1' } },
    } as never)
    vi.mocked(billingRepository.findTenantByStripeCustomerId).mockResolvedValue({ tenantId: 't1' } as never)
    await billingService.handleWebhookEvent(Buffer.from('{}'), 'sig')
    expect(billingRepository.updateSubscription).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'canceled' }))
  })

  it('rejects missing billing setup', async () => {
    vi.mocked(billingRepository.findSubscriptionByTenantId).mockResolvedValue(null as never)
    await expect(billingService.getSubscription('t1')).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_FOUND' })
    await expect(billingService.createPortalSession('t1')).rejects.toMatchObject({ code: 'NO_STRIPE_CUSTOMER' })
  })

  it('lists credit packs catalog', () => {
    const packs = billingService.listCreditPacks()
    expect(packs.map(p => p.id)).toEqual(['1k', '5k', '10k', '25k'])
    expect(packs[1]).toMatchObject({ credits: 5000, validityDays: 90 })
  })

  it('creates a one-time checkout session for a credit pack', async () => {
    vi.mocked(billingRepository.findSubscriptionByTenantId).mockResolvedValue({ stripeCustomerId: 'cus_1' } as never)
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://stripe.test/credits' } as never)

    await expect(billingService.createCreditsCheckoutSession('t1', { packId: '5k' })).resolves.toEqual({ url: 'https://stripe.test/credits' })
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment',
      line_items: [{ price: 'price_geo_5k', quantity: 1 }],
      metadata: { tenantId: 't1', packId: '5k' },
    }))
  })

  it('grants a credit pack lot from the payment webhook (idempotent by session)', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', mode: 'payment', amount_total: 11900, metadata: { tenantId: 't1', packId: '5k' } } },
    } as never)

    await billingService.handleWebhookEvent(Buffer.from('{}'), 'sig')

    expect(geocodingCreditsRepository.grantPack).toHaveBeenCalledWith('t1', expect.objectContaining({
      quantity: 5000,
      stripeSessionId: 'cs_1',
      amountCents: 11900,
      expiresAt: expect.any(Date),
    }))
    // não deve tratar como assinatura
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled()
  })

  it('rejects an unknown credit pack', async () => {
    await expect(billingService.createCreditsCheckoutSession('t1', { packId: 'bad' } as never))
      .rejects.toMatchObject({ code: 'PACK_NOT_CONFIGURED' })
  })

  it('handles subscription.updated webhook and trial-expiry reminders', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: {
        customer: 'cus_1', status: 'active',
        items: { data: [{ price: { id: 'price_monthly' } }] },
        current_period_start: 100, current_period_end: 200,
      } },
    } as never)
    vi.mocked(billingRepository.findTenantByStripeCustomerId).mockResolvedValue({ tenantId: 't1' } as never)
    await billingService.handleWebhookEvent(Buffer.from('{}'), 'sig')
    expect(billingRepository.updateSubscription).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'active' }))

    vi.mocked(billingRepository.findExpiringTrials).mockResolvedValue([{ ownerEmail: 'o@e.com', tenantName: 'Acme' }] as never)
    await expect(billingService.checkExpiringTrials(3)).resolves.toBe(1)
  })
})

describe('exportService', () => {
  it('generates formula-safe csv exports', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            where: async () => [{ id: 'p1', name: '=cmd', address: 'Rua', city: null, state: 'SP', visibility: 'public', pinTypeName: 'VIP' }],
          }),
        }),
      } as never)
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [{ partnerId: 'p1', key: 'danger', value: '+SUM(1,1)' }],
          }),
        }),
      } as never)

    const result = await exportService.generate({ columns: ['name', 'danger'], format: 'csv' }, owner)
    expect(result.contentType).toBe('text/csv')
    expect(result.buffer.toString('utf8')).toContain("'=cmd")
    expect(result.buffer.toString('utf8')).toContain("'+SUM(1,1)")
  })

  it('lists available fixed and dynamic columns', async () => {
    const query = { findMany: vi.fn().mockResolvedValue([{ key: 'custom', label: 'Custom' }]) }
    // getAvailableColumns calls db.query.partnerColumns.findMany — mutate the already-imported db mock
    vi.mocked(db as unknown as { query: { partnerColumns: { findMany: typeof query.findMany } } }).query = { partnerColumns: query }
    await expect(exportService.getAvailableColumns(owner)).resolves.toMatchObject({
      columns: expect.arrayContaining([{ key: 'custom', label: 'Custom', type: 'dynamic' }]),
    })
  })
})

describe('tenantService', () => {
  it('gets and updates settings with permission checks', async () => {
    vi.mocked(tenantRepository.findSettings).mockResolvedValue({ brandName: 'Brand' } as never)
    await expect(tenantService.getSettings(owner)).resolves.toMatchObject({ brandName: 'Brand' })

    vi.mocked(tenantRepository.upsertSettings).mockResolvedValue({ brandName: 'New' } as never)
    await expect(tenantService.updateSettings({ brandName: 'New' }, owner)).resolves.toMatchObject({ brandName: 'New' })
    await expect(tenantService.updateSettings({ brandName: 'Nope' }, employee)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('uploads allowed logos and rejects invalid mimetypes', async () => {
    const invalidReq = { file: vi.fn().mockResolvedValue({ mimetype: 'image/svg+xml' }) }
    await expect(tenantService.uploadLogo(invalidReq as never, owner)).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' })

    async function* chunks() {
      yield Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
    }
    const req = {
      file: vi.fn().mockResolvedValue({ mimetype: 'image/png', file: chunks() }),
    }
    if (!r2) throw new Error('Expected mocked R2 client')
    vi.mocked(r2.send).mockResolvedValue({} as never)
    await expect(tenantService.uploadLogo(req as never, owner)).resolves.toBe('https://r2.example.test/logos/t1.png')
  })
})

describe('notificationsService', () => {
  it('builds tenant notifications and sorts newest first', async () => {
    vi.mocked(notificationsRepository.getRecentImports).mockResolvedValue([
      { id: 'i1', status: 'done', fileName: 'a.csv', created: 1, updated: 0, removed: 0, createdAt: new Date('2026-01-01'), finishedAt: new Date('2026-01-03') },
      { id: 'i2', status: 'failed', fileName: null, createdAt: new Date('2026-01-02'), finishedAt: null },
    ] as never)
    vi.mocked(notificationsRepository.getGeocodingFailures).mockResolvedValue([
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
      { id: 'p3', name: 'C' },
      { id: 'p4', name: 'D' },
    ] as never)
    vi.mocked(notificationsRepository.getTrialDaysLeft).mockResolvedValue(2 as never)
    vi.mocked(notificationsRepository.getRecentStaffReplies).mockResolvedValue([{ id: 'r1', ticketId: 't1', ticketTitle: 'Help', createdAt: new Date('2026-01-04') }] as never)

    const result = await notificationsService.list('t1', 'owner')
    expect(result.map(i => i.type)).toEqual(expect.arrayContaining(['import_done', 'import_failed', 'geocoding_failures', 'trial_expiring', 'ticket_reply']))
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'ticket_reply', createdAt: '2026-01-04T00:00:00.000Z' }),
    ]))
  })

  it('builds super admin ticket notifications only', async () => {
    vi.mocked(notificationsRepository.getOpenTickets).mockResolvedValue([{ id: 't1', title: 'Need help', createdAt: new Date('2026-01-01') }] as never)
    await expect(notificationsService.list('ignored', 'super_admin')).resolves.toMatchObject([
      { type: 'new_ticket', desc: 'Need help' },
    ])
    expect(notificationsRepository.getRecentImports).not.toHaveBeenCalled()
  })
})

describe('ticketsService', () => {
  it('creates, lists and gets ticket details', async () => {
    vi.mocked(ticketsRepository.create).mockResolvedValue({ id: 't1' } as never)
    await expect(ticketsService.create('Title', 'Body', owner)).resolves.toEqual({ id: 't1' })

    vi.mocked(ticketsRepository.findAll).mockResolvedValue([{ id: 't1' }] as never)
    await expect(ticketsService.list(owner)).resolves.toEqual([{ id: 't1' }])

    vi.mocked(ticketsRepository.findById).mockResolvedValue({ id: 't1', tenantId: 't1' } as never)
    vi.mocked(ticketsRepository.getMessages).mockResolvedValue([{ id: 'm1' }] as never)
    await expect(ticketsService.getDetail('t1', owner)).resolves.toMatchObject({ messages: [{ id: 'm1' }] })
  })

  it('enforces ticket permissions and sends staff reply emails', async () => {
    await expect(ticketsService.listAll(owner)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    vi.mocked(ticketsRepository.findAllGlobal).mockResolvedValue([{ id: 't1' }] as never)
    await expect(ticketsService.listAll({ ...owner, role: 'super_admin' })).resolves.toEqual([{ id: 't1' }])

    vi.mocked(ticketsRepository.findById).mockResolvedValue({ id: 't1', tenantId: 't1', userId: 'u2', title: 'Help', status: 'open' } as never)
    vi.mocked(ticketsRepository.addMessage).mockResolvedValue({ id: 'm1' } as never)
    vi.mocked(userRepository.findById).mockResolvedValue({ id: 'u2', name: 'User', email: 'u@example.com' } as never)
    vi.mocked(userRepository.findOwner).mockResolvedValue({ id: 'u1', name: 'Owner', email: 'o@example.com' } as never)
    await expect(ticketsService.reply('t1', 'answer', { ...owner, role: 'super_admin' })).resolves.toEqual({ id: 'm1' })
    expect(ticketsRepository.updateStatus).toHaveBeenCalledWith('t1', 'in_progress')
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it('updates status and rejects missing tickets', async () => {
    vi.mocked(ticketsRepository.findById).mockResolvedValueOnce(null as never)
    await expect(ticketsService.updateStatus('missing', 'resolved', { ...owner, role: 'super_admin' })).rejects.toMatchObject({ code: 'TICKET_NOT_FOUND' })

    vi.mocked(ticketsRepository.findById).mockResolvedValueOnce({ id: 't1', tenantId: 't1', userId: 'u2', title: 'Help' } as never)
    vi.mocked(ticketsRepository.updateStatus).mockResolvedValue({ id: 't1', status: 'resolved' } as never)
    vi.mocked(userRepository.findById).mockResolvedValue({ id: 'u2', name: 'User', email: 'u@example.com' } as never)
    vi.mocked(userRepository.findOwner).mockResolvedValue(null as never)
    await expect(ticketsService.updateStatus('t1', 'resolved', { ...owner, role: 'super_admin' })).resolves.toMatchObject({ status: 'resolved' })
  })
})
