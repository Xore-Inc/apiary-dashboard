// One query per backend resource (#309): the server function of
// src/data/queries.ts it reads through, and how fast its answer moves
// (lib/query.ts FRESHNESS). The key is the function's name plus its
// arguments, so the same entity read on two pages is one cache entry and one
// call. Mutations invalidate by these names (`queryKey: [name]` matches every
// argument list).
import { backendGapOf } from '#/lib/backendGap'
import { resource } from '#/lib/query'
import {
  getAgentCampaign,
  getAgentCampaigns,
  getAlertDetail,
  getAlerts,
  getAnalysisResults,
  getAnalyzerCatalog,
  getAnomaly,
  getArtifacts,
  getAsn,
  getAttackers,
  getAuthEvents,
  getCampaign,
  getCanarytokens,
  getCapeRun,
  getCapeRuns,
  getCluster,
  getCommands,
  getCredentials,
  getDeadLetter,
  getDeadLetters,
  getEntityTimeline,
  getEventDetail,
  getEvents,
  getFacets,
  getGhidraAnalysis,
  getGithubAnalyses,
  getGithubAnalysis,
  getIdentity,
  getIdentityFusion,
  getInfraClusters,
  getIoc,
  getIocCatalog,
  getIpProfile,
  getKillChain,
  getLlmAnalyses,
  getLlmAnalysis,
  getMail,
  getMlAnomalies,
  getNetwork,
  getNetworkCampaigns,
  getOpenAlertCount,
  getOverview,
  getOverviewViews,
  getAttackVectors,
  getFilterValues,
  getPayloadAnalysis,
  getPayloadDelivery,
  getPayloads,
  getPreferences,
  getProblemReports,
  getRecordings,
  getRelated,
  getReplayDetail,
  getReports,
  getRevDeckRun,
  getRevDeckRuns,
  getSandboxLiveStatus,
  getSandboxRun,
  getSensorCatalog,
  getSensorDetail,
  getSessionDetail,
  getSessionUser,
  getSettings,
  getShellConfig,
  getSourceEvents,
  getSourceHealth,
  getSourceIdentity,
  getSourceNetwork,
  getSourceProfiles,
  getSourceSessions,
  getSourceTimeline,
  getTopology,
  searchAll,
  searchHistory,
} from './queries'

// ---- the shell: every page reads these -----------------------------------

/** Who is signed in. Every data call still checks the session on the
 * server; this is the navigation guard's read, reused for 30 s. */
export const sessionUserQuery = resource('getSessionUser', getSessionUser, 'normal')
/** The operator's preferences: shape the whole document. */
export const preferencesQuery = resource('getPreferences', getPreferences, 'normal')
/** Presentation, map tiles, feature switches: deployment configuration. */
export const shellConfigQuery = resource('getShellConfig', getShellConfig, 'slow')
/** What the event filters offer (sensors, countries, protocols, ports): a
 * vocabulary that moves over days, so it is not asked again with every
 * visit to the live event list. */
export const filterValuesQuery = resource('getFilterValues', getFilterValues, 'slow')

// ---- live: asked again on every visit, and on focus/reconnect ----------

export const alertsQuery = resource('getAlerts', getAlerts, 'live')
/** The event explorer and live feed: one entry per filter set and page. */
export const eventsQuery = resource('getEvents', getEvents, 'live')
export const sourceHealthQuery = resource('getSourceHealth', getSourceHealth, 'live')
export const sandboxLiveStatusQuery = resource('getSandboxLiveStatus', getSandboxLiveStatus, 'live')

// ---- normal: lists and aggregates, reused for 30 s --------------------------

/** The top bar's bell: refreshed on its own minute and by acknowledging,
 * so a navigation reuses it for 30 s. */
export const openAlertCountQuery = resource('getOpenAlertCount', getOpenAlertCount, 'normal')
export const overviewQuery = resource('getOverview', getOverview, 'normal')
export const overviewViewsQuery = resource('getOverviewViews', getOverviewViews, 'normal')
/** The overview's attack-vectors panel: one sensor per read, so opening the
 * page asks for one aggregation and a sensor switch for another. An empty
 * sensor is the newest one. */
export const attackVectorsQuery = resource('getAttackVectors', getAttackVectors, 'normal')
export const sourceProfilesQuery = resource('getSourceProfiles', getSourceProfiles, 'normal')
export const networkCampaignsQuery = resource('getNetworkCampaigns', getNetworkCampaigns, 'normal')
export const attackersQuery = resource('getAttackers', getAttackers, 'normal')
export const infraClustersQuery = resource('getInfraClusters', getInfraClusters, 'normal')
export const killChainQuery = resource('getKillChain', getKillChain, 'normal')
export const commandsQuery = resource('getCommands', getCommands, 'normal')
export const recordingsQuery = resource('getRecordings', getRecordings, 'normal')
export const authEventsQuery = resource('getAuthEvents', getAuthEvents, 'normal')
export const credentialsQuery = resource('getCredentials', getCredentials, 'normal')
export const canarytokensQuery = resource('getCanarytokens', getCanarytokens, 'normal')
export const payloadsQuery = resource('getPayloads', getPayloads, 'normal')
export const deadLettersQuery = resource('getDeadLetters', getDeadLetters, 'normal')
export const problemReportsQuery = resource('getProblemReports', getProblemReports, 'normal')
export const mlAnomaliesQuery = resource('getMlAnomalies', getMlAnomalies, 'normal')
export const llmAnalysesQuery = resource('getLlmAnalyses', getLlmAnalyses, 'normal')
export const agentCampaignsQuery = resource('getAgentCampaigns', getAgentCampaigns, 'normal')
export const capeRunsQuery = resource('getCapeRuns', getCapeRuns, 'normal')
export const revDeckRunsQuery = resource('getRevDeckRuns', getRevDeckRuns, 'normal')
export const githubAnalysesQuery = resource('getGithubAnalyses', getGithubAnalyses, 'normal')
export const analysisResultsQuery = resource('getAnalysisResults', getAnalysisResults, 'normal')
export const topologyQuery = resource('getTopology', getTopology, 'normal')
export const searchHistoryQuery = resource('searchHistory', searchHistory, 'normal')
export const searchAllQuery = resource('searchAll', searchAll, 'normal')
/** The counted facets: the explorer and the report pickers run without
 * them until the backend serves them (APIARY#3524), so a refusal is a gap. */
export const facetsQuery = resource('getFacets', (...args: Parameters<typeof getFacets>) => backendGapOf(getFacets(...args)), 'normal')
/** A source's own events, sessions and timeline over the chosen range. */
export const sourceEventsQuery = resource('getSourceEvents', getSourceEvents, 'normal')
export const sourceSessionsQuery = resource('getSourceSessions', getSourceSessions, 'normal')
export const sourceTimelineQuery = resource('getSourceTimeline', getSourceTimeline, 'normal')
export const alertDetailQuery = resource('getAlertDetail', getAlertDetail, 'normal')

// ---- slow: detail pages, catalogs, configuration, reports: minutes ---------

export const ipProfileQuery = resource('getIpProfile', getIpProfile, 'slow')
export const asnQuery = resource('getAsn', getAsn, 'slow')
export const campaignQuery = resource('getCampaign', getCampaign, 'slow')
export const networkQuery = resource('getNetwork', getNetwork, 'slow')
export const clusterQuery = resource('getCluster', getCluster, 'slow')
export const identityQuery = resource('getIdentity', getIdentity, 'slow')
export const identityFusionQuery = resource('getIdentityFusion', getIdentityFusion, 'slow')
export const iocQuery = resource('getIoc', getIoc, 'slow')
export const iocCatalogQuery = resource('getIocCatalog', getIocCatalog, 'slow')
export const eventDetailQuery = resource('getEventDetail', getEventDetail, 'slow')
export const sessionDetailQuery = resource('getSessionDetail', getSessionDetail, 'slow')
export const replayDetailQuery = resource('getReplayDetail', getReplayDetail, 'slow')
export const mailQuery = resource('getMail', getMail, 'slow')
export const anomalyQuery = resource('getAnomaly', getAnomaly, 'slow')
export const llmAnalysisQuery = resource('getLlmAnalysis', getLlmAnalysis, 'slow')
export const agentCampaignQuery = resource('getAgentCampaign', getAgentCampaign, 'slow')
export const deadLetterQuery = resource('getDeadLetter', getDeadLetter, 'slow')
export const payloadAnalysisQuery = resource('getPayloadAnalysis', getPayloadAnalysis, 'slow')
export const payloadDeliveryQuery = resource('getPayloadDelivery', getPayloadDelivery, 'slow')
export const capeRunQuery = resource('getCapeRun', getCapeRun, 'slow')
export const revDeckRunQuery = resource('getRevDeckRun', getRevDeckRun, 'slow')
export const githubAnalysisQuery = resource('getGithubAnalysis', getGithubAnalysis, 'slow')
export const ghidraAnalysisQuery = resource('getGhidraAnalysis', getGhidraAnalysis, 'slow')
export const sandboxRunQuery = resource('getSandboxRun', getSandboxRun, 'slow')
export const artifactsQuery = resource('getArtifacts', getArtifacts, 'slow')
export const analyzerCatalogQuery = resource('getAnalyzerCatalog', getAnalyzerCatalog, 'slow')
export const sourceIdentityQuery = resource('getSourceIdentity', getSourceIdentity, 'slow')
export const sourceNetworkQuery = resource('getSourceNetwork', getSourceNetwork, 'slow')
export const sensorDetailQuery = resource('getSensorDetail', getSensorDetail, 'slow')
export const sensorCatalogQuery = resource('getSensorCatalog', getSensorCatalog, 'slow')
export const settingsQuery = resource('getSettings', getSettings, 'slow')
export const reportsQuery = resource('getReports', getReports, 'slow')

/** The related panel and entity timelines: slow aggregates (APIARY#3856,
 * up to 30 s on a heavy source), so kept for minutes once answered. A
 * backend gap is an answer the panel shows (lib/backendGap), never reused. */
export const relatedQuery = resource('getRelated', (...args: Parameters<typeof getRelated>) => backendGapOf(getRelated(...args)), 'slow')
export const entityTimelineQuery = resource('getEntityTimeline', (...args: Parameters<typeof getEntityTimeline>) => backendGapOf(getEntityTimeline(...args)), 'slow')
