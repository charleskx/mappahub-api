import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ANNUAL: z.string().optional(),
  STRIPE_PRICE_GEO_1K: z.string().optional(),
  STRIPE_PRICE_GEO_5K: z.string().optional(),
  STRIPE_PRICE_GEO_10K: z.string().optional(),
  STRIPE_PRICE_GEO_25K: z.string().optional(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  // 64 chars hex = 32 bytes = chave AES-256 para cifrar totpSecret no banco
  TOTP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('MappaHub <noreply@mappahub.com.br>'),
})

export const env = schema.parse(process.env)

// Validação de variáveis obrigatórias em produção
if (env.NODE_ENV === 'production') {
  const missing: string[] = []

  if (!env.CORS_ORIGIN) missing.push('CORS_ORIGIN')
  if (!env.TOTP_ENCRYPTION_KEY) missing.push('TOTP_ENCRYPTION_KEY')
  if (!env.APP_URL.startsWith('https://')) {
    missing.push('APP_URL (deve usar HTTPS em produção)')
  }
  if (env.SMTP_HOST === 'localhost') missing.push('SMTP_HOST')
  if (!env.SMTP_PASS) missing.push('SMTP_PASS')

  if (missing.length > 0) {
    throw new Error(`[env] Variáveis obrigatórias em produção não definidas: ${missing.join(', ')}`)
  }
}
