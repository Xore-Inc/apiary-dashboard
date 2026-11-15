// Every write the dashboard makes, as a mutation (#309, lib/mutation.ts):
// the server function, the resources it changes (invalidated when it lands,
// so no page keeps a stale answer), and for the writes safe to show before
// the server confirms them, the optimistic change (rolled back on refusal).
// The server functions are the same as before: CSRF, actor assertions and
// the sign-in flow are unchanged.
import type { QueryClient } from '@tanstack/react-query'
import type { DataMutation } from '#/lib/mutation'
import {
  abortGpuJob,
  acknowledgeAllAlerts,
  acknowledgeAllAnomalies,
  acknowledgeAnomalies,
  createCanarytoken,
  deleteGeneratedReport,
  deleteReportDefinition,
  generateReport,
  generateReportFrom,
  linkCredentialToken,
  provisionCredential,
  purgeDeadLetters,
  queuePayloadAction,
  resolveIncidents,
  rollbackConfig,
  rotateCredential,
  runServiceAction,
  saveConfigSection,
  savePreferences,
  setAlertsAcknowledged,
  setAnomalyDisposition,
  setIpBlocked,
  setProblemStatus,
  setRunChild,
  simulateIncident,
  startAnalysisRun,
  submitProblemReport,
} from './queries'
import {
  alertDetailQuery,
  alertsQuery,
  analysisResultsQuery,
  anomalyQuery,
  canarytokensQuery,
  capeRunQuery,
  credentialsQuery,
  deadLetterQuery,
  deadLettersQuery,
  ghidraAnalysisQuery,
  githubAnalysisQuery,
  ipProfileQuery,
  mlAnomaliesQuery,
  openAlertCountQuery,
  payloadAnalysisQuery,
  preferencesQuery,
  problemReportsQuery,
  reportsQuery,
  revDeckRunQuery,
  sandboxRunQuery,
  settingsQuery,
  shellConfigQuery,
  sourceHealthQuery,
  sourceProfilesQuery,
} from './resources'
import type { AlertDetail } from './queries'
import type { AlertGroup, Preferences } from './types'

type Args<TFn extends (...args: never[]) => unknown> = Parameters<TFn>
type Result<TFn extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<TFn>>

/** A write whose arguments are the server function's, as a tuple. */
const plain = <TFn extends (...args: never[]) => Promise<unknown>>(fn: TFn, invalidates: DataMutation<Args<TFn>, Result<TFn>>["invalidates"]): DataMutation<Args<TFn>, Result<TFn>> => ({
  write: (args) => fn(...args) as Promise<Result<TFn>>,
  invalidates,
})

// ---- preferences: optimistic, the whole app renders with them ----------------

export const savePreferencesWrite = (): DataMutation<Preferences, void> => ({
  write: (next) => savePreferences(next),
  invalidates: [preferencesQuery.key],
  optimistic: (queryClient, next) => queryClient.setQueryData(preferencesQuery().queryKey, next),
})

// ---- alerts: acknowledging is optimistic ------------------------------------

const ALERT_READS = [alertsQuery.key, alertDetailQuery.key, openAlertCountQuery.key]

/** A group with these member keys set to `acknowledged`. */
const acknowledgeIn = (group: AlertGroup, keys: string[] | 'all', acknowledged: boolean): AlertGroup => {
  const hit = (key: string) => keys === 'all' || keys.includes(key)
  if (!group.members.some((m) => hit(m.key))) return group
  const members = group.members.map((m) => (hit(m.key) ? { ...m, acknowledged } : m))
  return { ...group, members, acknowledged: members.every((m) => m.acknowledged) }
}

/** The alert lists, details and the bell's count as they will read. */
const showAcknowledged = (queryClient: QueryClient, keys: string[] | 'all', acknowledged: boolean) => {
  queryClient.setQueryData(alertsQuery().queryKey, (groups) => groups?.map((g) => acknowledgeIn(g, keys, acknowledged)))
  queryClient.setQueriesData<AlertDetail | null>({ queryKey: alertDetailQuery.key }, (detail) => (detail ? { ...detail, group: acknowledgeIn(detail.group, keys, acknowledged) } : detail))
  queryClient.setQueryData(openAlertCountQuery().queryKey, (count) => {
    if (count === undefined) return count
    const groups = queryClient.getQueryData(alertsQuery().queryKey)
    return groups ? groups.filter((g) => !g.acknowledged).reduce((sum, g) => sum + g.members.length, 0) : count
  })
}

export const acknowledgeAlertsWrite = (): DataMutation<{ keys: string[]; acknowledged: boolean }, number> => ({
  write: ({ keys, acknowledged }) => setAlertsAcknowledged(keys, acknowledged),
  invalidates: ALERT_READS,
  optimistic: (queryClient, { keys, acknowledged }) => showAcknowledged(queryClient, keys, acknowledged),
})

export const acknowledgeAllAlertsWrite = (): DataMutation<void, Result<typeof acknowledgeAllAlerts>> => ({
  write: () => acknowledgeAllAlerts(),
  invalidates: ALERT_READS,
  optimistic: (queryClient) => showAcknowledged(queryClient, 'all', true),
})

// ---- the rest: invalidated when the server confirms ---------------------------

const ANOMALY_READS = [mlAnomaliesQuery.key, anomalyQuery.key]
export const acknowledgeAnomaliesWrite = () => plain(acknowledgeAnomalies, ANOMALY_READS)
export const acknowledgeAllAnomaliesWrite = () => plain(acknowledgeAllAnomalies, ANOMALY_READS)
export const setAnomalyDispositionWrite = () => plain(setAnomalyDisposition, ANOMALY_READS)

export const setIpBlockedWrite = () => plain(setIpBlocked, ([ip]) => [ipProfileQuery(ip).queryKey, sourceProfilesQuery.key])

export const purgeDeadLettersWrite = () => plain(purgeDeadLetters, [deadLettersQuery.key, deadLetterQuery.key, sourceHealthQuery.key])

const REPORT_READS = [reportsQuery.key]
export const deleteGeneratedReportWrite = () => plain(deleteGeneratedReport, REPORT_READS)
export const deleteReportDefinitionWrite = () => plain(deleteReportDefinition, REPORT_READS)
export const generateReportWrite = () => plain(generateReport, REPORT_READS)
export const generateReportFromWrite = () => plain(generateReportFrom, REPORT_READS)

const BAIT_READS = [credentialsQuery.key, canarytokensQuery.key]
export const createCanarytokenWrite = () => plain(createCanarytoken, BAIT_READS)
export const provisionCredentialWrite = () => plain(provisionCredential, BAIT_READS)
export const rotateCredentialWrite = () => plain(rotateCredential, BAIT_READS)
export const linkCredentialTokenWrite = () => plain(linkCredentialToken, BAIT_READS)

export const setProblemStatusWrite = () => plain(setProblemStatus, [problemReportsQuery.key])
export const submitProblemReportWrite = () => ({ ...plain(submitProblemReport, [problemReportsQuery.key]), reloadRoutes: false })

/** A queued analysis changes what the payload's pages and the workbench show. */
const analysisReads = (hash?: string) =>
  hash
    ? [payloadAnalysisQuery(hash).queryKey, ghidraAnalysisQuery(hash).queryKey, sandboxRunQuery(hash).queryKey, capeRunQuery(hash).queryKey, revDeckRunQuery(hash).queryKey, githubAnalysisQuery(hash).queryKey, analysisResultsQuery.key]
    : [analysisResultsQuery.key]
export const queuePayloadActionWrite = () => plain(queuePayloadAction, ([hash]) => analysisReads(hash))
export const startAnalysisRunWrite = () => plain(startAnalysisRun, ([run]) => analysisReads(run.hash))
export const abortGpuJobWrite = () => plain(abortGpuJob, [analysisResultsQuery.key])
export const setRunChildWrite = () => plain(setRunChild, [analysisResultsQuery.key])

const CONFIG_READS = [settingsQuery.key, shellConfigQuery.key]
export const saveConfigSectionWrite = () => plain(saveConfigSection, CONFIG_READS)
export const rollbackConfigWrite = () => plain(rollbackConfig, CONFIG_READS)
export const runServiceActionWrite = () => plain(runServiceAction, [settingsQuery.key])

/** Development: the mock's incidents change source health. */
export const simulateIncidentWrite = () => ({ ...plain(simulateIncident, [sourceHealthQuery.key]), reloadRoutes: false })
export const resolveIncidentsWrite = () => ({ ...plain(resolveIncidents, [sourceHealthQuery.key]), reloadRoutes: false })

