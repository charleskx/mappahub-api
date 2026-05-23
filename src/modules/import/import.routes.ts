import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { authenticate } from '../../middlewares/authenticate'
import { subscriptionGuard } from '../../middlewares/subscription-guard'
import { AppError } from '../../shared/errors'
import { env } from '../../config/env'
import { r2, r2Enabled } from '../../config/r2'
import { importRepository } from './import.repository'
import { importService } from './import.service'

const IMPORT_MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

const preHandler = [authenticate, subscriptionGuard]

export async function importRoutes(app: FastifyInstance) {
  app.post(
    '/upload',
    { preHandler, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      if (!r2Enabled()) {
        throw new AppError('R2_NOT_CONFIGURED', 503, 'Serviço de importação indisponível. Configure R2.')
      }

      let data: Awaited<ReturnType<typeof req.file>>
      try {
        data = await req.file({ limits: { fileSize: IMPORT_MAX_FILE_SIZE } })
      } catch {
        throw new AppError('NO_FILE', 400, 'Envie o arquivo como multipart/form-data')
      }
      if (!data) throw new AppError('NO_FILE', 400, 'Arquivo não enviado')

      const ext = data.filename.split('.').pop()?.toLowerCase()
      if (!ext || !['xlsx', 'csv'].includes(ext)) {
        throw new AppError('INVALID_FILE_TYPE', 400, 'Formato inválido. Use .xlsx ou .csv')
      }

      const query = req.query as { mode?: string }
      const mode = query.mode === 'incremental' ? 'incremental' : 'full'

      let fileBuffer: Buffer
      try {
        fileBuffer = await data.toBuffer()
      } catch {
        throw new AppError('UPLOAD_ERROR', 500, 'Erro ao receber o arquivo')
      }

      const r2Key = `imports/${randomUUID()}.${ext}`
      const bucket = env.R2_BUCKET_NAME

      try {
        await r2?.send(new PutObjectCommand({
          Bucket: bucket,
          Key: r2Key,
          Body: fileBuffer,
        }))
      } catch {
        throw new AppError('UPLOAD_ERROR', 500, 'Erro ao armazenar o arquivo')
      }

      const result = await importService.upload(
        r2Key,
        data.filename,
        fileBuffer.byteLength,
        { id: req.userId, role: req.userRole, tenantId: req.tenantId },
        mode,
      )

      return reply.status(202).send(result)
    },
  )

  app.get('/', { preHandler }, async req => {
    return importService.listJobs({ id: req.userId, role: req.userRole, tenantId: req.tenantId })
  })

  app.get('/:id', { preHandler }, async req => {
    const { id } = req.params as { id: string }
    return importService.getJob(id, { id: req.userId, role: req.userRole, tenantId: req.tenantId })
  })

  app.get('/:id/progress', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const job = await importRepository.findById(id, req.tenantId)
    if (!job) throw new AppError('JOB_NOT_FOUND', 404, 'Job não encontrado')

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.hijack()

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const POLL_MS = 1000
    const MAX_WAIT_MS = 10 * 60 * 1000
    let elapsed = 0

    const interval = setInterval(async () => {
      elapsed += POLL_MS

      try {
        const current = await importRepository.findById(id, req.tenantId)
        if (!current) {
          clearInterval(interval)
          reply.raw.end()
          return
        }

        send({
          status: current.status,
          totalRows: current.totalRows ?? 0,
          processedRows: current.processedRows ?? 0,
          created: current.created ?? 0,
          updated: current.updated ?? 0,
          removed: current.removed ?? 0,
          failed: current.failed ?? 0,
        })

        if (current.status === 'done' || current.status === 'failed' || elapsed >= MAX_WAIT_MS) {
          clearInterval(interval)
          reply.raw.end()
        }
      } catch {
        clearInterval(interval)
        reply.raw.end()
      }
    }, POLL_MS)

    req.raw.on('close', () => clearInterval(interval))
  })
}
