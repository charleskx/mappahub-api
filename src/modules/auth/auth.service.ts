import argon2 from 'argon2'
import dayjs from 'dayjs'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { and, isNull } from 'drizzle-orm'
import { OAuth2Client } from 'google-auth-library'
import speakeasy from 'speakeasy'
import QRCode from 'qrcode'
import { db } from '../../config/database'
import { env } from '../../config/env'
import { redis } from '../../config/redis'
import { refreshTokens, subscriptions, tenantSettings, tenants, totpRecoveryCodes, users } from '../../db/schema'
import { AppError } from '../../shared/errors'
import { inviteEmailHtml, resetPasswordHtml, sendMail, verifyEmailHtml } from '../../shared/mailer'
import { hashToken } from '../../shared/token-hash'
import { encryptSecret, decryptSecret } from '../../shared/crypto'
import { generateToken, slugify } from '../../shared/utils'
import { authRepository } from './auth.repository'
import type {
  AcceptInviteInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.schema'

// ── TOTP helpers ─────────────────────────────────────────────────────────────

function encryptTotpSecret(plain: string): string {
  if (!env.TOTP_ENCRYPTION_KEY) return plain
  return encryptSecret(plain, env.TOTP_ENCRYPTION_KEY)
}

function decryptTotpSecret(stored: string): string {
  if (!env.TOTP_ENCRYPTION_KEY) return stored
  return decryptSecret(stored, env.TOTP_ENCRYPTION_KEY)
}

// ── 2FA temp token helpers (Redis com TTL de 5 min) ─────────────────────────

const TEMP_TTL = 300       // 5 minutos
const TEMP_MAX_ATTEMPTS = 5

async function storeTempToken(tempToken: string, userId: string): Promise<void> {
  await redis.setex(`2fa:temp:${tempToken}`, TEMP_TTL, userId)
}

async function consumeTempToken(tempToken: string): Promise<string> {
  const userId = await redis.get(`2fa:temp:${tempToken}`)
  if (!userId) throw new AppError('INVALID_TOKEN', 401, 'Token temporário inválido ou expirado')
  return userId
}

async function deleteTempToken(tempToken: string): Promise<void> {
  await redis.del(`2fa:temp:${tempToken}`)
  await redis.del(`2fa:attempts:${tempToken}`)
}

async function incrementAndCheckAttempts(tempToken: string): Promise<void> {
  const key = `2fa:attempts:${tempToken}`
  const attempts = await redis.incr(key)
  if (attempts === 1) await redis.expire(key, TEMP_TTL)
  if (attempts > TEMP_MAX_ATTEMPTS) {
    await redis.del(`2fa:temp:${tempToken}`)
    throw new AppError('TOO_MANY_2FA_ATTEMPTS', 429, 'Muitas tentativas. Faça login novamente.')
  }
}

// ── Utilitários de refresh token ─────────────────────────────────────────────

function makeRefreshToken() {
  const value = generateToken(64)
  const hash = hashToken(value, env.JWT_SECRET)
  return { value, hash }
}

export const authService = {
  async register({ tenantName, name, email, password }: RegisterInput) {
    const existing = await authRepository.findUserByEmail(email)
    if (existing) throw new AppError('EMAIL_TAKEN', 409, 'E-mail já cadastrado')

    let slug = slugify(tenantName)
    const slugTaken = await authRepository.findTenantBySlug(slug)
    if (slugTaken) slug = `${slug}-${generateToken(4)}`

    const passwordHash = await argon2.hash(password)
    const emailVerifyTokenValue = generateToken()
    const emailVerifyTokenHash = hashToken(emailVerifyTokenValue, env.JWT_SECRET)
    const rt = makeRefreshToken()
    const familyId = randomUUID()

    const { user, tenant } = await db.transaction(async tx => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: tenantName, slug, email, updatedAt: new Date() })
        .returning()

      const [user] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          name,
          email,
          passwordHash,
          role: 'owner',
          emailVerifyToken: emailVerifyTokenHash,
          emailVerifyExpiresAt: dayjs().add(24, 'hour').toDate(),
          updatedAt: new Date(),
        })
        .returning()

      await tx.insert(subscriptions).values({
        tenantId: tenant.id,
        status: 'trialing',
        trialEndsAt: dayjs().add(14, 'day').toDate(),
        updatedAt: new Date(),
      })

      await tx.insert(tenantSettings).values({
        tenantId: tenant.id,
        updatedAt: new Date(),
      })

      await tx.insert(refreshTokens).values({
        userId: user.id,
        tenantId: tenant.id,
        token: rt.hash,
        familyId,
        expiresAt: dayjs().add(30, 'day').toDate(),
      })

      return { user, tenant }
    })

    sendMail({
      to: email,
      subject: 'Verifique seu e-mail — MappaHub',
      html: verifyEmailHtml(emailVerifyTokenValue, env.APP_URL),
    }).catch(err => console.error('[mailer]', err))

    return { user, tenant, refreshToken: rt.value }
  },

  async loginWithGoogle(credential: string) {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new AppError('GOOGLE_AUTH_DISABLED', 503, 'Login com Google não está configurado')
    }

    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID)
    let payload: { sub: string; email?: string; name?: string } | undefined

    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID })
      payload = ticket.getPayload() as typeof payload
    } catch {
      throw new AppError('INVALID_GOOGLE_TOKEN', 401, 'Token do Google inválido ou expirado')
    }

    if (!payload?.email || !payload?.sub) {
      throw new AppError('INVALID_GOOGLE_TOKEN', 401, 'Token do Google inválido')
    }

    const { sub: googleId, email, name = email.split('@')[0] } = payload

    let user = await authRepository.findUserByGoogleId(googleId)

    if (!user) {
      const existing = await authRepository.findUserByEmail(email)
      if (existing) {
        await authRepository.updateUser(existing.id, { googleId, emailVerified: true, updatedAt: new Date() })
        user = await authRepository.findUserById(existing.id)
      }
    }

    if (!user) {
      let slug = slugify(name)
      const slugTaken = await authRepository.findTenantBySlug(slug)
      if (slugTaken) slug = `${slug}-${generateToken(4)}`

      const result = await db.transaction(async tx => {
        const [tenant] = await tx
          .insert(tenants)
          .values({ name, slug, email, updatedAt: new Date() })
          .returning()

        const [newUser] = await tx
          .insert(users)
          .values({
            tenantId: tenant.id,
            name,
            email,
            googleId,
            role: 'owner',
            emailVerified: true,
            updatedAt: new Date(),
          })
          .returning()

        await tx.insert(subscriptions).values({
          tenantId: tenant.id,
          status: 'trialing',
          trialEndsAt: dayjs().add(14, 'day').toDate(),
          updatedAt: new Date(),
        })

        await tx.insert(tenantSettings).values({ tenantId: tenant.id, updatedAt: new Date() })

        return { user: newUser, tenant }
      })

      user = result.user
    }

    const rt = makeRefreshToken()
    await authRepository.createRefreshToken({
      userId: user!.id,
      tenantId: user!.tenantId,
      token: rt.hash,
      familyId: randomUUID(),
      expiresAt: dayjs().add(30, 'day').toDate(),
    })

    return { user: user!, refreshToken: rt.value }
  },

  async login({ email, password }: LoginInput) {
    const user = await authRepository.findUserByEmail(email)
    if (!user) throw new AppError('INVALID_CREDENTIALS', 401, 'Credenciais inválidas')

    if (!user.passwordHash) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Esta conta usa login com Google. Use o botão "Entrar com Google".')
    }

    const valid = await argon2.verify(user.passwordHash, password)
    if (!valid) throw new AppError('INVALID_CREDENTIALS', 401, 'Credenciais inválidas')

    if (!user.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Confirme seu e-mail antes de entrar')

    if (user.totpEnabled && user.totpSecret) {
      const tempToken = generateToken(32)
      await storeTempToken(tempToken, user.id)
      return { requiresTwoFactor: true, tempToken }
    }

    const rt = makeRefreshToken()
    await authRepository.createRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      token: rt.hash,
      familyId: randomUUID(),
      expiresAt: dayjs().add(30, 'day').toDate(),
    })

    return { requiresTwoFactor: false, user, refreshToken: rt.value }
  },

  async loginWithTotp(tempToken: string, code: string) {
    await incrementAndCheckAttempts(tempToken)
    const userId = await consumeTempToken(tempToken)

    const user = await authRepository.findUserById(userId)
    if (!user || !user.totpSecret)
      throw new AppError('INVALID_TOKEN', 401, 'Token temporário inválido')

    const secret = decryptTotpSecret(user.totpSecret)

    // Re-encrypt on first use if stored in plain text (migration path)
    if (env.TOTP_ENCRYPTION_KEY && !user.totpSecret.startsWith('enc:v1:')) {
      await authRepository.updateUser(user.id, { totpSecret: encryptTotpSecret(secret), updatedAt: new Date() })
    }

    const result = speakeasy.totp.verify({ token: code, secret, encoding: 'base32' })
    if (!result) throw new AppError('INVALID_TOTP', 401, 'Código 2FA inválido')

    await deleteTempToken(tempToken)

    const rt = makeRefreshToken()
    await authRepository.createRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      token: rt.hash,
      familyId: randomUUID(),
      expiresAt: dayjs().add(30, 'day').toDate(),
    })

    return { user, refreshToken: rt.value }
  },

  async setupTotp(userId: string) {
    const user = await authRepository.findUserById(userId)
    if (!user) throw new AppError('USER_NOT_FOUND', 404, 'Usuário não encontrado')
    if (user.totpEnabled) throw new AppError('TOTP_ALREADY_ENABLED', 409, '2FA já está ativado')

    const { base32: secret } = speakeasy.generateSecret({ length: 20 })
    const otpauth = speakeasy.otpauthURL({ secret, label: user.email, issuer: 'MappaHub', encoding: 'base32' })
    const qrCode = await QRCode.toDataURL(otpauth)

    await authRepository.updateUser(userId, { totpSecret: encryptTotpSecret(secret), updatedAt: new Date() })

    return { secret, qrCode }
  },

  async verifyAndEnableTotp(userId: string, code: string) {
    const user = await authRepository.findUserById(userId)
    if (!user || !user.totpSecret) {
      throw new AppError('TOTP_NOT_SETUP', 400, 'Configure o 2FA primeiro')
    }
    if (user.totpEnabled) throw new AppError('TOTP_ALREADY_ENABLED', 409, '2FA já está ativado')

    const secret = decryptTotpSecret(user.totpSecret)
    const result = speakeasy.totp.verify({ token: code, secret, encoding: 'base32' })
    if (!result) throw new AppError('INVALID_TOTP', 401, 'Código 2FA inválido')

    const plainCodes = Array.from({ length: 8 }, () => {
      const a = generateToken(4).toUpperCase()
      const b = generateToken(4).toUpperCase()
      return `${a}-${b}`
    })

    await db.transaction(async tx => {
      await tx.update(users).set({ totpEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId))
      await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId))
      const hashed = await Promise.all(plainCodes.map(c => argon2.hash(c)))
      await tx.insert(totpRecoveryCodes).values(hashed.map(codeHash => ({ userId, codeHash })))
    })

    return { recoveryCodes: plainCodes }
  },

  async disableTotp(userId: string, code: string) {
    const user = await authRepository.findUserById(userId)
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new AppError('TOTP_NOT_ENABLED', 400, '2FA não está ativado')
    }

    const secret = decryptTotpSecret(user.totpSecret)
    const result = speakeasy.totp.verify({ token: code, secret, encoding: 'base32' })
    if (!result) throw new AppError('INVALID_TOTP', 401, 'Código 2FA inválido')

    await db.transaction(async tx => {
      await tx.update(users).set({ totpSecret: null, totpEnabled: false, updatedAt: new Date() }).where(eq(users.id, userId))
      await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId))
    })
  },

  async loginWithRecoveryCode(tempToken: string, code: string) {
    await incrementAndCheckAttempts(tempToken)
    const userId = await consumeTempToken(tempToken)

    const user = await authRepository.findUserById(userId)
    if (!user) throw new AppError('INVALID_TOKEN', 401, 'Token temporário inválido')

    const stored = await db
      .select()
      .from(totpRecoveryCodes)
      .where(eq(totpRecoveryCodes.userId, user.id))

    const unused = stored.filter(r => !r.usedAt)
    if (!unused.length) throw new AppError('NO_RECOVERY_CODES', 400, 'Sem códigos de recuperação disponíveis')

    let matched: typeof unused[0] | null = null
    for (const row of unused) {
      const valid = await argon2.verify(row.codeHash, code.toUpperCase().replace(/\s/g, ''))
      if (valid) { matched = row; break }
    }

    if (!matched) throw new AppError('INVALID_RECOVERY_CODE', 401, 'Código de recuperação inválido')

    await db.update(totpRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(eq(totpRecoveryCodes.id, matched.id))

    await deleteTempToken(tempToken)

    const rt = makeRefreshToken()
    await authRepository.createRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      token: rt.hash,
      familyId: randomUUID(),
      expiresAt: dayjs().add(30, 'day').toDate(),
    })

    return { user, refreshToken: rt.value }
  },

  async refresh(token: string) {
    const tokenHash = hashToken(token, env.JWT_SECRET)
    const rt = await authRepository.findRefreshToken(tokenHash)

    if (!rt) throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh token inválido ou expirado')

    // Reuse detection: token revogado foi apresentado → família inteira comprometida
    if (rt.revokedAt) {
      await authRepository.revokeRefreshTokenFamily(rt.familyId)
      throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Token comprometido. Faça login novamente.')
    }

    if (dayjs().isAfter(dayjs(rt.expiresAt))) {
      throw new AppError('INVALID_REFRESH_TOKEN', 401, 'Refresh token expirado')
    }

    const user = await authRepository.findUserById(rt.userId)
    if (!user) throw new AppError('USER_NOT_FOUND', 404, 'Usuário não encontrado')

    const newRt = makeRefreshToken()

    await db.transaction(async tx => {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, rt.id))

      await tx.insert(refreshTokens).values({
        userId: user.id,
        tenantId: user.tenantId,
        token: newRt.hash,
        familyId: rt.familyId,   // preserva a família na rotação
        expiresAt: dayjs().add(30, 'day').toDate(),
      })
    })

    return { user, refreshToken: newRt.value }
  },

  async logout(token: string) {
    const tokenHash = hashToken(token, env.JWT_SECRET)
    const rt = await authRepository.findRefreshToken(tokenHash)
    if (rt && !rt.revokedAt) {
      await authRepository.revokeRefreshToken(rt.id)
    }
  },

  async verifyEmail(token: string) {
    const tokenHash = hashToken(token, env.JWT_SECRET)
    const user = await authRepository.findUserByVerifyToken(tokenHash)
    if (!user) throw new AppError('INVALID_TOKEN', 400, 'Token inválido')

    if (user.emailVerifyExpiresAt && dayjs().isAfter(dayjs(user.emailVerifyExpiresAt))) {
      throw new AppError('TOKEN_EXPIRED', 400, 'Token expirado')
    }

    await authRepository.updateUser(user.id, {
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
      updatedAt: new Date(),
    })
  },

  async resendVerification(email: string) {
    const user = await authRepository.findUserByEmail(email)
    if (!user || user.emailVerified) return

    const newTokenValue = generateToken()
    const newTokenHash = hashToken(newTokenValue, env.JWT_SECRET)

    await authRepository.updateUser(user.id, {
      emailVerifyToken: newTokenHash,
      emailVerifyExpiresAt: dayjs().add(24, 'hour').toDate(),
      updatedAt: new Date(),
    })

    sendMail({
      to: email,
      subject: 'Verifique seu e-mail — MappaHub',
      html: verifyEmailHtml(newTokenValue, env.APP_URL),
    }).catch(err => console.error('[mailer]', err))
  },

  async forgotPassword(email: string) {
    const user = await authRepository.findUserByEmail(email)
    if (!user) return

    const resetTokenValue = generateToken()
    const resetTokenHash = hashToken(resetTokenValue, env.JWT_SECRET)

    await authRepository.updateUser(user.id, {
      resetPasswordToken: resetTokenHash,
      resetPasswordExpiresAt: dayjs().add(1, 'hour').toDate(),
      updatedAt: new Date(),
    })

    sendMail({
      to: email,
      subject: 'Redefinição de senha — MappaHub',
      html: resetPasswordHtml(resetTokenValue, env.APP_URL),
    }).catch(err => console.error('[mailer]', err))
  },

  async resetPassword({ token, password }: ResetPasswordInput) {
    const tokenHash = hashToken(token, env.JWT_SECRET)
    const user = await authRepository.findUserByResetToken(tokenHash)
    if (!user) throw new AppError('INVALID_TOKEN', 400, 'Token inválido ou expirado')

    const passwordHash = await argon2.hash(password)

    await authRepository.updateUser(user.id, {
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
      updatedAt: new Date(),
    })
  },

  async acceptInvite({ token, name, password }: AcceptInviteInput) {
    const tokenHash = hashToken(token, env.JWT_SECRET)
    const user = await authRepository.findUserByVerifyToken(tokenHash)
    if (!user) throw new AppError('INVALID_TOKEN', 400, 'Token de convite inválido')

    if (user.emailVerifyExpiresAt && dayjs().isAfter(dayjs(user.emailVerifyExpiresAt))) {
      throw new AppError('TOKEN_EXPIRED', 400, 'Convite expirado')
    }

    const passwordHash = await argon2.hash(password)

    await authRepository.updateUser(user.id, {
      name,
      passwordHash,
      emailVerified: true,
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
      updatedAt: new Date(),
    })

    return authRepository.findUserById(user.id)
  },

  async sendInvite(inviterName: string, userId: string, tenantId: string) {
    const user = await authRepository.findUserById(userId)
    if (!user || user.tenantId !== tenantId) {
      throw new AppError('USER_NOT_FOUND', 404, 'Usuário não encontrado')
    }

    const inviteTokenValue = generateToken()
    const inviteTokenHash = hashToken(inviteTokenValue, env.JWT_SECRET)

    await authRepository.updateUser(user.id, {
      emailVerifyToken: inviteTokenHash,
      emailVerifyExpiresAt: dayjs().add(7, 'day').toDate(),
      updatedAt: new Date(),
    })

    sendMail({
      to: user.email,
      subject: `${inviterName} convidou você para o MappaHub`,
      html: inviteEmailHtml(inviterName, inviteTokenValue, env.APP_URL),
    }).catch(err => console.error('[mailer]', err))
  },
}
