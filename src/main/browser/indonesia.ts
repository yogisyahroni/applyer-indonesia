import type { JobSource } from './sourceRouter'

export const INDONESIA_DEFAULT_LOCATION = 'Indonesia'

const INDONESIA_LOCATION_MARKERS = [
  'indonesia',
  'jakarta',
  'jabodetabek',
  'banten',
  'jawa barat',
  'west java',
  'jawa tengah',
  'central java',
  'jawa timur',
  'east java',
  'di yogyakarta',
  'yogyakarta',
  'bali',
  'aceh',
  'sumatera utara',
  'north sumatra',
  'sumatera barat',
  'west sumatra',
  'riau',
  'kepulauan riau',
  'riau islands',
  'jambi',
  'sumatera selatan',
  'south sumatra',
  'bangka belitung',
  'bengkulu',
  'lampung',
  'kalimantan barat',
  'west kalimantan',
  'kalimantan tengah',
  'central kalimantan',
  'kalimantan selatan',
  'south kalimantan',
  'kalimantan timur',
  'east kalimantan',
  'kalimantan utara',
  'north kalimantan',
  'sulawesi utara',
  'north sulawesi',
  'gorontalo',
  'sulawesi tengah',
  'central sulawesi',
  'sulawesi barat',
  'west sulawesi',
  'sulawesi selatan',
  'south sulawesi',
  'sulawesi tenggara',
  'southeast sulawesi',
  'nusa tenggara barat',
  'west nusa tenggara',
  'nusa tenggara timur',
  'east nusa tenggara',
  'maluku',
  'maluku utara',
  'north maluku',
  'papua',
  'papua barat',
  'west papua',
  'papua tengah',
  'central papua',
  'papua pegunungan',
  'highland papua',
  'papua selatan',
  'south papua',
  'papua barat daya',
  'southwest papua',
  'bandung',
  'bekasi',
  'bogor',
  'depok',
  'tangerang',
  'cikarang',
  'karawang',
  'semarang',
  'surabaya',
  'sidoarjo',
  'malang',
  'solo',
  'surakarta',
  'denpasar',
  'medan',
  'palembang',
  'pekanbaru',
  'batam',
  'makassar',
  'manado',
  'balikpapan',
  'samarinda',
  'banjarmasin',
  'pontianak'
] as const

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function indonesiaSearchLocation(location?: string): string {
  const trimmed = location?.trim()
  return trimmed || INDONESIA_DEFAULT_LOCATION
}

/**
 * Strict country guard used by the Indonesia distribution.
 * JobStreet's `id.jobstreet.com` catalogue is Indonesia-scoped by definition;
 * other sources must provide a location that can be positively identified as Indonesia.
 */
export function isIndonesiaLocation(location: string | undefined, source?: JobSource): boolean {
  if (source === 'jobstreet') return true
  if (!location?.trim()) return false

  const normalized = normalize(location)
  return INDONESIA_LOCATION_MARKERS.some((marker) => normalized.includes(normalize(marker)))
}
