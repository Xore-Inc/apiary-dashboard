// Who may run which query: the canonical permissions (see
// docs/migration/server-functions.md), enforced on the server for every
// call. Pages only mirror them to disable what a role cannot do.
import type { SessionUser } from '#/data/types'

/** Needed before sign-in: the navigation guard asks who is signed in, and
 * the sign-in pages render with the (default) preferences. */
export const PUBLIC_QUERIES: ReadonlySet<string> = new Set(['getSessionUser', 'getPreferences'])

/** Refused to anyone but an admin, as canonical refuses them in the handler
 * (its 30 admin-only functions, under the mock's names). */
export const ADMIN_QUERIES: ReadonlySet<string> = new Set([
  // Sources and operations
  'setIpBlocked',
  'purgeDeadLetters',
  'setProblemStatus',
  // Settings
  'saveConfigSection',
  'rollbackConfig',
  'runServiceAction',
  // ML anomalies
  'acknowledgeAnomalies',
  'acknowledgeAllAnomalies',
  'setAnomalyDisposition',
  // Reports
  'saveReportDefinition',
  'deleteReportDefinition',
  'generateReport',
  'generateReportFrom',
  'deleteGeneratedReport',
  // Evidence and analysis
  'startAnalysisRun',
  'setRunChild',
  'abortGpuJob',
  'queuePayloadAction',
  'generatePayloadReport',
  // The live detonation's VNC bridge (dash#305)
  'getSandboxVncBridge',
  // Bait credentials
  'provisionCredential',
  'rotateCredential',
  'linkCredentialToken',
])

export type Decision = 'allowed' | 'sign-in' | 'admin-only'

export function authorize(query: string, user: SessionUser | null): Decision {
  if (PUBLIC_QUERIES.has(query)) return 'allowed'
  if (!user) return 'sign-in'
  if (ADMIN_QUERIES.has(query) && !user.roles.includes('admin')) return 'admin-only'
  return 'allowed'
}
