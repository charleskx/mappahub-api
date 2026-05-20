import { importQueue } from '../../queues/import.queue'
import { AppError } from '../../shared/errors'
import { defineAbilityFor } from '../../shared/permissions'
import { importRepository } from './import.repository'

type Requester = { id: string; role: string; tenantId: string }

export const importService = {
  async upload(
    filePath: string,
    fileName: string,
    fileSize: number,
    requester: Requester,
    mode: 'full' | 'incremental' = 'full',
  ) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('create', 'Partner')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    const job = await importRepository.create(requester.tenantId, requester.id, fileName, fileSize, mode)

    await importQueue.add('process', {
      jobId: job.id,
      tenantId: requester.tenantId,
      userId: requester.id,
      fileName,
      filePath,
      mode,
    })

    return { jobId: job.id }
  },

  async getJob(id: string, requester: Requester) {
    const job = await importRepository.findById(id, requester.tenantId)
    if (!job) throw new AppError('JOB_NOT_FOUND', 404, 'Job não encontrado')
    return job
  },

  async listJobs(requester: Requester) {
    return importRepository.findAll(requester.tenantId)
  },
}
