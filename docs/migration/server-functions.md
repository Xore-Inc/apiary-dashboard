# Server functions

Every `createServerFn` of the canonical dashboard (`Xore/APIARY@62ee45d`), read from the source by `scripts/inventory/server-functions.ts`. Data: `server-functions.json`. The rewrite deliberately consolidates route-local functions behind `src/data/queries.ts`; **Rewrite owner** names the destination seam and type mapper. Every query has a live adapter: `LIVE` in `src/data/api.ts` implements the whole contract.

**153 functions** in 58 files: 114 GET, 39 POST; 55 called from a route loader.

**Security owner.** Every function runs behind the global function middleware in `src/start.ts`: a same-origin check (CSRF, #3109), then a session (`sessionGate.server.ts`); only `src/lib/auth.ts` is exempt from the session part. On top of that:

- public: works before sign-in (the root guard resolves the session with it) (2)
- session: the global middleware (same-origin check, then a session) (106)
- session+: the global middleware, and the handler checks the session again (15)
- admin: the global middleware, and the handler refuses anyone but an admin (30)

## Findings

Declared but called from nowhere in the source, so not carried over unless a caller turns up:

- `src/components/CapturedMail.tsx#fetchMail` (L35)

## `src/components/ArtifactList.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchArtifacts` (L15) | GET | { kind: string; key: string } → { rows: ArtifactRow[] } \| null | `GET /api/v1/artifacts/{kind}/{key}` | session | ArtifactList | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/components/AttackerGraph.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchGraph` (L21) | GET | { id: string } → Graph \| null | `GET /api/v1/attackers-graph?id={id}` | session | AttackerGraph | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/components/CapturedMail.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchMail` (L35) | GET | { id: string } → Mail \| null | `GET /api/v1/mail/{id}` | session | — | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchMailDetailed` (L121) | GET | { id: string } → MailFetch | `GET /api/v1/mail/{id}` | session | load | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |

## `src/components/CommandPalette.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `searchFn` (L19) | GET | { q: string } → SearchResult \| null | `GET /api/v1/search?q={q}` | session | CommandPalette | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #81 |

## `src/components/CuratedSensorViews.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchSensors` (L80) | GET | — → SensorDetail \| null | `GET /api/v1/sensors` | session | CuratedSensorView | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |

## `src/components/EsHistoryConsole.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchConsoleHistory` (L18) | GET | { q: string } → ConsolePage \| null | `GET /api/v1/events?offset=0&size=50&since=90d{query}` | session | run | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #81 |

## `src/components/GhidraCallGraph.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCallGraph` (L28) | GET | { sha: string } → Graph \| null | `GET /api/v1/ghidra-callgraph/{sha}` | session | GhidraCallGraph | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/components/LiveToasts.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchSourceHealth` (L74) | GET | — → SourceHealth \| null | `GET /api/v1/source-health` | session | LiveToasts | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #81 |

## `src/components/OverviewPanels.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchVectors` (L119) | GET | { sensor: string } → Vectors \| null | `GET /api/v1/attack-vectors?sensor={sensor}` | session | AttackVectors | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #81 |

## `src/components/ProblemReportButton.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `submitReport` (L34) | POST | { page: string expected: string actual: string action_trail: ActionEntry[] console_errors: string[] network_failures: string[] api_calls: ApiCallEntry[] dom_snapshot: string user_agent: string } → { ok: boolean; error?: string } | `POST /api/v1/problem-reports?{query}` | session+ | submit | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |

## `src/components/Topbar.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchOpenAlertCount` (L16) | GET | — → number | `GET /api/v1/alerts?size=100` | session | useOpenAlertCount | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #81 |

## `src/lib/auth.ts`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `getAccountActions` (L17) | GET | — → AccountActions | — | public | `routes/settings.tsx` loader **(loader)** | `src/server/session.ts`<br>`src/server/oidc.server.ts`<br>`src/server/authorize.ts` | #5 |
| `getSessionUser` (L22) | GET | — → User \| null | — | public | `routes/__root.tsx` beforeLoad; `routes/credentials.tsx` module; `routes/credentials.tsx` loader; `routes/payload-analysis.$hash.tsx` module; `routes/payload-analysis.$hash.tsx` loader; `routes/payload-workbench.results.tsx` module; `routes/payload-workbench.results.tsx` loader; `routes/reports.tsx` module; `routes/reports.tsx` loader; `routes/settings.tsx` module; `routes/settings.tsx` loader **(loader)** | `src/server/session.ts`<br>`src/server/oidc.server.ts`<br>`src/server/authorize.ts` | #5 |

## `src/lib/prefs.ts`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchAppearance` (L72) | GET | — → Appearance | `GET /api/v1/preferences?{query}` | session+ | pullAppearance | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchLiveToastPrefs` (L284) | GET | — → LiveToastPrefs | `GET /api/v1/preferences?{query}` | session+ | pullLiveToastPrefs | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchMapPrefs` (L319) | GET | — → MapPrefs | `GET /api/v1/preferences?{query}` | session+ | pullMapPrefs | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `pushAppearancePreference` (L35) | POST | { theme?: ThemeMode; palette?: string } → void | `GET /api/v1/preferences?{query}`<br>`PUT /api/v1/preferences` | session+ | applyTheme; applyPalette | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |

## `src/routes/__root.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchShellConfig` (L36) | GET | — → ShellConfig | `GET /api/v1/config` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `getAppearance` (L87) | GET | — → Appearance | — | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |

## `src/routes/agent-campaigns.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchPage` (L51) | GET | { offset: number } → StorePage&lt;AgentCampaignRow> \| null | `GET /api/v1/store/agent-campaigns?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |

## `src/routes/alerts.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `acknowledgeAlert` (L101) | POST | { key: string; ack: boolean } → void | `POST /api/v1/alerts/{key}/ack` | session+ | Alerts | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `acknowledgeAll` (L144) | POST | — → number | `GET /api/v1/alerts?offset={offset}&size=100`<br>`POST /api/v1/alerts/{key}/ack` | session+ | Alerts | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `acknowledgeKeys` (L120) | POST | { keys: string[]; ack: boolean } → number | `POST /api/v1/alerts/{key}/ack` | session+ | Alerts | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `fetchAlerts` (L88) | GET | — → BoardFetch | `GET /api/v1/alerts?offset={offset}&size=100` | session | loader; Alerts **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |

## `src/routes/attackers.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchAttackers` (L45) | GET | { offset: number } → Page \| null | `GET /api/v1/attackers?offset={offset}&size=25` | session | loader; Attackers **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/routes/auth-events.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchPage` (L14) | GET | { offset: number } → StorePage \| null | `GET /api/v1/store/auth-events?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchStatsWindow` (L26) | GET | — → StorePage \| null | `GET /api/v1/store/auth-events?offset=0&size=200` | session | AuthStats | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |

## `src/routes/campaigns.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCampaigns` (L42) | GET | — → { total: number; rows: CampaignRow[]; } \| null | `GET /api/v1/campaigns?size=100` | session | loader; Campaigns **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |
| `fetchCredReuse` (L62) | GET | — → CredEdge[] \| null | `GET /api/v1/cred-reuse` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/routes/canarytokens.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `createToken` (L57) | POST | { token_type: string memo: string include_text_snippet?: boolean text_snippet?: string file_base64?: string file_name?: string file_content_type?: string } → { ok: boolean; error?: string } | `POST /api/v1/canarytokens` | session+ | MintForm | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |
| `fetchFired` (L44) | GET | — → FiredPage \| null | `GET /api/v1/events?sensor=canarytokens&size=50&since=365d` | session | FiredTokens | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |
| `fetchPage` (L24) | GET | { offset: number } → StorePage \| null | `GET /api/v1/store/canarytokens?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |
| `fetchTypes` (L52) | GET | — → TokenType[] \| null | `GET /api/v1/canarytokens/types` | session | MintForm | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |

## `src/routes/cape.$sha.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchRun` (L58) | GET | { sha: string } → RunFetch | `GET /api/v1/cape/{sha}` | session | loader; CapeDetail **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/cape.index.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchPage` (L13) | GET | { offset: number } → StorePage \| null | `GET /api/v1/store/cape?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/clusters.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchClusters` (L23) | GET | — → Page \| null | `GET /api/v1/clusters?size=100` | session | loader; Clusters **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/routes/commands.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCommands` (L25) | GET | { offset: number } → Page \| null | `GET /api/v1/events?kind=command&offset={offset}&size=25` | session | loader; Commands **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |

## `src/routes/credentials.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `createCredential` (L52) | POST | { path: string; username: string; password: string; memo: string; content_template: string } → { ok: boolean; error?: string } | `POST /api/v1/credentials` | admin | ProvisionForm | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |
| `fetchCredentials` (L38) | GET | — → CredentialsResponse \| null | `GET /api/v1/credentials` | session | refresh; Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |
| `fetchLinkableTokens` (L46) | GET | — → TokenRecord[] | `GET /api/v1/canarytokens` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |
| `linkCredentialToken` (L86) | POST | { id: string; token_id: string } → { ok: boolean; error?: string } | `POST /api/v1/credentials/{id}/link-token` | admin | applyLink | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |
| `rotateCredential` (L70) | POST | { id: string; password: string } → { ok: boolean; error?: string } | `POST /api/v1/credentials/{id}/rotate` | admin | rotate | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/tools.ts` | #80 |

## `src/routes/dead-letters.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchPage` (L16) | GET | { offset: number; q: string } → StorePage \| null | `GET /api/v1/store/dead-letters?{query}` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `purgeDeadLetters` (L25) | POST | { q: string } → { ok: boolean; deleted?: number; error?: string } | `DELETE /api/v1/store/dead-letters?{query}` | admin | doPurge | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |

## `src/routes/event.$id.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchEvent` (L72) | GET | { id: string } → EventFetch | `GET /api/v1/event/{id}` | session | loader; EventDetailPage **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |

## `src/routes/events.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchEvents` (L137) | GET | { offset: number; filters?: EventFilters } → EventsPage \| null | `GET /api/v1/events?{params}` | session | loader; Events **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |
| `fetchFilterValues` (L148) | GET | — → FilterValues \| null | `GET /api/v1/filter-values` | session | Events | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |
| `fetchInvestigationConfig` (L164) | GET | — → InvestigationConfig | — | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |

## `src/routes/ghidra.$sha.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchRun` (L164) | GET | { sha: string } → RunFetch | `GET /api/v1/ghidra/{sha}` | session | loader; GhidraDetail **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `submitReanalysis` (L177) | POST | { hash: string } → SubmitResult | `POST /api/v1/ghidra/submit (mounted)` | admin | reanalyze | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/github-analysis.$sha.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchRun` (L48) | GET | { sha: string } → RunFetch | `GET /api/v1/github-analysis/{sha}` | session | loader; GithubAnalysisDetail **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `resubmitAnalysis` (L61) | POST | { hash: string } → { ok: boolean; error?: string } | `POST /api/v1/github-analysis/submit (mounted)` | admin | GithubAnalysisDetail | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/github-analysis.index.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchPage` (L13) | GET | { offset: number } → StorePage \| null | `GET /api/v1/store/github-analysis?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/history.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchHistory` (L26) | GET | { offset: number; q: string } → Page \| null | `GET /api/v1/events?offset={offset}&size=50&since=90d{query}` | session | loader; History **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |

## `src/routes/index.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCampaignsSummary` (L110) | GET | — → { total: number; rows: StoreRow[]; } \| null | `GET /api/v1/campaigns?size=15` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchDashboard` (L95) | GET | string[] → Dashboard \| null | `GET /api/v1/overview/dashboard{query}` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchKpis` (L84) | GET | — → OverviewKpis \| null | `GET /api/v1/overview/kpis` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchPayloadsSummary` (L115) | GET | — → { total: number; rows: StoreRow[]; } \| null | `GET /api/v1/payloads?size=15` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchPresentation` (L89) | GET | — → Presentation \| null | `GET /api/v1/config` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchRecent` (L105) | GET | — → { total: number; rows: EventRow[]; } \| null | `GET /api/v1/events?size=18` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |

## `src/routes/investigate.cidr.$cidr.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCorrelation` (L42) | GET | { cidr: string } → CidrCorrelation \| null | `GET /api/v1/investigate/cidr/{cidr}` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/routes/investigate.cluster.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCorrelation` (L47) | GET | SearchParams → ClusterCorrelation \| null | `GET /api/v1/investigate/cluster?{query}` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/routes/investigate.ip.$ip.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchBlockState` (L84) | GET | { ip: string } → BlockState \| null | `GET /api/v1/ip-block/{ip}` | session | BlockControl; apply | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |
| `fetchProfile` (L75) | GET | { ip: string } → ProfileFetch | `GET /api/v1/investigate/ip/{ip}` | session | loader; InvestigateIp **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |
| `setBlock` (L92) | POST | { ip: string; blocked: boolean; expires_days?: number } → boolean | `POST /api/v1/ip-block` | admin | apply | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/routes/investigate.lookup.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `resolveHashKind` (L57) | GET | { value: string } → HashKindFetch | `GET /api/v1/investigate/cluster?{query}` | session | submit | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/routes/ips.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchMapPoints` (L38) | GET | — → MapPoint[] \| null | `GET /api/v1/overview/dashboard?parts=map_points` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |
| `fetchSources` (L26) | GET | { offset: number } → SourcesPage \| null | `GET /api/v1/sources?offset={offset}&size=25` | session | loader; Sources **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/sources.ts` | #76 |

## `src/routes/llm-analysis.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchPage` (L99) | GET | { offset: number } → StorePage \| null | `GET /api/v1/store/llm-analysis?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `semanticSearch` (L13) | GET | { q: string } → SemanticResult \| null | `GET /api/v1/llm-search?q={q}` | session | SemanticSearchCard | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |

## `src/routes/ml-anomalies.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `ackAll` (L175) | POST | — → number \| null | `POST /api/v1/ml-anomalies/ack-all` | admin | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchAcks` (L40) | GET | — → Record&lt;string, AckRecord> \| null | `GET /api/v1/ml-anomalies/acks` | session | refreshAcks | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchBacklog` (L335) | GET | — → Backlog \| null | `GET /api/v1/ml-anomalies/stats` | session | refreshBacklog; Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchModelHealth` (L58) | GET | — → ModelHealth[] \| null | `GET /api/v1/ml-health` | session | ModelHealthCard | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchPage` (L278) | GET | { offset: number } → StorePage \| null | `GET /api/v1/store/ml-anomalies?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `fetchStats` (L299) | GET | — → KpiStats \| null | `GET /api/v1/store/ml-anomalies?offset=0&size=100&q={window}`<br>`GET /api/v1/store/ml-anomalies?offset=100&size=100&q={window}` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `setAck` (L138) | POST | { key: string; ack: boolean } → boolean | `POST /api/v1/ml-anomalies/ack` | admin | AckControl | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |
| `setDisposition` (L156) | POST | { key: string; status: string; reason?: string } → boolean | `POST /api/v1/ml-anomalies/disposition` | admin | apply | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/monitor.ts` | #74 |

## `src/routes/payload-analysis.$hash.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCorrelation` (L203) | GET | { key: string } → CorrelationFetch | `GET /api/v1/store/ghidra-runs?offset=0&size=5&q={q}`<br>`GET /api/v1/store/github-analysis?offset=0&size=5&q={q}`<br>`GET /api/v1/store/sandbox-runs?offset=0&size=25&q={q}` | session | PayloadAnalysis | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchDetail` (L43) | GET | { hash: string } → DetailFetch | `GET /api/v1/payloads/{hash}` | session | loader; PayloadAnalysis **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchGoldenImageStatus` (L75) | GET | — → GoldenImageFetch | `GET /api/v1/sandbox/golden-image-status (mounted)` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchRelatedEvents` (L272) | GET | { hash: string } → RelatedFetch | `GET {base}&offset={first.total - 1}`<br>`GET ‹base›` | session | PayloadAnalysis | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `generatePdfReport` (L150) | POST | { hash: string } → { ok: boolean; id?: string; error?: string } | `POST /api/v1/payloads/{hash}/report (mounted)` | admin | generateReport | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `submitGhidra` (L113) | POST | { hash: string } → SubmitResult | `POST ‹path› (mounted)` | admin | decompile | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `submitGithubAnalysis` (L129) | POST | { hash: string } → SubmitResult | `POST ‹path› (mounted)` | admin | publish | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `submitSandbox` (L105) | POST | { hash: string } → SubmitResult | `POST ‹path› (mounted)` | admin | detonate | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/payload-workbench.results.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `abortGpuJob` (L311) | POST | { job_id: string } → { ok: boolean; error?: string } | `POST /api/v1/gpu-queue/{job_id}/abort (mounted)` | admin | Results | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `childActionFn` (L251) | POST | { runId: string; analyzerId: string; action: 'cancel' \| 'retry' } → RunResult | `POST /api/v1/workbench/runs/{runId}/children/{analyzerId}/{action} (mounted)` | admin | act | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchAnalyzerCatalog` (L149) | GET | { hash: string } → CatalogFetch | `GET /api/v1/workbench/analyzers?hash={hash} (mounted)` | session | loadCatalog | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchGhidra` (L123) | GET | { offset: number } → Page \| null | `GET /api/v1/store/ghidra-runs?offset={offset}&size=25` | session | loader; Results **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchGpuQueue` (L299) | GET | — → GpuJob[] \| null | `GET /api/v1/gpu-queue` | session | loader; Results **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchModelHealth` (L342) | GET | — → ModelHealth[] \| null | `GET /api/v1/ml-health` | session | ModelHealthCard | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchOwnRuns` (L171) | GET | — → { runs: WorkbenchRun[] } \| null | `GET /api/v1/workbench/runs?owner={user?.username ?? ''}&limit=25 (mounted)` | session+ | RecentRunsCard | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchRecipes` (L161) | GET | — → { recipes: WorkbenchRecipe[] } \| null | `GET /api/v1/workbench/recipes?owner={user?.username ?? ''} (mounted)` | session+ | WorkbenchBuilder; submit | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchSandbox` (L116) | GET | { offset: number } → Page \| null | `GET /api/v1/store/sandbox-runs?offset={offset}&size=25` | session | loader; Results **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchStatic` (L102) | GET | { offset: number } → Page \| null | `GET /api/v1/store/static-analysis?offset={offset}&size=25` | session | loader; Results **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchWorkbench` (L95) | GET | { offset: number } → Page \| null | `GET /api/v1/store/workbench-runs?offset={offset}&size=25` | session | loader; Results **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchYara` (L109) | GET | { offset: number } → Page \| null | `GET /api/v1/store/yara?offset={offset}&size=25` | session | loader; Results **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `refreshRunFn` (L184) | GET | { id: string } → RunResult | `GET /api/v1/workbench/runs/{id}?owner={user?.username ?? ''} (mounted)` | session+ | refresh | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `saveRecipeFn` (L231) | POST | { id: string; name: string; description: string; scope: string; analyzers: WorkbenchSelection[]; base_revision: number } → { ok: boolean; recipe?: WorkbenchRecipe; error?: string } | `POST /api/v1/workbench/recipes (mounted)` | admin | submit | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `submitRun` (L205) | POST | { payload_sha256: string; recipe_name: string; analyzers: WorkbenchSelection[] } → RunResult | `POST /api/v1/workbench/runs (mounted)` | admin | submit | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/payloads.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchGithubVerdicts` (L106) | GET | — → VerdictScan \| null | `GET /api/v1/store/github-analysis?offset={scanned}&size=100` | session | Payloads | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchPayloads` (L40) | GET | { offset: number; source?: string } → Page \| null | `GET /api/v1/payloads?offset={offset}&size=12{filter}` | session | loader; Payloads **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `fetchSourceCounts` (L61) | GET | — → SourceCensus \| null | `GET /api/v1/payloads?offset=0&size=1&aggs=sources` | session | Payloads | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `submitGithubAnalysis` (L128) | POST | { hash: string } → { ok: boolean; error?: string } | `POST /api/v1/github-analysis/submit (mounted)` | admin | publish | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/problem-reports.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchPage` (L14) | GET | { offset: number } → StorePage \| null | `GET /api/v1/store/problem-reports?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `setStatus` (L21) | POST | { id: string; status: 'open' \| 'triaged' \| 'closed' } → { ok: boolean; error?: string } | `PATCH /api/v1/problem-reports/{id}` | admin | StatusControl | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |

## `src/routes/recordings.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchRecordings` (L44) | GET | { offset: number; ip?: string } → Page \| null | `GET /api/v1/recordings?offset={offset}&size=25{ip}` | session | loader; Recordings **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |
| `fetchReplay` (L52) | GET | { shasum: string } → Replay \| null | `GET /api/v1/recordings/{shasum}` | session | ReplayPane | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |

## `src/routes/reports.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `createDefinition` (L152) | POST | ReportDefinition → { ok: boolean; error?: string } | `POST /api/v1/reports/definitions` | admin | DefinitionForm | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `deleteDefinition` (L184) | POST | { id: string } → { ok: boolean; error?: string } | `DELETE /api/v1/reports/definitions/{id}` | admin | remove | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `deleteGenerated` (L196) | POST | { id: string } → { ok: boolean; error?: string } | `DELETE /api/v1/reports/generated/{id}` | admin | removeGenerated | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `fetchDefinitions` (L144) | GET | — → DefinitionsResponse \| null | `GET /api/v1/reports/definitions` | session | loader; refreshDefinitions **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `fetchGenerated` (L88) | GET | { offset: number } → Page \| null | `GET /api/v1/store/generated-reports?offset={offset}&size=25` | session | loader; refreshGenerated **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `fetchSandboxJobs` (L100) | GET | — → SandboxJobOption[] \| null | `GET /api/v1/store/sandbox-runs?offset=0&size=25` | session | DefinitionForm | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `fetchTemplates` (L139) | GET | — → TemplatesResponse \| null | `GET /api/v1/reports/templates` | session | loader; Reports **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `generateDefinition` (L208) | POST | { id: string } → { ok: boolean; error?: string } | `POST /api/v1/reports/definitions/{id}/generate` | admin | generate | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `searchPayloads` (L119) | GET | { q: string } → PayloadOption[] \| null | `GET /api/v1/payloads?offset=0&size=8{filter}` | session | DefinitionForm | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |
| `updateDefinition` (L168) | POST | { id: string; definition: ReportDefinition } → { ok: boolean; error?: string } | `PUT /api/v1/reports/definitions/{id}` | admin | DefinitionForm | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/reports.ts` | #79 |

## `src/routes/revdeck.$sha.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchRun` (L42) | GET | { sha: string } → RunFetch | `GET /api/v1/revdeck/{sha}` | session | loader; RevdeckDetail **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/revdeck.index.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchPage` (L12) | GET | { offset: number } → StorePage \| null | `GET /api/v1/store/revdeck?offset={offset}&size=25` | session | Page | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/sandbox.$job.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchRun` (L28) | GET | { job: string } → RunFetch | `GET /api/v1/sandbox/{job}` | session | loader; SandboxDetail **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |
| `resubmitSandbox` (L40) | POST | { hash: string } → { ok: boolean; error?: string } | `POST /api/v1/sandbox/submit (mounted)` | admin | reanalyze | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/sandbox.vnc.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchVncStatus` (L23) | GET | — → { status: VncStatus \| null; error: string \| null } | `GET /api/v1/sandbox/vnc (mounted)` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/evidence.ts` | #78 |

## `src/routes/search.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `searchFn` (L15) | GET | { q: string } → SearchResult \| null | `GET /api/v1/search?q={q}` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |

## `src/routes/sensors.$sensor.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCatalog` (L53) | GET | — → { sensors: SensorSummary[] } \| null | `GET /api/v1/sensors/catalog` | session | loader; SensorPage **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `fetchEvents` (L60) | GET | { sensor: string } → { sensor: string; total: number; rows: SensorEventRow[] } \| null | `GET /api/v1/sensors/{sensor}/events?limit=200` | session | loader; SensorPage **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `fetchOverview` (L44) | GET | { sensor: string } → Overview \| null | `GET /api/v1/sensors/{sensor}/overview` | session | loader; SensorPage **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |

## `src/routes/sensors.index.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchCatalog` (L41) | GET | — → { sensors: SensorSummary[] } \| null | `GET /api/v1/sensors/catalog` | session | beforeLoad **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |

## `src/routes/sessions.$id.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchSession` (L53) | GET | { id: string } → SessionFetch | `GET /api/v1/sessions/{id}` | session | loader; SessionPage **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |

## `src/routes/settings.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchAdminData` (L134) | GET | — → AdminConfig \| null | `GET /api/v1/config`<br>`GET /api/v1/reports/templates`<br>`GET /api/v1/users` | session | fetchSettingsData; SettingsSurface | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchAudit` (L188) | GET | { action: string } → AuditResponse \| null | `GET /api/v1/audit{query}` | session | fetchSettingsData; applyFilter | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchHistory` (L183) | GET | — → HistoryResponse \| null | `GET /api/v1/config/history` | session | fetchSettingsData; rollback | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchPreferences` (L236) | GET | — → Prefs \| null | `GET /api/v1/preferences?{query}` | session+ | fetchSettingsData | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchReporterStats` (L196) | GET | — → ReporterStats \| null | `GET /api/v1/reporter-stats` | session | fetchSettingsData | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchServiceLogs` (L174) | GET | { name: string } → { name: string; lines: number; log: string } \| null | `GET /api/v1/services/{name}/logs?lines=200` | session | viewLogs | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchServices` (L169) | GET | — → ServicesResponse \| null | `GET /api/v1/services` | session | fetchSettingsData; refresh | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `fetchStorage` (L116) | GET | — → EsStorage \| null | `GET /api/v1/settings/storage` | session | fetchSettingsData | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `putPreferences` (L248) | POST | { patch: Prefs } → { ok: boolean; preferences?: Prefs; error?: string } | `GET /api/v1/preferences?{query}`<br>`PUT /api/v1/preferences` | session+ | requestSave | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `resetPreferences` (L271) | POST | — → { ok: boolean; preferences?: Prefs; error?: string } | `POST /api/v1/preferences/reset` | session+ | requestReset | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `rollbackConfig` (L390) | POST | { revision: number } → { ok: boolean; error?: string } | `POST /api/v1/config/rollback` | admin | rollback | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `runServiceAction` (L372) | POST | { name: string; action: 'start' \| 'stop' \| 'restart' } → { ok: boolean; error?: string } | `POST /api/v1/services/{name}/{action}?{query}` | admin | act | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `saveConfigSection` (L335) | POST | { section: 'honeypot' \| 'behavior' \| 'report-presets'; value: unknown; revision: number } → ConfigSaveResult | `PUT /api/v1/config/{section}?{query}` | admin | runConfigSave | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `savePresentation` (L312) | POST | { value: Presentation; revision: number } → ConfigSaveResult | `PUT /api/v1/config/presentation?{query}` | admin | runConfigSave | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |
| `validateConfig` (L357) | POST | { patch: unknown } → { ok: boolean; problems: string[] } \| null | `POST /api/v1/config/validate` | session | runConfigSave | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/settings.ts` | #81 |

## `src/routes/source-health.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchHealth` (L55) | GET | — → SourceHealth \| null | `GET /api/v1/source-health` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |

## `src/routes/topology.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchHealth` (L63) | GET | — → SensorFreshness[] \| null | `GET /api/v1/source-health` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `fetchServices` (L69) | GET | — → ContainerState[] \| null | `GET /api/v1/services` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |
| `fetchTopology` (L58) | GET | — → Topology \| null | `GET /api/v1/topology` | session | loader **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/operations.ts` | #77 |

## `src/routes/tty-replay.$shasum.tsx`

| Function | Method | Input → output | Backend | Permission | Called from | Rewrite owner | Slice |
|---|---|---|---|---|---|---|---|
| `fetchProfile` (L151) | GET | { ip: string } → ProfileFetch | `GET /api/v1/investigate/ip/{ip}` | session | AttackerTab | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |
| `fetchReplay` (L110) | GET | { shasum: string } → ReplayFetch | `GET /api/v1/recordings/{shasum}` | session | loader; TtyReplay **(loader)** | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |
| `fetchSourceIp` (L130) | GET | { shasum: string } → SourceIpFetch | `GET /api/v1/events?kind=cowrie.log.closed&shasum={shasum}&size=1&since=365d` | session | AttackerTab | `src/data/queries.ts`<br>`src/data/api.ts`<br>`src/data/adapters/explorer.ts` | #75 |
