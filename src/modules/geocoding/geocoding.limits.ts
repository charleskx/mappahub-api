import { env } from '../../config/env'

// Franquia mensal grátis de geocoding por tenant (reseta a cada mês-calendário).
export const GEOCODING_DEFAULT_MONTHLY_LIMIT = 2000

type LimitOverride = {
  geocodingMonthlyLimit: number | null
  geocodingLimitExpiresAt: Date | null
}

/** Franquia mensal efetiva: usa o override do admin se válido, senão o padrão. */
export function effectiveLimit(tenant: LimitOverride): number {
  if (tenant.geocodingLimitExpiresAt && tenant.geocodingLimitExpiresAt < new Date()) {
    return GEOCODING_DEFAULT_MONTHLY_LIMIT
  }
  return tenant.geocodingMonthlyLimit ?? GEOCODING_DEFAULT_MONTHLY_LIMIT
}

// Catálogo de pacotes de créditos extras (pré-pago). Preço apenas para exibição —
// a cobrança real é feita pelo Stripe Price (priceId). Validade no estilo pré-pago:
// quanto maior o pacote, maior o prazo.
export type GeoPack = {
  id: string
  credits: number
  validityDays: number
  priceCents: number
  priceId: string | undefined
}

export const GEO_PACKS: GeoPack[] = [
  { id: '1k', credits: 1000, validityDays: 30, priceCents: 2900, priceId: env.STRIPE_PRICE_GEO_1K },
  { id: '5k', credits: 5000, validityDays: 90, priceCents: 11900, priceId: env.STRIPE_PRICE_GEO_5K },
  { id: '10k', credits: 10000, validityDays: 180, priceCents: 19900, priceId: env.STRIPE_PRICE_GEO_10K },
  { id: '25k', credits: 25000, validityDays: 365, priceCents: 39900, priceId: env.STRIPE_PRICE_GEO_25K },
]

export function findPack(id: string): GeoPack | undefined {
  return GEO_PACKS.find(p => p.id === id)
}
