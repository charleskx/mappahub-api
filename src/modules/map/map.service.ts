import { env } from '../../config/env'
import { AppError } from '../../shared/errors'
import { defineAbilityFor } from '../../shared/permissions'
import { generateToken } from '../../shared/utils'
import { mapRepository } from './map.repository'
import { tenantRepository } from '../tenant/tenant.repository'
import type { CreateMapInput, MapPinsQuery, UpdateMapInput } from './map.schema'

type Requester = { id: string; role: string; tenantId: string }

export const mapService = {
  async list(requester: Requester) {
    return mapRepository.findAll(requester.tenantId)
  },

  async getById(id: string, requester: Requester) {
    const map = await mapRepository.findById(id, requester.tenantId)
    if (!map) throw new AppError('MAP_NOT_FOUND', 404, 'Mapa não encontrado')
    return map
  },

  async create(data: CreateMapInput, requester: Requester) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('create', 'Map')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    if (data.type === 'public') {
      const settings = await tenantRepository.findSettings(requester.tenantId)
      if (!settings?.publicMapEnabled) {
        throw new AppError('PUBLIC_MAP_DISABLED', 403, 'Mapa público está desabilitado nas configurações do workspace')
      }
    }

    const embedToken = data.type === 'public' ? generateToken(24) : undefined

    return mapRepository.create(requester.tenantId, {
      name: data.name,
      type: data.type,
      filters: data.filters,
      embedToken,
    })
  },

  async update(id: string, data: UpdateMapInput, requester: Requester) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('update', 'Map')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    const existing = await mapRepository.findById(id, requester.tenantId)
    if (!existing) throw new AppError('MAP_NOT_FOUND', 404, 'Mapa não encontrado')

    return mapRepository.update(id, requester.tenantId, data)
  },

  async delete(id: string, requester: Requester) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('delete', 'Map')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    const existing = await mapRepository.findById(id, requester.tenantId)
    if (!existing) throw new AppError('MAP_NOT_FOUND', 404, 'Mapa não encontrado')

    await mapRepository.softDelete(id, requester.tenantId)
  },

  async getPins(id: string, filters: MapPinsQuery, requester: Requester) {
    const map = await mapRepository.findById(id, requester.tenantId)
    if (!map) throw new AppError('MAP_NOT_FOUND', 404, 'Mapa não encontrado')
    return mapRepository.findPins(requester.tenantId, filters)
  },

  async generateEmbedToken(id: string, requester: Requester) {
    const ability = defineAbilityFor({ role: requester.role })
    if (!ability.can('update', 'Map')) throw new AppError('FORBIDDEN', 403, 'Sem permissão')

    const map = await mapRepository.findById(id, requester.tenantId)
    if (!map) throw new AppError('MAP_NOT_FOUND', 404, 'Mapa não encontrado')

    const embedToken = generateToken(24)
    await mapRepository.update(id, requester.tenantId, { embedToken })
    return { embedToken }
  },

  async getEmbedSnippet(id: string, type: 'iframe' | 'script', requester: Requester) {
    const map = await mapRepository.findById(id, requester.tenantId)
    if (!map) throw new AppError('MAP_NOT_FOUND', 404, 'Mapa não encontrado')
    if (!map.embedToken)
      throw new AppError('EMBED_NOT_ENABLED', 422, 'Gere um embed token primeiro')

    const baseUrl = env.APP_URL
    const embedUrl = `${baseUrl}/embed/public/${map.embedToken}`

    if (type === 'iframe') {
      return {
        snippet: `<iframe src="${embedUrl}" width="100%" height="500" frameborder="0" allowfullscreen></iframe>`,
      }
    }

    return {
      snippet: `<div id="atlasync-map"></div>\n<script src="${baseUrl}/sdk/embed.js"></script>\n<script>\n  MappaHubMap.init({ token: "${map.embedToken}", container: "atlasync-map" })\n</script>`,
    }
  },

  async _resolvePublicMap(token: string) {
    const map = await mapRepository.findByEmbedToken(token)
    if (!map) throw new AppError('MAP_NOT_FOUND', 404, 'Mapa não encontrado')

    const [settings, { tenantActive, subscriptionActive }] = await Promise.all([
      tenantRepository.findSettings(map.tenantId),
      tenantRepository.findTenantStatus(map.tenantId),
    ])

    if (!tenantActive || !subscriptionActive) {
      throw new AppError('MAP_DISABLED', 403, 'Mapa público desabilitado')
    }

    if (!settings?.publicMapEnabled) {
      throw new AppError('MAP_DISABLED', 403, 'Mapa público desabilitado')
    }

    return map
  },

  async getPublicPins(token: string, city?: string, state?: string, pinTypeId?: string) {
    const map = await this._resolvePublicMap(token)
    return mapRepository.findPublicPins(map.tenantId, city, state, pinTypeId)
  },

  async getPublicLocalities(token: string, state?: string) {
    const map = await this._resolvePublicMap(token)
    return mapRepository.findLocalities(map.tenantId, state)
  },

  async getPublicPinTypes(token: string) {
    const map = await this._resolvePublicMap(token)
    return mapRepository.findPublicPinTypes(map.tenantId)
  },

  async getPublicConfig(token: string) {
    const map = await this._resolvePublicMap(token)
    const settings = await tenantRepository.findSettings(map.tenantId)
    return {
      brandLogoUrl: settings?.brandLogoUrl ?? null,
      brandName: settings?.brandName ?? null,
      brandWebsiteUrl: settings?.brandWebsiteUrl ?? null,
      brandColor: settings?.brandColor ?? null,
      brandFooterText: settings?.brandFooterText ?? null,
    }
  },
}
