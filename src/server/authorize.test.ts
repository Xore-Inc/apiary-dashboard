// The authorization matrix (#5): every query of the data seam against an
// anonymous caller, a viewer and an admin, enforced by the backend itself.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveQuery } from '#/data/api'
import { queryNames } from '#/data/backend'
import { asApiError } from '#/data/errors'
import type { SessionUser } from '#/data/types'
import { ADMIN_READS, PUBLIC_QUERIES, authorize, isAdminOnly, isRead } from './authorize'

const viewer: SessionUser = { name: 'Analyst', email: 'analyst@example.test', roles: ['viewer'] }
const admin: SessionUser = { name: 'Operator', email: 'operator@example.test', roles: ['admin'] }

describe('authorization matrix', () => {
  it.each(queryNames().map((name) => [name]))('%s', (name) => {
    const expected = PUBLIC_QUERIES.has(name) ? ['allowed', 'allowed', 'allowed'] : isAdminOnly(name) ? ['sign-in', 'admin-only', 'allowed'] : ['sign-in', 'allowed', 'allowed']
    expect([authorize(name, null), authorize(name, viewer), authorize(name, admin)]).toEqual(expected)
  })

  it('names only queries that exist', () => {
    const names = new Set<string>(queryNames())
    expect([...ADMIN_READS, ...PUBLIC_QUERIES].filter((name) => !names.has(name))).toEqual([])
  })

  it('keeps the canonical admin-only writes admin-only', () => {
    // Canonical's 30 admin-only functions, by this dashboard's names (see
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
    // Every query a viewer may run is a read.
    const viewerMay = queryNames().filter((name) => authorize(name, viewer) === 'allowed')
    expect(viewerMay.filter((name) => !isRead(name))).toEqual([])
  })
})

// The live tier applies the decision before it calls the backend, so a
// refusal never reaches the network; nothing here is fetched.
describe('the live tier enforces it', () => {
  beforeEach(() => vi.stubEnv('BACKEND_URL', 'http://backend.example.test:8080'))
  afterEach(() => vi.unstubAllEnvs())

  const failure = async (name: string, user: SessionUser | null, ...args: unknown[]) => {
    try {
      await liveQuery(name, user)!(...args)
    } catch (e) {
      return asApiError(e)?.kind
    }
    return undefined
  }

  it('without a session: refused with expired, and nobody is signed in', async () => {
    expect(await failure('getEvents', null, {})).toBe('expired')
    expect(await failure('setIpBlocked', null, '198.51.100.1', true)).toBe('expired')
    expect(await liveQuery('getSessionUser', null)!()).toBeNull()
  })

  it('a viewer is refused every write and every admin-only read', async () => {
    for (const name of queryNames().filter(isAdminOnly)) expect(await failure(name, viewer), name).toBe('forbidden')
  })

  it('an admin is not refused', async () => {
    expect(await liveQuery('getSessionUser', admin)!()).toEqual(admin)
  })
})
