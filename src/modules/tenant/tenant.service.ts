import { PutObjectCommand } from '@aws-sdk/client-s3'
import type { FastifyRequest } from 'fastify'
import { env } from '../../config/env'
import { r2, r2Enabled } from '../../config/r2'
import { AppError } from '../../shared/errors'
import { defineAbilityFor } from '../../shared/permissions'
import { tenantRepository } from './tenant.repository'
import type { UpdateSettingsInput } from './tenant.schema'

type Requester = { id: string; role: string; tenantId: string }

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB

export const tenantService = {
  async getSettings(requester: Requester) {
    const settings = await tenantRepository.findSettings(requester.tenantId)
    if (!settings) throw new AppError('SETTINGS_NOT_FOUND', 404, 'Configurações não encontradas')

    return settings
  },

  async updateSettings(data: UpdateSettingsInput, requester: Requester) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('update', 'Settings')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    return tenantRepository.upsertSettings(requester.tenantId, data)
  },

  async uploadLogo(req: FastifyRequest, requester: Requester) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('update', 'Settings')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')
    if (!r2Enabled()) throw new AppError('R2_NOT_CONFIGURED', 503, 'Upload não configurado')

    const file = await req.file()
    if (!file) throw new AppError('FILE_REQUIRED', 400, 'Nenhum arquivo enviado')
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new AppError('INVALID_FILE_TYPE', 400, 'Formato inválido. Use JPG, PNG, WebP ou SVG')
    }

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of file.file) {
      size += chunk.length
      if (size > MAX_SIZE) throw new AppError('FILE_TOO_LARGE', 400, 'Arquivo deve ter no máximo 2 MB')
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)

    const ext = file.mimetype.split('/')[1].replace('svg+xml', 'svg')
    const key = `logos/${requester.tenantId}.${ext}`

    await r2!.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000',
    }))

    return `${env.R2_PUBLIC_URL}/${key}`
  },
}
