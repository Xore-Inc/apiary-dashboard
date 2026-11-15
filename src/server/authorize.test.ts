// The authorization matrix (#5): every query of the data seam against an
// anonymous caller, a viewer and an admin, enforced by the backend itself.
import { describe, expect, it } from 'vitest'
import { backend, queryNames } from '#/data/backend'
import { asApiError } from '#/data/errors'
import type { SessionUser } from '#/data/types'
import { ADMIN_READS, MOCK_CONTROLS, PUBLIC_QUERIES, authorize, isAdminOnly, isRead } from './authorize'

const viewer: SessionUser = { name: 'Analyst', email: 'analyst@example.test', roles: ['viewer'] }
const admin: SessionUser = { name: 'Operator', email: 'operator@example.test', roles: ['admin'] }

describe('authorization matrix', () => {
  it.each(queryNames().map((name) => [name]))('%s', (name) => {
    const expected = PUBLIC_QUERIES.has(name) ? ['allowed', 'allowed', 'allowed'] : isAdminOnly(name) ? ['sign-in', 'admin-only', 'allowed'] : ['sign-in', 'allowed', 'allowed']
    expect([authorize(name, null), authorize(name, viewer), authorize(name, admin)]).toEqual(expected)
  })

  it('names only queries that exist', () => {
    const names = new Set<string>(queryNames())
    expect([...ADMIN_READS, ...MOCK_CONTROLS, ...PUBLIC_QUERIES].filter((name) => !names.has(name))).toEqual([])
  })

  it('keeps the canonical admin-only writes admin-only', () => {
    // Canonical's 30 admin-only functions, by the mock's names (see
    // docs/migration/server-functions.md).
    for (const name of ['setIpBlocked', 'purgeDeadLetters', 'setProblemStatus', 'saveConfigSection', 'rollbackConfig', 'runServiceAction', 'acknowledgeAnomalies', 'acknowledgeAllAnomalies', 'setAnomalyDisposition', 'saveReportDefinition', 'deleteReportDefinition', 'generateReport', 'deleteGeneratedReport', 'startAnalysisRun', 'abortGpuJob', 'queuePayloadAction', 'generatePayloadReport', 'provisionCredential', 'rotateCredential', 'linkCredentialToken'])
      expect(isAdminOnly(name), name).toBe(true)
  })

  it('leaves a viewer no write at all (APIARY#3857)', () => {
    // What canonical left to any signed-in operator is admin-only now:
    // alert ack and reopen (one query each way), canarytoken creation,
    // preferences, problem reports, config validation and report preview.
    for (const name of ['setAlertsAcknowledged', 'acknowledgeAllAlerts', 'createCanarytoken', 'savePreferences', 'submitProblemReport', 'validateConfig', 'previewReport'])
      expect(authorize(name, viewer), name).toBe('admin-only')
    // Every query a viewer may run is a read (or the mock's own switch).
    const viewerMay = queryNames().filter((name) => authorize(name, viewer) === 'allowed')
    expect(viewerMay.filter((name) => !isRead(name) && !MOCK_CONTROLS.has(name))).toEqual([])
  })
})

describe('the backend enforces it', () => {
  const failure = async (run: () => Promise<unknown>) => {
    try {
      await run()
    } catch (e) {
      return asApiError(e)?.kind
    }
    return undefined
  }

  it('without a session: only the public queries answer', async () => {
    const q = backend('normal', null)
    expect(await failure(() => q.getEvents({}))).toBe('expired')
    expect(await q.getSessionUser()).toBeNull()
    expect(await failure(() => q.getPreferences())).toBeUndefined()
  })

  it('a viewer reads everything and is refused every write', async () => {
    const q = backend('normal', viewer)
    expect(await failure(() => q.getEvents({}))).toBeUndefined()
    expect(await failure(() => q.getPreferences())).toBeUndefined()
    expect(await failure(() => q.setIpBlocked('198.51.100.1', true))).toBe('forbidden')
    expect(await failure(() => q.acknowledgeAllAnomalies())).toBe('forbidden')
    expect(await failure(() => q.acknowledgeAllAlerts())).toBe('forbidden')
    expect(await failure(() => q.submitProblemReport({} as never))).toBe('forbidden')
    expect(await failure(() => q.savePreferences({} as never))).toBe('forbidden')
  })

  it('an admin may make them', async () => {
    const q = backend('normal', admin)
    expect(await failure(() => q.setIpBlocked('198.51.100.1', true))).toBeUndefined()
    await q.setIpBlocked('198.51.100.1', false)
    expect(await q.getSessionUser()).toEqual(admin)
  })
})
