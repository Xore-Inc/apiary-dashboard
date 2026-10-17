// Wire → page mapping for the settings, preferences and shell slice. Pure
// functions over the shapes in ../contracts/settings; nothing here fetches.
//
// Where the wire and the page disagree, the page wins the shape and the
// disagreement is written down at the function that has it — a wire field
// with no page field is dropped, a page field with no wire field reads as
// its default, and neither widens a page type.
import type {
  AuditEntry,
  CapturedMail,
  ConfigProblems,
  ConfigRevision,
  ConfigSection,
  ContainerState,
  CountRow,
  DashboardConfig,
  DashboardOperator,
  EsStorage,
  MailAddress,
  Preferences,
  ProblemReport,
  ProblemStatus,
  ReporterStats,
  ReportTemplate,
  ServiceStatus,
  SettingsData,
  ShellConfig,
} from '../types'
import type { ProblemReportInput } from '../queries.impl'
import type {
  AttackVectorsWire,
  AuditWire,
  ConfigHistoryWire,
  ConfigValidateWire,
  ConfigWire,
  MailWire,
  PreferencesDocWire,
  PreferencesPatchWire,
  PreferencesWire,
  ProblemReportBody,
  ProblemReportRowWire,
  ProblemReportsPageWire,
  ProblemStatusPatchWire,
  ReporterStatsWire,
  ServiceLogsWire,
  ServicesWire,
  StorageWire,
  UsersWire,
} from '../contracts/settings'

const text = (value: string | undefined): string => value ?? ''

// ---- preferences -----------------------------------------------------------

/** The page's enum-typed fields, read off the wire's open strings. The
 * backend validates every one of these against the same lists the page
 * offers (preferences.rs `problems()`), so a value that is not in the union
 * should be unreachable; `system`/`comfortable`/`osm` are the fallbacks for
 * a document written by an older backend, not a silent repair.
 *
 * `palette` is the one field deliberately NOT in a list: the backend checks
 * its shape only, so a new theme name is preserved rather than dropped
 * (preferences.rs `theme_name`). It is cast rather than narrowed.
 *
 * Two wire fields have no page field and are dropped: `preserve_filters`
 * (kept in the store, never rendered) and `notify_canary` — which does not
 * exist on the wire at all, so the page's `notifyCanary` always reads
 * false. */
export function preferences(wire: PreferencesDocWire): Preferences {
  return {
    theme: asOneOf(wire.theme, ['system', 'dark', 'light'], 'system'),
    palette: wire.palette as Preferences['palette'],
    density: asOneOf(wire.density, ['comfortable', 'compact'], 'comfortable'),
    motion: asOneOf(wire.reduced_motion, ['system', 'on', 'off'], 'system'),
    highContrast: wire.high_contrast,
    largeEvidenceText: wire.large_evidence_text,
    wrapLongValues: wire.wrap_long_values,
    collapsedSidebar: wire.collapsed_sidebar,
    landing: wire.landing_page,
    rowsPerPage: wire.rows_per_page,
    openDetailsInNewTab: wire.open_details_new_tab,
    rememberFilters: wire.remember_filters,
    timezone: wire.timezone,
    clock: asOneOf(wire.clock, ['h24', 'h12'], 'h24'),
    timestamps: asOneOf(wire.timestamps, ['relative', 'absolute'], 'relative'),
    autoRefresh: wire.auto_refresh,
    refreshSeconds: wire.refresh_interval_seconds,
    liveToasts: wire.live_toasts,
    liveToastSeconds: wire.live_toast_interval_seconds,
    mapBasemap: 'osm',
    mapClustering: wire.map_clustering,
    mapAnimation: wire.map_animation,
    notifySeverity: asOneOf(wire.notify_severity, ['low', 'medium', 'high', 'critical', 'info'], 'high'),
    notifySound: wire.notify_sound,
    notifyDesktop: wire.notify_desktop,
    notifyCanary: false,
    defaultWindow: text(wire.default_event_window),
  }
}

function asOneOf<const T extends readonly string[]>(value: string, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(value) ? value : fallback
}

/** GET /api/v1/preferences. The response is always the WHOLE document —
 * preferences.rs projects nothing — so the three seam callers that want
 * appearance, toast and map settings all read the same page type and pick
 * their own fields out of it. `revision` (the subject's own
 * preferences_revision) has no page field. */
export const preferencesDocument = (wire: PreferencesWire): Preferences => preferences(wire.preferences)

/** GET /api/v1/preferences?subject=…&username=…&role=…&timezone=…
 * — `subject` is required and an empty one is a 400. `timezone` only
 * matters on first contact, where it seeds the new subject's document. */
export interface PreferencesQueryWire {
  subject: string
  username?: string
  role?: string
  timezone?: string
}

export const preferencesQuery = (subject: string, identity: { username?: string; role?: string; timezone?: string } = {}): PreferencesQueryWire => ({
  subject,
  ...(identity.username ? { username: identity.username } : {}),
  ...(identity.role ? { role: identity.role } : {}),
  ...(identity.timezone ? { timezone: identity.timezone } : {}),
})

/** Page → `PreferencesPatchWire`, carrying ONLY `changed`.
 *
 * This is the whole design of the slice, and the reason the seam's three
 * partial setters are safe: preferences.rs MERGES the patch into the stored
 * document, so a caller that changed one field must send one field. Sending
 * the whole page object would be a different bug and a smaller one — the
 * patch struct is `deny_unknown_fields`, so `notifyCanary` alone would 400
 * the request — but the merge is what makes a full send *silently* wrong
 * for anything the store holds and the page does not.
 *
 * `mapBasemap` and `notifyCanary` have no wire field and are not sent;
 * `map_basemap` is "osm" on the wire whatever the page says, and
 * `notify_canary` is not a key the backend accepts. */
export function preferencesPatch(changed: Partial<Preferences>): PreferencesPatchWire {
  const patch: PreferencesPatchWire = {}
  const set = <TPatch extends keyof PreferencesPatchWire>(key: TPatch, value: PreferencesPatchWire[TPatch]) => {
    if (value !== undefined) patch[key] = value
  }
  set('theme', changed.theme)
  set('palette', changed.palette)
  set('density', changed.density)
  set('reduced_motion', changed.motion)
  set('collapsed_sidebar', changed.collapsedSidebar)
  set('landing_page', changed.landing)
  set('remember_filters', changed.rememberFilters)
  set('rows_per_page', changed.rowsPerPage)
  set('wrap_long_values', changed.wrapLongValues)
  set('timezone', changed.timezone)
  set('clock', changed.clock)
  set('timestamps', changed.timestamps)
  set('auto_refresh', changed.autoRefresh)
  set('refresh_interval_seconds', changed.refreshSeconds)
  set('live_toasts', changed.liveToasts)
  set('live_toast_interval_seconds', changed.liveToastSeconds)
  set('map_clustering', changed.mapClustering)
  set('map_animation', changed.mapAnimation)
  set('high_contrast', changed.highContrast)
  set('large_evidence_text', changed.largeEvidenceText)
  set('notify_severity', changed.notifySeverity)
  set('notify_sound', changed.notifySound)
  set('notify_desktop', changed.notifyDesktop)
  set('default_event_window', changed.defaultWindow)
  set('open_details_new_tab', changed.openDetailsInNewTab)
  return patch
}

/** The PUT body around a patch. */
export const preferencesWriteBody = (subject: string, patch: PreferencesPatchWire, username?: string) => ({ subject, ...(username ? { username } : {}), patch })

/** POST /api/v1/preferences/reset body. `timezone` seeds the restored
 * document's timezone (preferences.rs `default_preferences`), so pass the
 * deployment default rather than the operator's. */
export const preferencesResetBody = (subject: string, username?: string, timezone?: string) => ({ subject, ...(username ? { username } : {}), ...(timezone ? { timezone } : {}) })

/** preferences.rs `default_preferences` — the document a subject starts
 * from, and the one `POST /api/v1/preferences/reset` restores. Mirrored here
 * because the sign-in pages render preferences BEFORE any subject exists,
 * and nothing on the wire serves a document for a subject who has not
 * signed in. It is the one place in this slice where the backend's Rust
 * default is restated in TypeScript, and the values were read off the
 * function rather than taken from the mock — they differ (the mock's
 * `notifyCanary` is true and has no wire field at all).
 *
 * If the Rust default ever moves, this is the line that goes stale; the
 * adapter's own test is what catches it. */
export const DEFAULT_PREFERENCES_WIRE: PreferencesDocWire = {
  theme: 'system',
  palette: 'claude',
  density: 'comfortable',
  reduced_motion: 'system',
  collapsed_sidebar: false,
  landing_page: '/',
  remember_filters: false,
  rows_per_page: 50,
  wrap_long_values: false,
  timezone: 'browser',
  clock: 'h24',
  timestamps: 'relative',
  auto_refresh: true,
  refresh_interval_seconds: 30,
  live_toasts: true,
  live_toast_interval_seconds: 60,
  map_basemap: 'osm',
  map_clustering: true,
  map_animation: true,
  high_contrast: false,
  large_evidence_text: false,
  notify_severity: 'high',
  notify_sound: false,
  notify_desktop: false,
  default_event_window: '24h',
  preserve_filters: false,
  open_details_new_tab: false,
}

// ---- dashboard config ------------------------------------------------------

/** GET /api/v1/config. A document that was never written answers
 * `{revision: 0, payload: {}}`, so every block here is a read with a
 * default — that is also what makes an operator's first visit render.
 *
 * `presentation.brand_prefix` (validated, max 20 chars) has no page control,
 * but it is carried as `brandPrefix` when stored, so the presentation save
 * can send it back (put_config_field replaces the whole block). Absent or
 * empty stays absent. `presentation.title_format` and
 * `behavior.default_landing` are stored but not validated by the Rust tier
 * (only Go's typed tier pinned them), so they pass through as written. */
export function dashboardConfig(wire: ConfigWire): DashboardConfig {
  const p = wire.payload.presentation ?? {}
  const b = wire.payload.behavior ?? {}
  const h = wire.payload.honeypot ?? {}
  return {
    revision: wire.revision,
    presentation: {
      appName: text(p.app_name),
      titleFormat: text(p.title_format),
      productLabel: text(p.product_label),
      dashboardTitle: text(p.dashboard_title),
      dashboardSubtitle: text(p.dashboard_subtitle),
      orgName: text(p.org_name),
      overviewIntro: text(p.overview_intro),
      helpLinkLabel: text(p.help_link_label),
      helpLinkUrl: text(p.help_link_url),
      bannerText: text(p.banner_text),
      bannerSeverity: asOneOf(text(p.banner_severity), ['', 'info', 'success', 'warning', 'danger'] as const, '' as const),
      bannerExpires: text(p.banner_expires),
      footerText: text(p.footer_text),
      aiDisclaimer: text(p.ai_disclaimer),
      privacyNotice: text(p.privacy_notice),
      ...(p.brand_prefix ? { brandPrefix: p.brand_prefix } : {}),
    },
    behavior: {
      defaultLanding: text(b.default_landing),
      defaultTimeWindow: text(b.default_time_window),
      rowsPerPageOptions: b.rows_per_page_options ?? [],
      maxExportRows: b.max_export_rows ?? 0,
      refreshIntervalOptions: b.refresh_interval_seconds_options ?? [],
      sourceStaleMinutes: b.source_stale_minutes ?? 0,
      mapProvider: 'osm',
      defaultTimezone: text(b.default_timezone),
      showMlPanels: b.show_ml_panels ?? false,
      maintenanceMode: b.maintenance_mode ?? false,
      readOnly: b.read_only ?? false,
      showProblemReportButton: b.show_problem_report_button ?? false,
    },
    honeypot: {
      alertCooldown: text(h.alert_cooldown),
      alertCampaignScore: h.alert_campaign_score ?? 0,
      sandboxAlertRiskScore: h.sandbox_alert_risk_score ?? 0,
      mlAlertThreshold: h.ml_alert_threshold ?? 0,
      yaraScanIntervalSeconds: h.yara_scan_interval_seconds ?? 0,
      yaraMaxBytes: h.yara_max_bytes ?? 0,
      payloadDedupeIntervalSeconds: h.payload_dedupe_interval_seconds ?? 0,
    },
    reportPresets: wire.payload.report_presets ?? {},
  }
}

/** `__root`'s `getShellConfig`. `links` — where the deployment's other
 * tools live — is NOT on `GET /api/v1/config`: it comes from the
 * deployment's environment, and no endpoint serves it. Documented gap; the
 * caller supplies it. */
export const shellConfig = (wire: ConfigWire, links: ShellConfig['links']): ShellConfig => ({ ...dashboardConfig(wire), links })

/** The wire's own name for each page section. `presentation` is NOT here:
 * it has its own route, and PUT /api/v1/config/presentation as a section is
 * a 404 (config.rs `config_section_key`). */
const SECTION_PATH: Record<Exclude<ConfigSection, 'presentation'>, 'honeypot' | 'behavior' | 'report-presets'> = {
  honeypot: 'honeypot',
  behavior: 'behavior',
  reportPresets: 'report-presets',
}

export const configSectionPath = (section: ConfigSection): 'presentation' | 'honeypot' | 'behavior' | 'report-presets' => (section === 'presentation' ? 'presentation' : SECTION_PATH[section])

/** Page → wire body for `PUT /api/v1/config/{section}` and
 * `PUT /api/v1/config/presentation`.
 *
 * These two are the SAME handler (`put_config_field`), differing only in
 * which `payload.*` key they splat into — the page's two saves hit two
 * routes for one code path, not two body shapes. Every block is sent whole:
 * both handlers REPLACE their block (`doc["payload"][key] = value`), so a
 * partial body would drop the fields it omits.
 *
 * The rules this mirrors are the Rust tier's, not Go's: it constrains the
 * enum and range fields below and leaves the rest to the page. Two bounds
 * differ from the page's own `validateSection` and the wire wins —
 * `source_stale_minutes` is 2..120 there and 1..1440 in `src/data/mock`,
 * `ml_alert_threshold` is 0.5..0.99 there and 0..1 in the mock. */
export function configSectionBody(section: ConfigSection, value: DashboardConfig[ConfigSection]): Record<string, unknown> {
  if (section === 'presentation') {
    const p = value as DashboardConfig['presentation']
    return {
      app_name: p.appName,
      title_format: p.titleFormat,
      product_label: p.productLabel,
      dashboard_title: p.dashboardTitle,
      dashboard_subtitle: p.dashboardSubtitle,
      org_name: p.orgName,
      overview_intro: p.overviewIntro,
      help_link_label: p.helpLinkLabel,
      help_link_url: p.helpLinkUrl,
      banner_text: p.bannerText,
      banner_severity: p.bannerSeverity,
      banner_expires: p.bannerExpires,
      footer_text: p.footerText,
      ai_disclaimer: p.aiDisclaimer,
      privacy_notice: p.privacyNotice,
      // Round-trip only a stored value: an absent or empty brand_prefix stays absent.
      ...(p.brandPrefix ? { brand_prefix: p.brandPrefix } : {}),
    }
  }
  if (section === 'behavior') {
    const b = value as DashboardConfig['behavior']
    return {
      default_landing: b.defaultLanding,
      default_time_window: b.defaultTimeWindow,
      rows_per_page_options: b.rowsPerPageOptions,
      max_export_rows: b.maxExportRows,
      refresh_interval_seconds_options: b.refreshIntervalOptions,
      source_stale_minutes: b.sourceStaleMinutes,
      map_provider: b.mapProvider,
      default_timezone: b.defaultTimezone,
      show_ml_panels: b.showMlPanels,
      maintenance_mode: b.maintenanceMode,
      read_only: b.readOnly,
      show_problem_report_button: b.showProblemReportButton,
    }
  }
  if (section === 'honeypot') {
    const h = value as DashboardConfig['honeypot']
    return {
      alert_cooldown: h.alertCooldown,
      alert_campaign_score: h.alertCampaignScore,
      sandbox_alert_risk_score: h.sandboxAlertRiskScore,
      ml_alert_threshold: h.mlAlertThreshold,
      yara_scan_interval_seconds: h.yaraScanIntervalSeconds,
      yara_max_bytes: h.yaraMaxBytes,
      payload_dedupe_interval_seconds: h.payloadDedupeIntervalSeconds,
    }
  }
  return Object.fromEntries(Object.entries(value as DashboardConfig['reportPresets']).map(([id, override_]) => [id, { name: override_?.name ?? '', description: override_?.description ?? '' }]))
}

/** POST /api/v1/config/validate body. The preview is section-scoped: only
 * the sections submitted are checked, and within one only the fields
 * present — so send the section under test, not the whole document. */
export const configValidateBody = (section: ConfigSection, value: DashboardConfig[ConfigSection]): Record<string, unknown> => ({
  [section === 'reportPresets' ? 'report_presets' : section]: configSectionBody(section, value),
})

/** POST /api/v1/config/validate response → the page's `ConfigProblems`.
 *
 * The wire answers a flat array of prose; the page wants field → message.
 * The validator prefixes its per-field messages with `section.field `, so
 * the field name is parsed back out of the message — the only place in this
 * tree where a value has to be recovered from prose. A message with no
 * dotted prefix (an unknown section, an unknown template id) is kept under
 * a key of its own so it is never silently dropped. */
export function configProblems(wire: ConfigValidateWire): ConfigProblems {
  const problems: ConfigProblems = {}
  for (const message of wire.problems) {
    const split = message.indexOf(' ')
    const field = split > 0 ? message.slice(0, split) : ''
    // "presentation.app_name" names the field; "unknown config section
    // \"mystery\"" does not, and keeps its whole sentence as the key so the
    // problem is shown rather than dropped.
    if (field.includes('.')) problems[field] = split > 0 ? message.slice(split + 1) : message
    else problems[message] = message
  }
  return problems
}

// ---- history, audit, users -------------------------------------------------

/** GET /api/v1/config/history. The wire's identity is an INTEGER
 * `revision`, not the page's `rev-41` string id — the log has no string
 * key, so a rollback must send the number (see `configRollbackBody`).
 *
 * `summary` has no source: the history log records which `payload.*` keys
 * changed, not what changed to what, and Go's typed impact classification
 * that built a sentence has no equivalent here. `section` is the key alone,
 * so a rollback entry reads as "*". */
export const configHistory = (wire: ConfigHistoryWire): ConfigRevision[] =>
  wire.entries.map((entry) => ({
    id: String(entry.revision),
    at: entry.time,
    actor: entry.actor_username,
    section: entry.action === 'rollback' ? '*' : (entry.fields ?? []).join(', '),
    summary: entry.action === 'rollback' ? 'Rolled back a past revision' : `Changed ${(entry.fields ?? []).join(', ') || 'nothing'}`,
  }))

/** POST /api/v1/config/rollback takes the integer from a history row.
 * `rollbackConfig(revisionId)` on the seam is handed the page's string id,
 * which is that number rendered — parse it, and refuse anything else rather
 * than sending a NaN revision the backend would reject as negative. */
export function configRollbackBody(revisionId: string): { revision: number } | null {
  const revision = Number(revisionId.replace(/^rev-/, ''))
  return Number.isInteger(revision) && revision >= 0 ? { revision } : null
}

/** GET /api/v1/audit. There is no id on the wire — the log is JSONL with no
 * key — so the row's `id` is derived from its position, which is stable for
 * a given page of a given log.
 *
 * `result` is success | conflict | invalid | error on the wire; the page
 * says ok | rejected, so `success` is `ok` and everything else is
 * `rejected` — the distinction between a refusal and a failure is lost.
 * The wire's own `revision` has no page field and is dropped. */
export const auditEntries = (wire: AuditWire): AuditEntry[] =>
  wire.events.map((event, index) => ({
    id: `audit-${index}`,
    at: event.time ?? '',
    actor: event.actor_username || event.actor_subject,
    action: event.action,
    fields: event.fields ?? [],
    result: event.result === 'success' ? 'ok' : 'rejected',
  }))

/** GET /api/v1/users. `name` has no wire field: the store keeps
 * `last_username`, and there is no display name anywhere in the users
 * document, so it reads as the username. `role` is the store's
 * `role_snapshot`, taken at first contact. */
export const dashboardOperators = (wire: UsersWire): DashboardOperator[] =>
  wire.users.map((user) => ({
    subject: user.subject,
    username: user.username,
    name: user.username,
    role: user.role === 'viewer' ? 'viewer' : 'admin',
    firstSeenAt: user.first_seen_at,
    lastSeenAt: user.last_seen_at,
  }))

// ---- services --------------------------------------------------------------

const CONTAINER_STATES = ['running', 'restarting', 'exited', 'unknown'] as const

/** GET /api/v1/services. The adapter serves Docker's own state vocabulary
 * and never `stack`, `uptime` or `image` — services-adapter.py's
 * `container_status` writes only name/state/exit_code/started_at/
 * restart_count and a conditional health, and services_control.rs forwards
 * those rows verbatim. The page's three fields therefore always read "", and
 * `health`/`restart_count`/`exit_code` have no page field to land in (a
 * documented gap, not an invented one). A page `unknown` stands for every
 * state the deployment's nine names that the page's four do not (paused,
 * created, removing, dead, not_found). */
export const services = (wire: ServicesWire): { available: boolean; services: ServiceStatus[]; reason?: string } => ({
  available: wire.available,
  services: wire.services.map((service) => ({
    name: service.name,
    stack: '',
    state: (CONTAINER_STATES as readonly string[]).includes(service.state) ? (service.state as ContainerState) : 'unknown',
    uptime: '',
    image: '',
  })),
  ...(wire.reason ? { reason: wire.reason } : {}),
})

/** GET /api/v1/services/{name}/logs?lines=200. The log arrives as ONE
 * plain-text blob with no level per line, so the page splits it on
 * newlines; `lines` is the count actually used after the backend's clamp to
 * 1000. */
export const serviceLogs = (wire: ServiceLogsWire): { name: string; lines: number; text: string[] } => ({
  name: wire.name,
  lines: wire.lines,
  text: wire.log.length === 0 ? [] : wire.log.replace(/\n$/, '').split('\n'),
})

// ---- reporter and storage --------------------------------------------------

/** GET /api/v1/reporter-stats. The happy path is the rare one: an
 * unreachable store, an empty index and a document missing
 * `reporter_metrics` all answer `available:false` with a reason and no
 * stats. TBD: `stats` is the reporter worker's own metrics.json passed
 * through raw, so a key it stops writing reads as 0. */
export const reporterStats = (wire: ReporterStatsWire): ReporterStats => ({
  available: wire.available,
  ...(wire.reason ? { reason: wire.reason } : {}),
  ...(wire.stats
    ? {
        stats: {
          attempted: wire.stats.attempted ?? 0,
          sent: wire.stats.sent ?? 0,
          suppressedCooldown: wire.stats.suppressed_cooldown ?? 0,
          dryRun: wire.stats.dry_run ?? 0,
          failed: wire.stats.failed ?? 0,
          updatedAt: wire.stats.updated_at ?? '',
        },
      }
    : {}),
})

/** GET /api/v1/settings/storage. `families` — the per-index-family
 * breakdown the page shows "where the space goes" — has no source on this
 * endpoint: health.rs `Storage` is four scalars, and
 * `_cat/indices`-style breakdowns live in the operations slice. Documented
 * gap; the page renders an empty list. `cluster_status` is "unreachable"
 * rather than a colour when ES could not be asked, which the page's
 * three-colour union does not carry, so it reads as unknown. */
export const esStorage = (wire: StorageWire): EsStorage => ({
  clusterStatus: (['green', 'yellow', 'red'] as const).find((c) => c === wire.cluster_status) ?? 'red',
  indexCount: wire.index_count,
  docCount: wire.doc_count,
  storeBytes: wire.store_bytes,
  families: [],
})

// ---- problem reports -------------------------------------------------------

/** One stored report, as `GET /api/v1/store/problem-reports` passes it
 * through. `status` is the store's own vocabulary — open | triaged | closed
 * (problem_reports.rs `VALID_STATUSES`); the page's union is wider by two,
 * and a status outside the page's union reads as `open`.
 *
 * `hasSnapshot` is inferred, not read: the store route excludes
 * `dom_snapshot` from `_source`, so its absence is the only signal that the
 * capture carried one — which is exactly what the page's flag asks. The
 * apiCalls carry the wire's `url`, which the page calls `path`. */
export const problemReport = (wire: ProblemReportRowWire): ProblemReport => ({
  id: wire.id,
  submittedAt: wire.submitted_at,
  submittedBy: wire.submitted_by_name || wire.submitted_by,
  status: (['open', 'triaged', 'fixed', 'wontfix'] as const).find((s) => s === wire.status) ?? 'open',
  page: wire.page,
  expected: wire.expected,
  actual: wire.actual,
  consoleErrors: wire.console_errors ?? [],
  networkFailures: wire.network_failures ?? [],
  apiCalls: (wire.api_calls ?? []).map((call) => ({ method: call.method, path: call.url, status: call.status })),
  actionTrail: (wire.action_trail ?? []).map((entry) => entry.detail),
  userAgent: wire.user_agent ?? '',
  hasSnapshot: wire.dom_snapshot === undefined,
})

/** GET /api/v1/store/problem-reports. The envelope's `rows` is required —
 * a 200 with no rows array is not an answer this handler produces. */
export const problemReports = (wire: ProblemReportsPageWire): ProblemReport[] => wire.rows.map(problemReport)

/** PATCH /api/v1/problem-reports/{id} body.
 *
 * The store's three statuses are open | triaged | closed; the page's other
 * two — `fixed` and `wontfix` — both mean "done", which is what `closed`
 * holds, so both land there. Sent verbatim they would be a 400 on a status
 * the store has no room for, and the page's own two terminal choices would
 * be unreachable against a real backend. */
export const problemStatusPatch = (status: ProblemStatus): ProblemStatusPatchWire => ({ status: status === 'fixed' || status === 'wontfix' ? 'closed' : status })

/** Page → POST /api/v1/problem-reports body, plus the actor this process
 * attributes it to.
 *
 * The page's `actionTrail` is `string[]` and the wire's is
 * `{at, kind, detail}[]`; the page's `apiCalls` carry `path` where the wire
 * carries the full `url` plus the request and response bodies. The trail
 * strings go across as `detail`, and the server redacts and truncates
 * everything here before it is stored — `expected` in particular must be
 * non-empty or the POST is a 400.
 *
 * The three actor fields are QUERY params on this endpoint, not body members
 * (problem_reports.rs `submit` takes `Query(actor): Query<ActorQuery>` and
 * `Json(body)` separately), so the seam sends them as `search` and they are
 * not mixed in here. `actor_display_name` has no page source and is left
 * off: the server falls back to `actor_username` when it is empty, which is
 * what the stored `submitted_by_name` would have said anyway. */
export const problemReportBody = (input: ProblemReportInput): ProblemReportBody => ({
  page: input.page,
  expected: input.expected,
  actual: input.actual,
  action_trail: input.actionTrail.map((detail) => ({ at: '', kind: '', detail })),
  console_errors: input.consoleErrors,
  network_failures: input.networkFailures,
  api_calls: input.apiCalls.map((call) => ({ at: '', method: call.method, url: call.path, status: call.status, request_body: '', response_body: '' })),
  dom_snapshot: input.domSnapshot ?? '',
  user_agent: input.userAgent,
})

// ---- captured mail ---------------------------------------------------------

const mailAddress = (wire: { name: string; address: string }): MailAddress => ({ name: wire.name, address: wire.address })

/** GET /api/v1/mail/{session_id}. One document serves both the summary and
 * the detailed read — the seam's `getMail` and the component's detailed
 * fetch are the same endpoint with no flag between them.
 *
 * `fromHtml` has no source: mail.rs takes the plain-text part when there is
 * one and otherwise decodes the HTML part to a string, and does not say
 * which happened. It reads as false. */
export const capturedMail = (wire: MailWire): CapturedMail => ({
  sessionId: wire.session_id,
  sizeBytes: wire.size_bytes,
  importedAt: wire.imported_at,
  from: wire.from ? mailAddress(wire.from) : null,
  to: wire.to.map(mailAddress),
  subject: wire.subject,
  date: wire.date,
  messageId: wire.message_id,
  bodyText: wire.body_text,
  fromHtml: false,
  attachments: wire.attachments.map((a) => ({ filename: a.filename, contentType: a.content_type, sizeBytes: a.size_bytes, sha256: a.sha256 })),
})

// ---- attack vectors --------------------------------------------------------

const vectorRows = (rows: AttackVectorsWire['ports']): CountRow[] => rows.map((row) => ({ id: row.key, label: row.key, count: row.count }))

/** GET /api/v1/attack-vectors?sensor= — the overview heatmap's per-sensor
 * panel. The server-built `link` on each bucket has no page field; the page
 * builds its own drill-down from the key. */
export const attackVectors = (wire: AttackVectorsWire): { ports: CountRow[]; protocols: CountRow[] } => ({ ports: vectorRows(wire.ports), protocols: vectorRows(wire.protocols) })

// ---- the whole settings page ------------------------------------------------

/**
 * Assembles `getSettings`' payload from the seven endpoints it reads, so a
 * caller has one place to see which wire document became which page field.
 * `reportTemplates` is imported from the reports slice, not retyped (#79).
 */
export function settingsData(parts: {
  user: SettingsData['user']
  config: ConfigWire
  templates: ReportTemplate[]
  users: UsersWire
  preferences: PreferencesDocWire
  services: ServicesWire
  history: ConfigHistoryWire
  audit: AuditWire
  reporter: ReporterStatsWire
  storage: StorageWire
}): SettingsData {
  return {
    user: parts.user,
    users: dashboardOperators(parts.users),
    preferences: preferences(parts.preferences),
    services: services(parts.services).services,
    history: configHistory(parts.history),
    audit: auditEntries(parts.audit),
    config: dashboardConfig(parts.config),
    reporter: reporterStats(parts.reporter),
    storage: esStorage(parts.storage),
    reportTemplates: parts.templates,
  }
}