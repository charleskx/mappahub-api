import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const PREFIX = 'enc:v1:'

/**
 * Cifra `plaintext` com AES-256-GCM.
 * `keyHex` deve ser 64 chars hexadecimais (32 bytes).
 * Retorna string no formato `enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`.
 */
export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decifra uma string produzida por `encryptSecret`.
 * Se o valor não começar com `enc:v1:`, retorna como está (segredo legado em texto puro).
 */
export function decryptSecret(ciphertext: string, keyHex: string): string {
  if (!ciphertext.startsWith(PREFIX)) return ciphertext
  const parts = ciphertext.slice(PREFIX.length).split(':')
  if (parts.length !== 3) throw new Error('Formato de ciphertext inválido')
  const [ivHex, tagHex, encHex] = parts
  const key = Buffer.from(keyHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}
