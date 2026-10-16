# Authorization matrix

Effective access for every generated HTTP route and every server query. “Viewer” is the canonical user role. A page redirect is navigation behavior; a direct handler or server query returns an HTTP refusal.

## HTTP routes (188)

| Route | Anonymous | Viewer | Admin | Enforcement owner |
|---|---|---|---|---|
| `/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/healthz` | allow | allow | allow | public route handler |
| `/metrics` | token | token | token | `x-service-token`; roles do not grant access |
| `/readyz` | allow | allow | allow | public route handler |
| `/admin` | 307 sign-in | redirect `/` | allow | `_layout` then route `beforeLoad` |
| `/attackers` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/commands` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/history` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/iocs` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ips` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/kill-chain` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/search` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/settings` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/source-health` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/topology` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/watchlist` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/api/live` | 401 | allow | allow | route handler session check |
| `/auth/callback` | allow | allow | allow | public route handler |
| `/auth/login` | allow | allow | allow | public route handler |
| `/auth/logout` | same-origin | same-origin | same-origin | `Origin`/`Referer`; cross-origin 403 |
| `/export/portbridge-manual-blackhole.txt` | 401 (or token) | allow | allow | `x-service-token` = `SERVICE_TOKEN`, else session with `getBlockedIps` access |
| `/agent-campaigns/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/alerts/$key` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/asn/$asn` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/auth-events/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/campaigns/$cidr` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/canarytokens/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/cape/$sha` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/credentials/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/dead-letters/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/event/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/events/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ghidra/$sha` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/github-analysis/$sha` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/identities/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/investigate/cluster` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/investigate/lookup` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/llm-analysis/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ml-anomalies/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/networks/$cidr` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payload-analysis/$hash` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payload-workbench/results` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/problem-reports/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/recordings/$shasum` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/reports/generate` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/reports/history` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/reports/library` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/reports/templates` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/revdeck/$sha` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sandbox/$job` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sandbox/vnc` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sensors/$sensor` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/tty-replay/$shasum` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/api/chart/$name` | 401 | allow | allow | route handler session check |
| `/api/export/$name` | 401 | allow | allow | route handler session check |
| `/api/topology/flow` | 401 | allow | allow | route handler session check |
| `/agent-campaigns/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/alerts/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/auth-events/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/campaigns/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/canarytokens/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/cape/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/clusters/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/credentials/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/dead-letters/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/events/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/github-analysis/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/llm-analysis/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ml-anomalies/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/problem-reports/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/recordings/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/reports/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/revdeck/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sensors/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/agent-campaigns/$id/events` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/agent-campaigns/$id/evidence` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/agent-campaigns/$id/rules` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/alerts/$key/evidence` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/alerts/$key/members` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/asn/$asn/breakdown` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/asn/$asn/events` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/asn/$asn/networks` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/asn/$asn/sources` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/asn/$asn/timeline` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/campaigns/$cidr/breakdown` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/campaigns/$cidr/credentials` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/campaigns/$cidr/sources` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/campaigns/$cidr/timeline` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/campaigns/$cidr/why` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/canarytokens/triggers/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/clusters/$kind/$value` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/events/$id/connection` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/events/$id/iocs` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/events/$id/raw` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/events/$id/session` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/events/$id/source` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/identities/$id/breakdown` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/identities/$id/indicators` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/identities/$id/members` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/identities/$id/timeline` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/identities/$id/why` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/investigate/cidr/$cidr` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/investigate/ip/$ip` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ioc/$kind/$value` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/llm-analysis/$id/behaviors` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/llm-analysis/$id/evidence` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/llm-analysis/$id/raw` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ml-anomalies/$id/event` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ml-anomalies/$id/scores` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ml-anomalies/$id/triage` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/networks/$cidr/breakdown` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/networks/$cidr/campaign` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/networks/$cidr/events` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/networks/$cidr/sources` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/networks/$cidr/timeline` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/cape` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/delivered-by` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/ghidra` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/github` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/indicators` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/revdeck` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/sandbox` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/sessions` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/static` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/timeline` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/recordings/$shasum/attacker` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/recordings/$shasum/sessions` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/reports/definitions/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/reports/generated/$id` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sensors/$sensor/events` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sensors/$sensor/exposure` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sensors/$sensor/health` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sensors/$sensor/leaderboards` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sensors/$sensor/sources` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id/attck` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id/commands` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id/credentials` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id/downloads` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id/mail` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id/raw` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id/recording` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/alerts` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/behavior` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/breakdown` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/commands` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/credentials` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/events` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/identity` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/network` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/payloads` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/sessions` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/timeline` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/api/canarytoken/$id/download` | 401 | allow | allow | route handler session check |
| `/api/payload/$hash/download` | 401 | 403 | allow | route handler session and role checks |
| `/api/raw-report/$kind/$sha` | 401 | allow | allow | route handler session check |
| `/api/recording/$shasum/$format` | 401 | allow | allow | route handler session check |
| `/api/report/$id/pdf` | 401 | allow | allow | route handler session check |
| `/agent-campaigns/$id/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/alerts/$key/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/asn/$asn/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/campaigns/$cidr/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/events/$id/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/identities/$id/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/llm-analysis/$id/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ml-anomalies/$id/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/networks/$cidr/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/payloads/$hash/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/recordings/$shasum/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sensors/$sensor/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sessions/$id/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/sources/$ip/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/clusters/$kind/$value/breakdown` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/clusters/$kind/$value/events` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/clusters/$kind/$value/members` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/clusters/$kind/$value/timeline` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ioc/$kind/$value/breakdown` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ioc/$kind/$value/events` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ioc/$kind/$value/payloads` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ioc/$kind/$value/sessions` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ioc/$kind/$value/sources` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ioc/$kind/$value/timeline` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/api/artifact/$kind/$key/$filename` | 401 | allow | allow | route handler session check |
| `/clusters/$kind/$value/` | 307 sign-in | allow | allow | `_layout` navigation guard |
| `/ioc/$kind/$value/` | 307 sign-in | allow | allow | `_layout` navigation guard |

The two canonical catch-all BFF routes are intentionally absent: browser-selected upstream paths were removed. `src/data/api.ts` owns fixed server-side backend calls and sends the service token. Static assets are served by `server.ts` and contain no protected data.

## Server queries (109)

Every TanStack server function first passes the same-origin middleware in `src/start.ts`. State-changing calls also require `x-csrf-token`; the role decision below is then enforced in `src/data/backend.ts` for both mock and live adapters.

| Query | Anonymous | Viewer | Admin |
|---|---|---|---|
| `abortGpuJob` | 401 | 403 | allow |
| `acknowledgeAllAlerts` | 401 | allow | allow |
| `acknowledgeAllAnomalies` | 401 | 403 | allow |
| `acknowledgeAnomalies` | 401 | 403 | allow |
| `createCanarytoken` | 401 | allow | allow |
| `deleteGeneratedReport` | 401 | 403 | allow |
| `deleteReportDefinition` | 401 | 403 | allow |
| `generatePayloadReport` | 401 | 403 | allow |
| `generateReport` | 401 | 403 | allow |
| `generateReportFrom` | 401 | 403 | allow |
| `getAgentCampaign` | 401 | allow | allow |
| `getAgentCampaigns` | 401 | allow | allow |
| `getAlertDetail` | 401 | allow | allow |
| `getAlerts` | 401 | allow | allow |
| `getAnalysisResults` | 401 | allow | allow |
| `getAnalyzerCatalog` | 401 | allow | allow |
| `getAnomaly` | 401 | allow | allow |
| `getArtifactFile` | 401 | allow | allow |
| `getArtifacts` | 401 | allow | allow |
| `getAsn` | 401 | allow | allow |
| `getAttackers` | 401 | allow | allow |
| `getAuthEvents` | 401 | allow | allow |
| `getBlockedIps` | 401 | allow | allow |
| `getCampaign` | 401 | allow | allow |
| `getCanarytokens` | 401 | allow | allow |
| `getCapeRun` | 401 | allow | allow |
| `getCapeRuns` | 401 | allow | allow |
| `getCluster` | 401 | allow | allow |
| `getCommands` | 401 | allow | allow |
| `getCredentials` | 401 | allow | allow |
| `getDeadLetters` | 401 | allow | allow |
| `getEntityTimeline` | 401 | allow | allow |
| `getEventDetail` | 401 | allow | allow |
| `getEvents` | 401 | allow | allow |
| `getFacets` | 401 | allow | allow |
| `getGhidraAnalysis` | 401 | allow | allow |
| `getGithubAnalyses` | 401 | allow | allow |
| `getGithubAnalysis` | 401 | allow | allow |
| `getIdentity` | 401 | allow | allow |
| `getIdentityFusion` | 401 | allow | allow |
| `getInfraClusters` | 401 | allow | allow |
| `getIoc` | 401 | allow | allow |
| `getIocCatalog` | 401 | allow | allow |
| `getIpProfile` | 401 | allow | allow |
| `getKillChain` | 401 | allow | allow |
| `getLlmAnalyses` | 401 | allow | allow |
| `getLlmAnalysis` | 401 | allow | allow |
| `getMail` | 401 | allow | allow |
| `getMlAnomalies` | 401 | allow | allow |
| `getNetwork` | 401 | allow | allow |
| `getNetworkCampaigns` | 401 | allow | allow |
| `getOpenAlertCount` | 401 | allow | allow |
| `getOverview` | 401 | allow | allow |
| `getOverviewViews` | 401 | allow | allow |
| `getPayloadAnalysis` | 401 | allow | allow |
| `getPayloadDelivery` | 401 | allow | allow |
| `getPayloads` | 401 | allow | allow |
| `getPreferences` | allow | allow | allow |
| `getProblemReports` | 401 | allow | allow |
| `getRecordings` | 401 | allow | allow |
| `getRelated` | 401 | allow | allow |
| `getReplay` | 401 | allow | allow |
| `getReplayDetail` | 401 | allow | allow |
| `getReports` | 401 | allow | allow |
| `getRevDeckRun` | 401 | allow | allow |
| `getRevDeckRuns` | 401 | allow | allow |
| `getSandboxLiveStatus` | 401 | allow | allow |
| `getSandboxRun` | 401 | allow | allow |
| `getSensorCatalog` | 401 | allow | allow |
| `getSensorDetail` | 401 | allow | allow |
| `getSessionDetail` | 401 | allow | allow |
| `getSessionEvents` | 401 | allow | allow |
| `getSessionSummary` | 401 | allow | allow |
| `getSessionUser` | allow | allow | allow |
| `getSettings` | 401 | allow | allow |
| `getShellConfig` | 401 | allow | allow |
| `getSourceEvents` | 401 | allow | allow |
| `getSourceHealth` | 401 | allow | allow |
| `getSourceIdentity` | 401 | allow | allow |
| `getSourceNetwork` | 401 | allow | allow |
| `getSourceProfiles` | 401 | allow | allow |
| `getSourceSessions` | 401 | allow | allow |
| `getSourceTimeline` | 401 | allow | allow |
| `getTopology` | 401 | allow | allow |
| `linkCredentialToken` | 401 | 403 | allow |
| `previewReport` | 401 | allow | allow |
| `provisionCredential` | 401 | 403 | allow |
| `purgeDeadLetters` | 401 | 403 | allow |
| `queuePayloadAction` | 401 | 403 | allow |
| `resolveHash` | 401 | allow | allow |
| `resolveIncidents` | 401 | allow | allow |
| `rollbackConfig` | 401 | 403 | allow |
| `rotateCredential` | 401 | 403 | allow |
| `runServiceAction` | 401 | 403 | allow |
| `saveConfigSection` | 401 | 403 | allow |
| `savePreferences` | 401 | allow | allow |
| `saveReportDefinition` | 401 | 403 | allow |
| `searchAll` | 401 | allow | allow |
| `searchHistory` | 401 | allow | allow |
| `semanticSearch` | 401 | allow | allow |
| `setAlertsAcknowledged` | 401 | allow | allow |
| `setAnomalyDisposition` | 401 | 403 | allow |
| `setIpBlocked` | 401 | 403 | allow |
| `setProblemStatus` | 401 | 403 | allow |
| `setRunChild` | 401 | 403 | allow |
| `simulateIncident` | 401 | allow | allow |
| `startAnalysisRun` | 401 | 403 | allow |
| `submitProblemReport` | 401 | allow | allow |
| `validateConfig` | 401 | allow | allow |
