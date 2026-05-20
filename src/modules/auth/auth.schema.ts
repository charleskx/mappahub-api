import { z } from 'zod'

export const registerSchema = z.object({
  tenantName: z.string().min(2).max(200),
  name: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(12),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12),
})

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
})

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).max(200),
  password: z.string().min(12),
})

export const totpVerifySchema = z.object({
  code: z.string().length(6),
})

export const totpLoginSchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().length(6),
})

export const recoveryLoginSchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().min(1),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>
export type TotpLoginInput = z.infer<typeof totpLoginSchema>
