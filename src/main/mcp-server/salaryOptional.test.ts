import { describe, expect, it } from 'vitest'
import { queueJobShape, updateProfileShape } from './schemas'

describe('salary disclosure policy', () => {
  it('allows a job to be queued when salary is not disclosed', () => {
    expect(queueJobShape.salaryRange.safeParse(undefined).success).toBe(true)
  })

  it('still validates a disclosed salary as normal text', () => {
    expect(queueJobShape.salaryRange.safeParse('Rp 8.000.000 – Rp 12.000.000 per month').success).toBe(true)
  })

  it('accepts Indonesian salary preferences above ten million rupiah', () => {
    expect(updateProfileShape.salaryMin.safeParse(15_000_000).success).toBe(true)
    expect(updateProfileShape.salaryMax.safeParse(30_000_000).success).toBe(true)
  })
})
