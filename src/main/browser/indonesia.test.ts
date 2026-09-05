import { describe, expect, it } from 'vitest'
import { indonesiaSearchLocation, isIndonesiaLocation } from './indonesia'

describe('indonesiaSearchLocation', () => {
  it('defaults blank searches to Indonesia', () => {
    expect(indonesiaSearchLocation()).toBe('Indonesia')
    expect(indonesiaSearchLocation('   ')).toBe('Indonesia')
  })

  it('preserves a specific Indonesian location', () => {
    expect(indonesiaSearchLocation('Jakarta')).toBe('Jakarta')
  })
})

describe('isIndonesiaLocation', () => {
  it.each([
    'Jakarta',
    'Bandung, Jawa Barat',
    'Surabaya, East Java',
    'Remote - Indonesia',
    'Tangerang Selatan, Banten',
    'Makassar, Sulawesi Selatan'
  ])('accepts %s', (location) => {
    expect(isIndonesiaLocation(location, 'linkedin')).toBe(true)
  })

  it.each(['Singapore', 'Kuala Lumpur, Malaysia', 'Berlin, Germany'])('rejects %s', (location) => {
    expect(isIndonesiaLocation(location, 'linkedin')).toBe(false)
  })

  it('rejects an unknown or missing location in strict mode', () => {
    expect(isIndonesiaLocation(undefined, 'indeed')).toBe(false)
    expect(isIndonesiaLocation('Remote', 'indeed')).toBe(false)
  })

  it('accepts JobStreet Indonesia results even when a card omits its location', () => {
    expect(isIndonesiaLocation(undefined, 'jobstreet')).toBe(true)
  })
})
