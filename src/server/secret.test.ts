import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasExportToken } from './exportToken'
import { assertBootPolicies, exportTokenPolicy, serviceTokenPolicy } from './policy'
import { readSecret, secretValue } from './secret'
import { hasServiceToken } from './serviceToken'

const dir = mkdtempSync(join(tmpdir(), 'secret-'))
let n = 0
const file = (content: string) => {
  const path = join(dir, `s${n++}`)
  writeFileSync(path, content)
  return path
}
const req = (headers: Record<string, string>) => new Request('http://dashboard.example.test/x', { headers })
const oidc = { OIDC_ISSUER_URL: 'https://kc.example.test/realms/apiary' }

describe('readSecret', () => {
  it('reads the inline form', () => {
    expect(readSecret('SERVICE_TOKEN', { SERVICE_TOKEN: 'inline' })).toEqual({ kind: 'value', value: 'inline', source: 'SERVICE_TOKEN' })
  })

  it('reads the _FILE form and drops the trailing newline', () => {
    expect(readSecret('SERVICE_TOKEN', { SERVICE_TOKEN_FILE: file('from-file\n') })).toMatchObject({ kind: 'value', value: 'from-file', source: 'SERVICE_TOKEN_FILE' })
    expect(readSecret('SERVICE_TOKEN', { SERVICE_TOKEN_FILE: file('crlf\r\n') })).toMatchObject({ value: 'crlf' })
  })

  it('is unset when neither form (or only empty ones) is given', () => {
    for (const env of [{}, { SERVICE_TOKEN: '' }, { SERVICE_TOKEN_FILE: '' }, { SERVICE_TOKEN: '', SERVICE_TOKEN_FILE: '' }]) expect(readSecret('SERVICE_TOKEN', env).kind).toBe('unset')
  })

  it('refuses when both forms are set', () => {
    const r = readSecret('SERVICE_TOKEN', { SERVICE_TOKEN: 'a', SERVICE_TOKEN_FILE: file('b') }, 'E-X')
    expect(r).toMatchObject({ kind: 'refuse' })
    expect(r.kind === 'refuse' && r.message).toContain('[E-X] refusing to start: both SERVICE_TOKEN and SERVICE_TOKEN_FILE are set')
  })

  it('refuses an unreadable file, naming the path but never a value', () => {
    const r = readSecret('SERVICE_TOKEN', { SERVICE_TOKEN_FILE: join(dir, 'missing') })
    expect(r.kind === 'refuse' && r.message).toContain('cannot be read')
    expect(r.kind === 'refuse' && r.message).toContain(join(dir, 'missing'))
  })

  it('refuses an empty file, including one with only a newline', () => {
    for (const content of ['', '\n', ' \r\n']) {
      const r = readSecret('SERVICE_TOKEN', { SERVICE_TOKEN_FILE: file(content) })
      expect(r.kind === 'refuse' && r.message).toContain('is empty')
    }
  })

  it('secretValue is empty for unset and refused, the value otherwise', () => {
    expect(secretValue('SERVICE_TOKEN', {})).toBe('')
    expect(secretValue('SERVICE_TOKEN', { SERVICE_TOKEN_FILE: join(dir, 'missing') })).toBe('')
    expect(secretValue('SERVICE_TOKEN', { SERVICE_TOKEN: 'a', SERVICE_TOKEN_FILE: file('b') })).toBe('')
    expect(secretValue('SERVICE_TOKEN', { SERVICE_TOKEN_FILE: file('b\n') })).toBe('b')
  })
})

describe('machine credentials from a file', () => {
  it('hasServiceToken matches the inline and the file value, and nothing for a bad setup', () => {
    expect(hasServiceToken(req({ 'x-service-token': 'tok' }), { SERVICE_TOKEN: 'tok' })).toBe(true)
    expect(hasServiceToken(req({ 'x-service-token': 'tok' }), { SERVICE_TOKEN_FILE: file('tok\n') })).toBe(true)
    expect(hasServiceToken(req({ 'x-service-token': 'tok' }), { SERVICE_TOKEN: 'tok', SERVICE_TOKEN_FILE: file('tok') })).toBe(false)
    expect(hasServiceToken(req({ 'x-service-token': '' }), { SERVICE_TOKEN_FILE: file('') })).toBe(false)
  })

  it('hasExportToken matches the inline and the file value, and nothing for a bad setup', () => {
    expect(hasExportToken(req({ 'x-export-token': 'exp' }), { EXPORT_TOKEN: 'exp' })).toBe(true)
    expect(hasExportToken(req({ 'x-export-token': 'exp' }), { EXPORT_TOKEN_FILE: file('exp\n') })).toBe(true)
    expect(hasExportToken(req({ 'x-export-token': 'exp' }), { EXPORT_TOKEN: 'exp', EXPORT_TOKEN_FILE: file('exp') })).toBe(false)
    expect(hasExportToken(req({ 'x-export-token': 'exp' }), { EXPORT_TOKEN_FILE: join(dir, 'missing') })).toBe(false)
  })
})

describe('boot policy with _FILE secrets', () => {
  it('accepts a service token supplied only through SERVICE_TOKEN_FILE', () => {
    const env = { ...oidc, SERVICE_TOKEN_FILE: file('s3cret\n') }
    expect(serviceTokenPolicy(env).kind).toBe('token')
    expect(() => assertBootPolicies(env)).not.toThrow()
  })

  it('accepts both tokens as files, and still keeps them apart', () => {
    const ok = { ...oidc, SERVICE_TOKEN_FILE: file('s'), EXPORT_TOKEN_FILE: file('e') }
    expect(exportTokenPolicy(ok).kind).toBe('export-token')
    expect(() => assertBootPolicies(ok)).not.toThrow()
    expect(() => assertBootPolicies({ ...oidc, SERVICE_TOKEN: 'same', EXPORT_TOKEN_FILE: file('same\n') })).toThrow('[E-EXPORT-TOKEN]')
    expect(() => assertBootPolicies({ ...oidc, SERVICE_TOKEN_FILE: file('same'), EXPORT_TOKEN_FILE: file('same') })).toThrow('[E-EXPORT-TOKEN]')
  })

  it('refuses both forms, an unreadable file and an empty file, even with the development override', () => {
    for (const bad of [
      { SERVICE_TOKEN: 'a', SERVICE_TOKEN_FILE: file('b') },
      { SERVICE_TOKEN_FILE: join(dir, 'missing') },
      { SERVICE_TOKEN_FILE: file('\n') },
      { SERVICE_TOKEN_FILE: join(dir, 'missing'), APIARY_ALLOW_UNAUTH_DEV: '1' },
    ]) {
      expect(serviceTokenPolicy(bad).kind).toBe('refuse')
      expect(() => assertBootPolicies({ ...oidc, ...bad })).toThrow('[E-SERVICE-TOKEN]')
    }
    for (const bad of [{ EXPORT_TOKEN: 'a', EXPORT_TOKEN_FILE: file('b') }, { EXPORT_TOKEN_FILE: join(dir, 'missing') }, { EXPORT_TOKEN_FILE: file('') }]) {
      expect(() => assertBootPolicies({ ...oidc, SERVICE_TOKEN: 's', ...bad })).toThrow('[E-EXPORT-TOKEN]')
    }
  })
})
