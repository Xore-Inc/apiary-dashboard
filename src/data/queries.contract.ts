// The data seam's contract: every query the pages make, with its arguments
// and its answer. The server functions (./queries.ts, generated from this
// file by scripts/gen-queries.ts) are typed by it, and the live adapters
// (./api.ts) implement it: `LIVE` must answer every query here, so a query
// the backend cannot answer does not exist. Types only; nothing runs here.
import type {
  AgentCampaign,
  ServiceLogs,
  CapeRun,
  GhidraAnalysis,
  PageRequest,
  Paged,
  GithubAnalysis,
  PayloadAnalysis,
  RevDeckRun,
  SandboxRun,
  DeadLetter,
  EventDetail,
  IpProfile,
  Preferences,
  ProblemReport,
  ProblemStatus,
  ReplayDetail,
  SearchGroup,
  SessionDetail,
  SettingsData,
  AlertGroup,
  AnalysisResultsData,
  AnalysisRunConfig,
  AnalyzerCatalog,
  AnalyzerId,
  WorkbenchRun,
  BaitCredential,
  CanaryToken,
  CanaryTokenType,
  CanaryTrigger,
  CapturedPayload,
  GeneratedReport,
  ReportDefinition,
  Facets,
  ReportPreview,
  ReportsData,
  SourceHealth,
  Topology,
  AttackerEntity,
  CredEdge,
  EventFilters,
  EventsPage,
  InfraCluster,
  KillChainData,
  MapPoint,
  NetworkCampaign,
  Recording,
  SensorDetail,
  SensorSummary,
  SourceProfile,
  AuthEventsData,
  CountRow,
  Disposition,
  LlmAnalysis,
  MlAnomaliesData,
  SemanticSearchResult,
  HoneypotEvent,
  OverviewData,
  OverviewViews,
  SessionSummary,
  SourceNetwork,
  TimelineItem,
  SessionUser,
  AsnEntity,
  CampaignEntity,
  ClusterEntity,
  IdentityEntity,
  IdentityFusion,
  NetworkEntity,
  MlAnomaly,
  IocEntity,
  IocHubKind,
  IocRow,
  TimelineEntity,
  RelatedGroup,
  CapturedMail,
  ConfigProblems,
  ShellConfig,
  ConfigSection,
  DashboardConfig,
} from './types'

export type LookupTarget =
  | { kind: 'payload'; value: string }
  | { kind: 'cluster'; clusterKind: string; value: string }
  | { kind: 'not-found'; value: string }

export type ProblemReportInput = {
  page: string
  expected: string
  actual: string
  actionTrail: string[]
  consoleErrors: string[]
  networkFailures: string[]
  apiCalls: Array<{ method: string; path: string; status: number }>
  domSnapshot?: string
  userAgent: string
}

export type PayloadAction = 'sandbox' | 'ghidra' | 'github' | 'pdf'

export type ArtifactRow = { filename: string; kind: string; contentType: string; sizeBytes: number; importedAt: string }

export interface AlertDetail {
  group: AlertGroup
  sources: string[]
  hashes: string[]
}

/** A file of an analysis run (its decompilation, call graph, capture), as
 * the artifact routes serve it. */
export interface ArtifactFile {
  filename: string
  kind: string
  contentType: string
  body: string | Uint8Array
}

/** Every query, by name. */
export interface Queries {
  getSessionUser: () => Promise<SessionUser | null>
  getOverview: () => Promise<OverviewData>
  getMlAnomalies: () => Promise<MlAnomaliesData>
  acknowledgeAnomalies: (ids: string[]) => Promise<number>
  acknowledgeAllAnomalies: () => Promise<number>
  setAnomalyDisposition: (ids: string[], status: Disposition | 'open', reason: string) => Promise<void>
  getLlmAnalyses: () => Promise<LlmAnalysis[]>
  semanticSearch: (query: string) => Promise<SemanticSearchResult>
  getAgentCampaigns: () => Promise<AgentCampaign[]>
  getAuthEvents: () => Promise<AuthEventsData>
  getEvents: (filters: EventFilters & PageRequest) => Promise<EventsPage>
  getSourceProfiles: () => Promise<{ sources: SourceProfile[]; mapPoints: MapPoint[] }>
  getNetworkCampaigns: () => Promise<{ campaigns: NetworkCampaign[]; credReuse: CredEdge[] }>
  getInfraClusters: () => Promise<InfraCluster[]>
  getAttackers: () => Promise<AttackerEntity[]>
  getKillChain: () => Promise<KillChainData>
  getCommands: (page?: PageRequest) => Promise<Paged<HoneypotEvent>>
  getSensorCatalog: () => Promise<SensorSummary[]>
  getSensorDetail: (id: string) => Promise<SensorDetail | null>
  getRecordings: (ip?: string) => Promise<Recording[]>
  resolveHash: (value: string) => Promise<LookupTarget>
  getAlerts: () => Promise<AlertGroup[]>
  getOpenAlertCount: () => Promise<number>
  setAlertsAcknowledged: (keys: string[], acknowledged: boolean) => Promise<number>
  acknowledgeAllAlerts: () => Promise<number>
  getSourceHealth: () => Promise<SourceHealth>
  getTopology: () => Promise<Topology>
  searchHistory: (query: string, page?: PageRequest) => Promise<Paged<HoneypotEvent>>
  getReports: () => Promise<ReportsData>
  saveReportDefinition: (definition: ReportDefinition) => Promise<ReportDefinition>
  deleteReportDefinition: (id: string) => Promise<void>
  generateReport: (definitionId: string) => Promise<GeneratedReport | null>
  deleteGeneratedReport: (id: string) => Promise<void>
  getFacets: (kind?: string, filters?: EventFilters) => Promise<Facets>
  previewReport: (definition: ReportDefinition) => Promise<ReportPreview | null>
  generatePayloadReport: (hash: string) => Promise<GeneratedReport | null>
  generateReportFrom: (definition: ReportDefinition, keep: boolean) => Promise<{ report: GeneratedReport; definition?: ReportDefinition }>
  getCanarytokens: () => Promise<{ types: CanaryTokenType[]; tokens: CanaryToken[]; triggers: CanaryTrigger[] }>
  createCanarytoken: (input: { type: string; memo: string; snippet?: string; image?: { name: string; contentType: string; base64: string } }) => Promise<CanaryToken>
  getCredentials: () => Promise<{ credentials: BaitCredential[]; tokens: CanaryToken[]; targets: string[] }>
  provisionCredential: (input: Pick<BaitCredential, 'path' | 'target' | 'username' | 'password' | 'memo' | 'template'>) => Promise<BaitCredential>
  rotateCredential: (id: string, password?: string) => Promise<void>
  linkCredentialToken: (id: string, tokenId?: string) => Promise<void>
  getPayloads: () => Promise<{ payloads: CapturedPayload[]; sources: CountRow[] }>
  getAnalysisResults: (range?: string) => Promise<AnalysisResultsData>
  getAnalyzerCatalog: (hash: string) => Promise<AnalyzerCatalog | null>
  startAnalysisRun: (config: AnalysisRunConfig) => Promise<{ run: WorkbenchRun; reused: boolean } | null>
  setRunChild: (runId: string, analyzerId: AnalyzerId, action: 'retry' | 'cancel') => Promise<WorkbenchRun | null>
  abortGpuJob: (jobId: string) => Promise<boolean>
  getEventDetail: (id: string) => Promise<EventDetail | null>
  getSessionDetail: (id: string) => Promise<SessionDetail | null>
  getIpProfile: (ip: string) => Promise<IpProfile | null>
  getBlockedIps: () => Promise<string[]>
  setIpBlocked: (ip: string, blocked: boolean, expiresDays?: number) => Promise<void>
  getReplayDetail: (shasum: string) => Promise<ReplayDetail | null>
  searchAll: (query: string, limit?: number) => Promise<SearchGroup[]>
  getDeadLetters: (query: string) => Promise<DeadLetter[]>
  getDeadLetter: (id: string) => Promise<DeadLetter | null>
  purgeDeadLetters: (query: string) => Promise<number>
  getProblemReports: () => Promise<ProblemReport[]>
  getMail: (sessionId: string) => Promise<CapturedMail | null>
  submitProblemReport: (input: ProblemReportInput) => Promise<{ id: string }>
  setProblemStatus: (id: string, status: ProblemStatus) => Promise<void>
  getSettings: () => Promise<SettingsData>
  savePreferences: (next: Preferences) => Promise<void>
  getPreferences: () => Promise<Preferences>
  getShellConfig: () => Promise<ShellConfig>
  validateConfig: <TSection extends ConfigSection>(section: TSection, value: DashboardConfig[TSection], fields?: string[]) => Promise<ConfigProblems>
  saveConfigSection: <TSection extends ConfigSection>(section: TSection, value: DashboardConfig[TSection], fields?: string[]) => Promise<{ ok: true; revision: number } | { ok: false; problems: ConfigProblems }>
  runServiceAction: (name: string, action: 'start' | 'stop' | 'restart') => Promise<void>
  getServiceLogs: (name: string) => Promise<ServiceLogs | null>
  rollbackConfig: (revisionId: string) => Promise<void>
  getPayloadAnalysis: (hash: string) => Promise<PayloadAnalysis | null>
  queuePayloadAction: (hash: string, action: PayloadAction) => Promise<string>
  getSandboxRun: (job: string) => Promise<SandboxRun | null>
  getSandboxLiveStatus: () => Promise<{ running: boolean; job?: string; since?: string }>
  getSandboxVncBridge: () => Promise<{ job: string; bridge: string } | null>
  getGhidraAnalysis: (sha: string) => Promise<GhidraAnalysis | null>
  getArtifacts: (kind: string, key: string) => Promise<ArtifactRow[] | null>
  getArtifactFile: (kind: string, key: string, filename: string) => Promise<ArtifactFile | null>
  getRevDeckRuns: () => Promise<RevDeckRun[]>
  getRevDeckRun: (sha: string) => Promise<RevDeckRun | null>
  getCapeRuns: () => Promise<CapeRun[]>
  getCapeRun: (sha: string) => Promise<CapeRun | null>
  getGithubAnalyses: () => Promise<GithubAnalysis[]>
  getGithubAnalysis: (sha: string) => Promise<GithubAnalysis | null>
  getOverviewViews: () => Promise<OverviewViews>
  getSourceEvents: (ip: string, range?: string) => Promise<HoneypotEvent[]>
  getSourceSessions: (ip: string, range?: string) => Promise<SessionSummary[]>
  getSourceTimeline: (ip: string, range?: string) => Promise<TimelineItem[]>
  getSourceNetwork: (ip: string) => Promise<SourceNetwork | null>
  getSourceIdentity: (ip: string) => Promise<AttackerEntity | null>
  getSessionSummary: (id: string) => Promise<SessionSummary | null>
  getSessionEvents: (id: string) => Promise<HoneypotEvent[]>
  getPayloadDelivery: (hash: string) => Promise<{ events: HoneypotEvent[]; sessions: SessionSummary[]; sources: CountRow[] }>
  getNetwork: (cidr: string) => Promise<NetworkEntity | null>
  getAsn: (asn: string) => Promise<AsnEntity | null>
  getCampaign: (cidr: string) => Promise<CampaignEntity | null>
  getCluster: (kind: string, value: string) => Promise<ClusterEntity | null>
  getIdentity: (id: string) => Promise<IdentityEntity | null>
  getIdentityFusion: (id: string) => Promise<IdentityFusion | null>
  getAlertDetail: (key: string) => Promise<AlertDetail | null>
  getAnomaly: (id: string) => Promise<{ anomaly: MlAnomaly; event: HoneypotEvent | null } | null>
  getLlmAnalysis: (id: string) => Promise<{ analysis: LlmAnalysis; events: HoneypotEvent[] } | null>
  getAgentCampaign: (id: string) => Promise<{ campaign: AgentCampaign; events: HoneypotEvent[] } | null>
  getIocCatalog: () => Promise<Record<IocHubKind, IocRow[]>>
  getIoc: (kind: string, value: string) => Promise<IocEntity | null>
  getEntityTimeline: (kind: TimelineEntity, id: string, range?: string) => Promise<TimelineItem[]>
  getRelated: (kind: TimelineEntity | 'event', id: string) => Promise<RelatedGroup[]>
}
