import { describe, expect, it } from 'vitest'
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  totpLoginSchema,
} from '../src/modules/auth/auth.schema'
import { checkoutCreditsSchema, createCheckoutSchema } from '../src/modules/billing/billing.schema'
import { exportSchema } from '../src/modules/export/export.schema'
import {
  createMapSchema,
  embedSnippetQuerySchema,
  mapPinsQuerySchema,
  updateMapSchema,
} from '../src/modules/map/map.schema'
import {
  createPartnerSchema,
  listPartnersSchema,
  updatePartnerSchema,
} from '../src/modules/partner/partner.schema'
import { createPinTypeSchema, updatePinTypeSchema } from '../src/modules/pin-type/pin-type.schema'
import { updateSettingsSchema } from '../src/modules/tenant/tenant.schema'
import { inviteUserSchema, updateUserSchema } from '../src/modules/user/user.schema'

describe('auth schemas', () => {
  it('accepts valid auth payloads', () => {
    expect(registerSchema.parse({
      tenantName: 'Mappa',
      name: 'Charles',
      email: 'charles@example.com',
      password: 'very-secure-password',
    }).email).toBe('charles@example.com')
    expect(loginSchema.parse({ email: 'a@b.com', password: 'x' }).password).toBe('x')
    expect(forgotPasswordSchema.parse({ email: 'a@b.com' }).email).toBe('a@b.com')
    expect(resetPasswordSchema.parse({ token: 'token', password: 'very-secure-password' }).token).toBe('token')
    expect(acceptInviteSchema.parse({ token: 'token', name: 'User', password: 'very-secure-password' }).name).toBe('User')
    expect(totpLoginSchema.parse({ tempToken: 'tmp', code: '123456' }).code).toBe('123456')
  })

  it('rejects weak passwords and malformed totp', () => {
    expect(registerSchema.safeParse({ tenantName: 'M', name: 'U', email: 'bad', password: 'short' }).success).toBe(false)
    expect(resetPasswordSchema.safeParse({ token: 'token', password: 'short' }).success).toBe(false)
    expect(totpLoginSchema.safeParse({ tempToken: 'tmp', code: '12345' }).success).toBe(false)
  })
})

describe('domain schemas', () => {
  it('parses partner list defaults and limits', () => {
    expect(listPartnersSchema.parse({}).page).toBe(1)
    expect(listPartnersSchema.parse({ limit: '200' }).limit).toBe(200)
    expect(listPartnersSchema.safeParse({ limit: '201' }).success).toBe(false)
  })

  it('validates create/update partner payloads', () => {
    expect(createPartnerSchema.parse({ name: 'A', address: 'Rua 1' }).visibility).toBe('public')
    expect(updatePartnerSchema.parse({ pinTypeId: null }).pinTypeId).toBeNull()
    expect(createPartnerSchema.safeParse({ name: '', address: '' }).success).toBe(false)
  })

  it('validates map payloads and query defaults', () => {
    expect(createMapSchema.parse({ name: 'Mapa', type: 'public' }).type).toBe('public')
    expect(updateMapSchema.parse({ active: false }).active).toBe(false)
    expect(embedSnippetQuerySchema.parse({}).type).toBe('iframe')
    expect(mapPinsQuerySchema.safeParse({ pinTypeId: 'not-uuid' }).success).toBe(false)
  })

  it('validates tenant, user, pin type, billing and export payloads', () => {
    expect(updateSettingsSchema.parse({ brandColor: '#AABBcc' }).brandColor).toBe('#AABBcc')
    expect(updateSettingsSchema.safeParse({ brandColor: 'blue' }).success).toBe(false)
    expect(inviteUserSchema.parse({ email: 'a@b.com', name: 'Alice', role: 'admin' }).role).toBe('admin')
    expect(updateUserSchema.safeParse({ role: 'owner' }).success).toBe(false)
    expect(createPinTypeSchema.parse({ name: 'VIP', color: '#ff0000' }).name).toBe('VIP')
    expect(updatePinTypeSchema.parse({ color: '#00ff00' }).color).toBe('#00ff00')
    expect(createCheckoutSchema.parse({ plan: 'annual' }).plan).toBe('annual')
    expect(checkoutCreditsSchema.parse({ packId: '5k' }).packId).toBe('5k')
    expect(checkoutCreditsSchema.safeParse({ packId: '3k' }).success).toBe(false)
    expect(exportSchema.parse({ columns: ['name'] }).format).toBe('xlsx')
  })
})
