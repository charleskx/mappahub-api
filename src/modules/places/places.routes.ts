import type { FastifyInstance } from 'fastify'
import { env } from '../../config/env'
import { authenticate } from '../../middlewares/authenticate'
import { AppError } from '../../shared/errors'

type AutocompleteResult = {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

type PlaceDetails = {
  placeId: string
  address: string
  lat: number
  lng: number
  city?: string
  state?: string
}

type NewApiAddressComponent = { longText: string; types: string[] }

function getComponent(components: NewApiAddressComponent[], type: string) {
  return components.find(c => c.types.includes(type))?.longText
}

export async function placesRoutes(app: FastifyInstance) {
  app.get('/autocomplete', { preHandler: [authenticate] }, async req => {
    if (!env.GOOGLE_MAPS_API_KEY) {
      throw new AppError('PLACES_DISABLED', 503, 'Google Places não está configurado')
    }

    const { input, sessiontoken } = req.query as { input?: string; sessiontoken?: string }
    if (!input || input.trim().length < 3) {
      throw new AppError('VALIDATION_ERROR', 400, 'input deve ter ao menos 3 caracteres')
    }

    const body: Record<string, unknown> = {
      input: input.trim(),
      languageCode: 'pt-BR',
      includedRegionCodes: ['br'],
      includedPrimaryTypes: ['route', 'street_address', 'premise'],
    }
    if (sessiontoken) body.sessionToken = sessiontoken

    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[Places] Autocomplete HTTP ${res.status}: ${err}`)
      throw new AppError('PLACES_ERROR', 502, 'Erro ao consultar Google Places')
    }

    type NewApiSuggestion = {
      placePrediction: {
        place: string
        placeId: string
        text: { text: string }
        structuredFormat: {
          mainText: { text: string }
          secondaryText: { text: string }
        }
      }
    }
    const data = (await res.json()) as { suggestions?: NewApiSuggestion[] }

    // "place" is the resource name "places/{id}" — we strip the prefix so the ID
    // can be safely used as a URL path segment (no slashes) and re-prefixed in /details
    const results: AutocompleteResult[] = (data.suggestions ?? []).map(s => ({
      placeId: s.placePrediction.place.replace(/^places\//, ''),
      description: s.placePrediction.text.text,
      mainText: s.placePrediction.structuredFormat.mainText.text,
      secondaryText: s.placePrediction.structuredFormat.secondaryText?.text ?? '',
    }))

    return { results }
  })

  app.get('/details', { preHandler: [authenticate] }, async req => {
    if (!env.GOOGLE_MAPS_API_KEY) {
      throw new AppError('PLACES_DISABLED', 503, 'Google Places não está configurado')
    }

    const { placeId, sessiontoken } = req.query as { placeId?: string; sessiontoken?: string }
    if (!placeId) throw new AppError('VALIDATION_ERROR', 400, 'placeId obrigatório')

    // placeId is just the ID part; reconstruct the resource name "places/{id}"
    const googleUrl = new URL(`https://places.googleapis.com/v1/places/${placeId}`)
    googleUrl.searchParams.set('languageCode', 'pt-BR')
    if (sessiontoken) googleUrl.searchParams.set('sessionToken', sessiontoken)

    const res = await fetch(googleUrl.toString(), {
      headers: {
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents',
      },
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[Places] Details HTTP ${res.status}: ${err}`)
      throw new AppError('PLACES_ERROR', res.status === 404 ? 404 : 502, 'Erro ao consultar Google Places')
    }

    const data = (await res.json()) as {
      id: string
      formattedAddress: string
      location: { latitude: number; longitude: number }
      addressComponents: NewApiAddressComponent[]
    }

    const details: PlaceDetails = {
      placeId: data.id,
      address: data.formattedAddress,
      lat: data.location.latitude,
      lng: data.location.longitude,
      city:
        getComponent(data.addressComponents, 'administrative_area_level_2') ??
        getComponent(data.addressComponents, 'locality'),
      state: getComponent(data.addressComponents, 'administrative_area_level_1'),
    }

    return details
  })
}
