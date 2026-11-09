import { describe, expect, it } from 'vitest'
import { sensorSubtitle, sensorSummary } from './sensorText'

// #288: a sensor read from the live API has no kind and no location, so the
// subtitle rendered "· · tcp" and the summary began with a bare period.
describe('sensorSubtitle', () => {
  it('drops the parts the backend does not know', () => {
    expect(sensorSubtitle({ kind: '', location: '', protocols: ['tcp'] })).toBe('tcp')
  })

  it('joins what is known', () => {
    expect(sensorSubtitle({ kind: 'SSH honeypot', location: 'vps', protocols: ['tcp', 'udp'] })).toBe('SSH honeypot · vps · tcp, udp')
  })

  it('is absent, not an empty string, when nothing is known', () => {
    expect(sensorSubtitle({ kind: '', location: '', protocols: [] })).toBeUndefined()
  })
})

describe('sensorSummary', () => {
  const TAIL = 'The quantities this sensor exists to produce.'

  it('starts at the explanation when the sensor has no description', () => {
    expect(sensorSummary('', TAIL)).toBe(TAIL)
    expect(sensorSummary('  ', TAIL)).toBe(TAIL)
  })

  it('puts one sentence stop between the description and the explanation', () => {
    expect(sensorSummary('SSH sessions', TAIL)).toBe(`SSH sessions. ${TAIL}`)
    expect(sensorSummary('SSH sessions.', TAIL)).toBe(`SSH sessions. ${TAIL}`)
  })
})
