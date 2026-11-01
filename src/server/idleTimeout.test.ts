import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUN_MAX_IDLE_TIMEOUT_S, idleTimeoutPolicy } from './idleTimeout'

const seconds = (env: Record<string, string>) => {
  const policy = idleTimeoutPolicy(env)
  if (policy.kind !== 'seconds') throw new Error(policy.message)
  return policy.seconds
}

describe('idleTimeoutPolicy', () => {
  it('outlasts the backend timeout by default, never Bun\'s 10 s', () => {
    expect(seconds({})).toBe(120)
    expect(seconds({ BACKEND_TIMEOUT_MS: '45000' })).toBe(180)
    expect(seconds({ BACKEND_TIMEOUT_MS: '200' })).toBe(6)
    expect(seconds({ BACKEND_TIMEOUT_MS: '100000' })).toBe(BUN_MAX_IDLE_TIMEOUT_S)
    expect(seconds({ BACKEND_TIMEOUT_MS: 'nonsense' })).toBe(120)
  })

  it('takes an explicit window that still covers one backend call', () => {
    expect(seconds({ BFF_IDLE_TIMEOUT_S: '60' })).toBe(60)
    expect(seconds({ BFF_IDLE_TIMEOUT_S: '35' })).toBe(35)
  })

  it('refuses a window that would cut slow answers again, or that Bun rejects', () => {
    for (const value of ['10', '34', '0', '-5', '1.5', 'abc', '256']) {
      expect(idleTimeoutPolicy({ BFF_IDLE_TIMEOUT_S: value }).kind, value).toBe('refuse')
    }
    expect(idleTimeoutPolicy({ BFF_IDLE_TIMEOUT_S: '200', BACKEND_TIMEOUT_MS: '300000' }).kind).toBe('refuse')
  })

  it('is what the production server passes to Bun.serve', () => {
    const server = readFileSync(join(import.meta.dirname, '../../server.ts'), 'utf8')
    expect(server).toMatch(/Bun\.serve\(\{[\s\S]*idleTimeout: serverIdleTimeoutSeconds\(\)/)
  })
})
