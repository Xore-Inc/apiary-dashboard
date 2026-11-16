// An ApiError crosses the wire as its message (Start serializes the error),
// and the page rebuilds the kind, the endpoint and the retry hint from it.
import { describe, expect, it } from 'vitest'
import { ApiError, asApiError } from './errors'

describe('ApiError', () => {
  it('survives being reduced to its message', () => {
    const original = new ApiError('overloaded', 'getEvents', { retryAfter: 30 })
    const rebuilt = asApiError(new Error(original.message))
    expect(rebuilt).toMatchObject({ kind: 'overloaded', endpoint: 'getEvents', status: 503, retryAfter: 30 })
    expect(asApiError(new Error('something else'))).toBeUndefined()
  })

  it('keeps each kind and its status through the round trip', () => {
    for (const [kind, status] of [['unavailable', 502], ['expired', 401], ['forbidden', 403], ['locked', 423]] as const) {
      expect(asApiError(new Error(new ApiError(kind, 'getAlerts').message)), kind).toMatchObject({ kind, endpoint: 'getAlerts', status })
    }
  })
})
