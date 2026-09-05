import { describe, expect, it } from 'vitest'
import { queueJobShape } from './schemas'

describe('salary disclosure policy', () => {
  it('allows a job to be queued when salary is not disclosed', () => {
    expect(queueJobShape.salaryRange.safeParse(undefined).success).toBe(true)
  })

  it('still validates a disclosed salary as normal text', () => {
    expect(queueJobShape.salaryRange.safeParse('Rp 8.000.000 – Rp 12.000.000 per month').success).toBe(true)
  })
})
