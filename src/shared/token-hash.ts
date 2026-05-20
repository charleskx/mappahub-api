import { createHmac } from 'node:crypto'

/**
 * HMAC-SHA256 keyed with JWT_SECRET.
 * Armazenamos o hash no banco; o token bruto trafega apenas no wire.
 */
export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex')
}
