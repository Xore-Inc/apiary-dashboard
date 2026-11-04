import { describe, expect, it } from 'vitest'
import { credentialFactsOf, credentialStateOf, describeCredentialState } from './credentialState'
import type { CredentialFacts } from './credentialState'

// #271 / APIARY#3213. Each case is one of the ways the three axes can be
// rendered wrongly, and every one of them produces a screen that looks fine.

const SECRET = 'correct-horse-battery-staple-9f2c'

function row(over: CredentialFacts): CredentialFacts {
  return { username: '', auth_type: '', credential_status: '', credential_present: null, credential_indicator_match: false, auth_outcome: '', ...over }
}

describe('describeCredentialState', () => {
  it('renders only the account and a fixed vocabulary, and nothing else on the row', () => {
    const state = describeCredentialState({
      ...row({ username: 'admin', auth_type: 'form', credential_status: 'extracted', credential_present: true, auth_outcome: 'simulated' }),
      body: `password=${SECRET}`,
      headers: { authorization: SECRET },
      password: SECRET,
    } as CredentialFacts)
    expect(state.label).toBe('admin · credential extracted · auth simulated · via form')
    expect(state.label).not.toContain(SECRET)
  })

  it('rule 1: keeps unknown apart from absent', () => {
    const absent = describeCredentialState(row({ credential_status: 'absent', credential_present: false, auth_outcome: 'unknown' }))
    const unknown = describeCredentialState(row({ credential_status: 'unknown', credential_present: null, auth_outcome: 'unknown' }))
    expect(absent.label).toContain('no credential')
    expect(unknown.label).toContain('credential unknown')
    expect(unknown.label).not.toContain('no credential')
    expect(absent.label).not.toBe(unknown.label)
    expect(absent.present).toBe(false)
    expect(unknown.present).toBeNull()
    expect(unknown.tone).toBe('muted')
  })

  it('reports present-but-unparsed as neither mapped nor absent', () => {
    const state = describeCredentialState(row({ credential_status: 'present_unparsed', credential_present: true }))
    expect(state.label).toContain('credential present, not parsed')
    expect(state.label).not.toContain('no credential')
    expect(state.present).toBe(true)
    expect(state.tone).toBe('warning')
  })

  it('rule 2: words the bait indicator as an attempt, not as access', () => {
    const state = describeCredentialState(row({ username: 'admin', credential_status: 'extracted', credential_present: true, credential_indicator_match: true, auth_outcome: 'simulated' }))
    expect(state.label).toContain('bait credential attempted')
    expect(state.label).not.toMatch(/access|bypass|default credential|owned|compromised/i)
    expect(state.tone).toBe('danger')
  })

  it('never infers a real authentication from a status or an outcome default', () => {
    for (const auth_outcome of ['', 'simulated', 'unknown']) {
      const state = describeCredentialState(row({ credential_status: 'extracted', credential_present: true, auth_outcome }))
      expect(state.label).not.toContain('auth real')
    }
  })

  it('rule 3: says a pre-schema document had its credential removed, not that it had none', () => {
    const state = describeCredentialState(row({ username: 'admin', credential_status: '' }))
    expect(state.label).toContain('credentials removed')
    expect(state.label).not.toContain('no credential')
    expect(state.account).toBe('admin')
    expect(describeCredentialState({}).label).toBe('credentials removed')
  })

  it('renders an unrecognised status as its own word rather than a blank', () => {
    expect(describeCredentialState(row({ credential_status: 'partially_read' })).label).toContain('partially_read')
  })

  it('carries the account and the channel through to the cell', () => {
    const state = describeCredentialState(row({ username: 'admin', auth_type: 'basic', credential_status: 'extracted', credential_present: true, auth_outcome: 'simulated' }))
    expect(state.label).toBe('admin · credential extracted · auth simulated · via basic')
  })
})

describe('credentialStateOf', () => {
  it('reads the facts off the sensor object of the two decoys only', () => {
    const fields = { username: 'admin', credential_status: 'unknown', credential_present: null, auth_outcome: 'unknown' }
    expect(credentialStateOf({ sensor: 'http-honeypot', fields })?.label).toBe('admin · credential unknown · auth unknown')
    expect(credentialStateOf({ sensor: 'cisco-asa-honeypot', fields: {} })?.label).toBe('credentials removed')
    // Out-of-scope sensors render as they did before: nothing.
    expect(credentialStateOf({ sensor: 'cowrie', fields })).toBeNull()
  })

  it('drops values of the wrong type rather than coercing them', () => {
    const facts = credentialFactsOf({ credential_status: 3, credential_present: 'yes', credential_indicator_match: 'true' })
    expect(facts.credential_status).toBeUndefined()
    expect(facts.credential_present).toBeNull()
    expect(facts.credential_indicator_match).toBe(false)
  })
})
