import { describe, expect, it } from 'vitest'
import { hasExportToken } from './exportToken'

const req = (headers: Record<string, string>) =>
  new Request('http://dashboard.example.test/export', { headers })

describe('hasExportToken', () => {
  it('matches only X-Export-Token equal to EXPORT_TOKEN', () => {
    const env = {
      EXPORT_TOKEN: 'export-secret',
      SERVICE_TOKEN: 'service-secret',
    }
    expect(
      hasExportToken(req({ 'x-export-token': 'export-secret' }), env),
    ).toBe(true)
    expect(
      hasExportToken(req({ 'x-export-token': 'export-secreT' }), env),
    ).toBe(false)
    expect(hasExportToken(req({ 'x-export-token': 'export' }), env)).toBe(false)
    expect(
      hasExportToken(req({ 'x-export-token': 'service-secret' }), env),
    ).toBe(false)
    expect(
      hasExportToken(req({ 'x-service-token': 'export-secret' }), env),
    ).toBe(false)
    expect(hasExportToken(req({}), env)).toBe(false)
  })

  it('never matches while EXPORT_TOKEN is unset or empty', () => {
    expect(hasExportToken(req({ 'x-export-token': '' }), {})).toBe(false)
    expect(
      hasExportToken(req({ 'x-export-token': '' }), { EXPORT_TOKEN: '' }),
    ).toBe(false)
    expect(hasExportToken(req({ 'x-export-token': 'x' }), {})).toBe(false)
  })
})
