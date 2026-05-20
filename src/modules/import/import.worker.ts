import { readFile, unlink } from 'node:fs/promises'
import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { redis } from '../../config/redis'
import { env } from '../../config/env'
import { db } from '../../config/database'
import { subscriptions } from '../../db/schema'
import { geocodingQueue } from '../../queues/geocoding.queue'
import type { ImportJobPayload } from '../../queues/import.queue'
import { importDoneHtml, sendMail } from '../../shared/mailer'
import { emitToTenant } from '../../shared/sse-bus'
import { partnerRepository } from '../partner/partner.repository'
import { pinTypeRepository } from '../pin-type/pin-type.repository'
import { userRepository } from '../user/user.repository'
import { importRepository } from './import.repository'
import { parseSpreadsheet } from './import.parser'

async function getGeocodingPriority(tenantId: string): Promise<number> {
  const [sub] = await db
    .select({ planType: subscriptions.planType })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1)
  return sub?.planType === 'annual' ? 1 : 2
}

const PROGRESS_BATCH = 10

async function buildPinTypeCache(tenantId: string): Promise<Map<string, string>> {
  const all = await pinTypeRepository.findAll(tenantId)
  return new Map(all.map(pt => [pt.name.toLowerCase(), pt.id]))
}

async function cleanupTmpFile(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => {})
}

export function createImportWorker() {
  const worker = new Worker<ImportJobPayload>(
    'import',
    async job => {
      const { jobId, tenantId, filePath, fileName, mode } = job.data

      // Lê e parseia o arquivo no worker — HTTP process nunca carregou o conteúdo
      let fileBuffer: Buffer
      try {
        fileBuffer = await readFile(filePath)
      } catch {
        throw new Error(`Arquivo temporário não encontrado: ${filePath}`)
      }

      const { rows, errors: parseErrors } = await parseSpreadsheet(fileBuffer, fileName)

      // Arquivo lido — pode deletar o temporário imediatamente
      await cleanupTmpFile(filePath)

      const [, geocodingPriority] = await Promise.all([
        importRepository.update(jobId, {
          status: 'processing',
          mode,
          totalRows: rows.length,
          processedRows: 0,
          startedAt: new Date(),
        }),
        getGeocodingPriority(tenantId),
      ])

      let created = 0
      let updated = 0
      let failed = parseErrors.length
      const errorLog: Array<{ row: number; message: string }> = parseErrors.map(e => ({ row: e.line, message: e.message }))
      const processedIds = new Set<string>()

      const pinTypeCache = await buildPinTypeCache(tenantId)

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        try {
          const pinTypeId = row.pinType
            ? (pinTypeCache.get(row.pinType.toLowerCase()) ?? null)
            : null

          const existing =
            await partnerRepository.findByExternalKey(row.externalKey, tenantId) ??
            (mode !== 'incremental' ? await partnerRepository.findByName(row.name, tenantId) : null)

          if (existing) {
            await partnerRepository.update(existing.id, tenantId, {
              name: row.name,
              address: row.address,
              pinTypeId: pinTypeId ?? undefined,
              visibility: row.visibility as 'public' | 'internal' | undefined,
              dynamicValues: row.dynamicValues,
              externalKey: row.externalKey,
              source: 'import',
            })
            if (row.address !== existing.address) {
              await geocodingQueue.add('geocode', {
                partnerId: existing.id,
                address: row.address,
                tenantId,
              }, { priority: geocodingPriority })
            }
            processedIds.add(existing.id)
            updated++
          } else {
            const partner = await partnerRepository.create(tenantId, {
              name: row.name,
              address: row.address,
              pinTypeId: pinTypeId ?? undefined,
              visibility: (row.visibility as 'public' | 'internal') ?? 'public',
              dynamicValues: row.dynamicValues,
              source: 'import',
              externalKey: row.externalKey,
              importJobId: jobId,
            })
            await geocodingQueue.add('geocode', {
              partnerId: partner.id,
              address: partner.address,
              tenantId,
            }, { priority: geocodingPriority })
            processedIds.add(partner.id)
            created++
          }
        } catch (err) {
          failed++
          errorLog.push({ row: i + 2, message: String(err) })
        }

        if ((i + 1) % PROGRESS_BATCH === 0 || i === rows.length - 1) {
          await importRepository.update(jobId, { processedRows: i + 1 })
        }
      }

      let removed = 0
      if (mode !== 'incremental') {
        removed = await softDeleteStale(tenantId, processedIds, jobId)
      }

      await importRepository.update(jobId, {
        status: 'done',
        created,
        updated,
        removed,
        failed,
        processedRows: rows.length,
        errorLog: errorLog.length > 0 ? errorLog : null,
        finishedAt: new Date(),
      })

      await sendImportDoneEmails({ jobId, tenantId, created, updated, removed, failed, totalRows: rows.length })
      emitToTenant(tenantId, { type: 'notification' })
    },
    {
      connection: redis,
      concurrency: 2,
    },
  )

  worker.on('failed', async (job: { data: ImportJobPayload } | undefined) => {
    if (!job) return
    const { jobId, tenantId, filePath } = job.data
    // Garante limpeza do temp mesmo em falha de BullMQ
    await cleanupTmpFile(filePath)
    try {
      await importRepository.update(jobId, { status: 'failed', finishedAt: new Date() })
    } catch {}
    emitToTenant(tenantId, { type: 'notification' })
  })

  return worker
}

async function sendImportDoneEmails(opts: {
  jobId: string
  tenantId: string
  created: number
  updated: number
  removed: number
  failed: number
  totalRows: number
}) {
  try {
    const { jobId, tenantId, created, updated, removed, failed, totalRows } = opts

    const [job, owner] = await Promise.all([
      importRepository.findByIdGlobal(jobId),
      userRepository.findOwner(tenantId),
    ])

    if (!job) return

    const uploader = await userRepository.findById(job.userId, tenantId)
    if (!uploader) return

    const appUrl = env.APP_URL ?? 'https://app.atlasync.com.br'
    const html = importDoneHtml({
      uploaderName: uploader.name,
      fileName: job.fileName ?? 'planilha',
      totalRows,
      created,
      updated,
      removed,
      failed,
      appUrl,
    })

    const subject = `✅ Importação concluída — ${job.fileName ?? 'planilha'}`

    await sendMail({ to: uploader.email, subject, html })

    if (owner && owner.id !== uploader.id) {
      await sendMail({ to: owner.email, subject, html })
    }
  } catch (err) {
    console.error('[import-worker] Falha ao enviar e-mail de conclusão:', err)
  }
}

async function softDeleteStale(tenantId: string, processedIds: Set<string>, jobId: string): Promise<number> {
  const existingIds = await partnerRepository.findAllImportedIds(tenantId)
  const toDelete = existingIds.filter(id => !processedIds.has(id))

  await partnerRepository.softDeleteNonProcessedImports(tenantId, Array.from(processedIds), jobId)

  return toDelete.length
}
