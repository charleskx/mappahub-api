import dayjs from 'dayjs'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../config/database'
import { env } from '../../config/env'
import { subscriptions, users } from '../../db/schema'
import { authenticate } from '../../middlewares/authenticate'
import { AppError } from '../../shared/errors'
import { hashToken } from '../../shared/token-hash'
import { generateToken } from '../../shared/utils'
import { authRepository } from './auth.repository'
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  recoveryLoginSchema,
  totpLoginSchema,
  totpVerifySchema,
  verifyEmailSchema,
} from './auth.schema'
import { authService } from './auth.service'

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    const result = await authService.register(body.data)
    const accessToken = await reply.jwtSign({
      sub: result.user.id,
      tenantId: result.tenant.id,
      role: result.user.role,
      name: result.user.name,
    })

    return reply.status(201).send({ accessToken, refreshToken: result.refreshToken })
  })

  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = loginSchema.safeParse(req.body)
      if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

      const result = await authService.login(body.data)

      if (result.requiresTwoFactor) {
        return { requiresTwoFactor: true, tempToken: result.tempToken }
      }

      if (!result.user) throw new AppError('INTERNAL_ERROR', 500, 'Erro inesperado no login')

      const accessToken = await reply.jwtSign({
        sub: result.user.id,
        tenantId: result.user.tenantId,
        role: result.user.role,
        name: result.user.name,
      })

      return { requiresTwoFactor: false, accessToken, refreshToken: result.refreshToken }
    },
  )

  app.post('/2fa/login', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = totpLoginSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    const result = await authService.loginWithTotp(body.data.tempToken, body.data.code)
    const accessToken = await reply.jwtSign({
      sub: result.user.id,
      tenantId: result.user.tenantId,
      role: result.user.role,
      name: result.user.name,
    })

    return { accessToken, refreshToken: result.refreshToken }
  })

  app.post('/2fa/setup', { preHandler: [authenticate] }, async req => {
    return authService.setupTotp(req.userId)
  })

  app.post('/2fa/verify', { preHandler: [authenticate] }, async req => {
    const body = totpVerifySchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    const result = await authService.verifyAndEnableTotp(req.userId, body.data.code)
    return { success: true, recoveryCodes: result.recoveryCodes }
  })

  app.post('/2fa/recover', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = recoveryLoginSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    const result = await authService.loginWithRecoveryCode(body.data.tempToken, body.data.code)
    const accessToken = await reply.jwtSign({
      sub: result.user.id,
      tenantId: result.user.tenantId,
      role: result.user.role,
      name: result.user.name,
    })

    return { accessToken, refreshToken: result.refreshToken }
  })

  app.delete('/2fa', { preHandler: [authenticate] }, async req => {
    const body = totpVerifySchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    await authService.disableTotp(req.userId, body.data.code)
    return { success: true }
  })

  app.post('/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = refreshSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    const result = await authService.refresh(body.data.refreshToken)
    const accessToken = await reply.jwtSign({
      sub: result.user.id,
      tenantId: result.user.tenantId,
      role: result.user.role,
      name: result.user.name,
    })

    return { accessToken, refreshToken: result.refreshToken }
  })

  app.post('/logout', async req => {
    const body = refreshSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    await authService.logout(body.data.refreshToken)
    return { success: true }
  })

  app.get('/verify', async req => {
    const query = verifyEmailSchema.safeParse(req.query)
    if (!query.success) throw new AppError('VALIDATION_ERROR', 400, query.error.errors[0].message)

    await authService.verifyEmail(query.data.token)
    return { success: true }
  })

  app.post('/resend-verification', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async req => {
    const { email } = req.body as { email?: string }
    if (!email) throw new AppError('VALIDATION_ERROR', 400, 'E-mail obrigatório')

    await authService.resendVerification(email)
    return { success: true, message: 'Se o e-mail existir e não estiver verificado, um novo link foi enviado.' }
  })

  app.post('/forgot-password', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async req => {
    const body = forgotPasswordSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    await authService.forgotPassword(body.data.email)
    return { success: true, message: 'Se o e-mail existir, você receberá as instruções.' }
  })

  app.post('/reset-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async req => {
    const body = resetPasswordSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    await authService.resetPassword(body.data)
    return { success: true }
  })

  app.post('/accept-invite', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const body = acceptInviteSchema.safeParse(req.body)
    if (!body.success) throw new AppError('VALIDATION_ERROR', 400, body.error.errors[0].message)

    const user = await authService.acceptInvite(body.data)
    if (!user) throw new AppError('USER_NOT_FOUND', 404)

    const accessToken = await reply.jwtSign({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name,
    })

    const refreshTokenValue = generateToken(64)
    await authRepository.createRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      token: hashToken(refreshTokenValue, env.JWT_SECRET),
      familyId: randomUUID(),
      expiresAt: dayjs().add(30, 'day').toDate(),
    })

    return { accessToken, refreshToken: refreshTokenValue }
  })

  app.post('/google', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const { credential } = req.body as { credential?: string }
    if (!credential) throw new AppError('VALIDATION_ERROR', 400, 'credential obrigatório')

    const result = await authService.loginWithGoogle(credential)
    const accessToken = await reply.jwtSign({
      sub: result.user.id,
      tenantId: result.user.tenantId,
      role: result.user.role,
      name: result.user.name,
    })

    return { accessToken, refreshToken: result.refreshToken }
  })

  // Endpoint sem subscriptionGuard — usado pelo frontend para carregar o usuário logado
  // independente do status da assinatura, garantindo acesso à tela de billing mesmo com conta cancelada
  app.get('/me', { preHandler: [authenticate] }, async (req) => {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        tenantId: users.tenantId,
        emailVerified: users.emailVerified,
        totpEnabled: users.totpEnabled,
      })
      .from(users)
      .where(eq(users.id, req.userId))
      .limit(1)

    if (!user) throw new AppError('USER_NOT_FOUND', 404)

    const [sub] = await db
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, req.tenantId))
      .limit(1)

    return {
      ...user,
      twoFactorEnabled: user.totpEnabled,
      subscriptionStatus: sub?.status ?? null,
    }
  })
}
