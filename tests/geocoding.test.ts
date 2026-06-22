import { describe, expect, it } from 'vitest'
import {
  effectiveLimit,
  findPack,
  GEO_PACKS,
  GEOCODING_DEFAULT_MONTHLY_LIMIT,
} from '../src/modules/geocoding/geocoding.limits'

describe('effectiveLimit', () => {
  it('uses the default when there is no override', () => {
    expect(effectiveLimit({ geocodingMonthlyLimit: null, geocodingLimitExpiresAt: null }))
      .toBe(GEOCODING_DEFAULT_MONTHLY_LIMIT)
  })

  it('uses a permanent override (no expiry)', () => {
    expect(effectiveLimit({ geocodingMonthlyLimit: 10000, geocodingLimitExpiresAt: null })).toBe(10000)
  })

  it('honors an override still within its validity', () => {
    const future = new Date(Date.now() + 86_400_000)
    expect(effectiveLimit({ geocodingMonthlyLimit: 10000, geocodingLimitExpiresAt: future })).toBe(10000)
  })

  it('falls back to the default once the override has expired', () => {
    const past = new Date(Date.now() - 86_400_000)
    expect(effectiveLimit({ geocodingMonthlyLimit: 10000, geocodingLimitExpiresAt: past }))
      .toBe(GEOCODING_DEFAULT_MONTHLY_LIMIT)
  })
})

describe('GEO_PACKS catalog', () => {
  it('exposes the four packs with growing validity', () => {
    expect(GEO_PACKS.map(p => p.id)).toEqual(['1k', '5k', '10k', '25k'])
    const validities = GEO_PACKS.map(p => p.validityDays)
    expect(validities).toEqual([...validities].sort((a, b) => a - b))
  })

  it('resolves a pack by id and returns undefined for unknown ids', () => {
    expect(findPack('10k')?.credits).toBe(10000)
    expect(findPack('nope')).toBeUndefined()
  })
})
