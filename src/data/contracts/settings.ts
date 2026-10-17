// The settings, preferences and shell payloads the Rust tier serves
// (backend-service preferences.rs, config.rs, config_history.rs, audit.rs,
// health.rs, services_control.rs, reporter_stats.rs, problem_reports.rs,
// mail.rs, detail.rs), as they arrive on the wire.
//
// Two things here are worth reading before trusting the rest:
//
// 1. `PUT /api/v1/preferences` MERGES. It deserializes into a
//    `PreferencesPatch` of `Option<T>` and applies only the fields that are
//    present onto the stored document (preferences.rs
//    `PreferencesPatch::apply`). It is not a replace. The patch struct is
//    `#[serde(deny_unknown_fields)]`, so one key the backend does not know
//    400s the whole request — a full-document PUT carrying the page's
//    `notifyCanary` would take every other preference down with it. Send
//    only what changed; `../adapters/settings`'s `preferencesPatch` does.
//
// 2. `POST /api/v1/config/validate` answers `problems` as a flat array of
//    prose, not the per-field map the page's `ConfigProblems` is. The
//    adapter parses the leading `section.field` back out.

// ---- preferences -----------------------------------------------------------

/** preferences.rs `default_preferences` — the document every operator
 * starts from and the one `POST /api/v1/preferences/reset` restores. Every
 * field is always set on the wire. */
export interface PreferencesDocWire {
  theme: string
  palette: string
  density: string
  reduced_motion: string
  collapsed_sidebar: boolean
  landing_page: string
  remember_filters: boolean
  rows_per_page: number
  wrap_long_values: boolean
  timezone: string
  clock: string
  timestamps: string
  auto_refresh: boolean
  refresh_interval_seconds: number
  live_toasts: boolean
  live_toast_interval_seconds: number
  map_basemap: string
  map_clustering: boolean
  map_animation: boolean
  high_contrast: boolean
  large_evidence_text: boolean
  notify_severity: string
  notify_sound: boolean
  notify_desktop: boolean
  default_event_window: string
  /** Wire-only: no page field. Carried through the merge untouched. */
  preserve_filters: boolean
  open_details_new_tab: boolean
}

/** GET /api/v1/preferences, and the answer to PUT /api/v1/preferences and
 * POST /api/v1/preferences/reset. `revision` is the subject's own
 * `preferences_revision`, bumped by every write; it is not the config
 * document's revision. The GET always returns the WHOLE document — there
 * is no projection or subset. */
export interface PreferencesWire {
  preferences: PreferencesDocWire
  revision: number
}

/** preferences.rs `PreferencesPatch` — the `patch` member of the PUT body.
 * Every member is optional and only the present ones are applied. Anything
 * not listed here is rejected outright (`deny_unknown_fields`). */
export type PreferencesPatchWire = Partial<PreferencesDocWire>

/** PUT /api/v1/preferences body: `PreferencesWriteBody`. `role` is accepted
 * for symmetry and ignored — PUT never touches `role_snapshot`. */
export interface PreferencesWriteBody {
  subject: string
  username?: string
  role?: string
  patch: PreferencesPatchWire
}

/** POST /api/v1/preferences/reset body: `PreferencesResetBody`. `timezone`
 * is not a reset-to-default — it seeds `default_preferences`'s timezone. */
export interface PreferencesResetBody {
  subject: string
  username?: string
  role?: string
  timezone?: string
}

// ---- dashboard config ------------------------------------------------------

/** One `payload.*` block of the dashboard-config-v1 document.
 *
 * The handlers work at the JSON `Value` level (config.rs's module doc says
 * so explicitly), so these are the keys the *validator* knows about plus the
 * few the rest of the tier reads. Anything else round-trips untouched, and
 * anything absent reads as the page's default.
 *
 * `presentation` — every key config.rs `PRESENTATION_TEXT_LIMITS`,
 * `help_link_url`, `banner_severity` and `banner_expires` constrain;
 * `title_format` is stored but unvalidated; `brand_prefix` is validated and
 * has no page field. */
export interface PresentationWire {
  app_name?: string
  title_format?: string
  product_label?: string
  dashboard_title?: string
  dashboard_subtitle?: string
  org_name?: string
  overview_intro?: string
  help_link_label?: string
  help_link_url?: string
  banner_text?: string
  banner_severity?: string
  banner_expires?: string
  footer_text?: string
  ai_disclaimer?: string
  privacy_notice?: string
  /** Validated (`brand_prefix`, max 20 chars); no page field. */
  brand_prefix?: string
}

/** One `payload.behavior` block. `default_time_window`,
 * `rows_per_page_options`, `max_export_rows`,
 * `refresh_interval_seconds_options`, `source_stale_minutes` and
 * `map_provider` are what config.rs `validate_behavior` constrains; the rest
 * are stored and read elsewhere — `show_problem_report_button` gates
 * POST /api/v1/problem-reports (problem_reports.rs `button_enabled`). */
export interface BehaviorWire {
  default_landing?: string
  default_time_window?: string
  rows_per_page_options?: number[]
  max_export_rows?: number
  refresh_interval_seconds_options?: number[]
  source_stale_minutes?: number
  map_provider?: string
  default_timezone?: string
  show_ml_panels?: boolean
  maintenance_mode?: boolean
  read_only?: boolean
  show_problem_report_button?: boolean
}

/** One `payload.honeypot` block. Every field here is one config.rs
 * `validate_honeypot` bounds. */
export interface HoneypotWire {
  alert_cooldown?: string
  alert_campaign_score?: number
  sandbox_alert_risk_score?: number
  ml_alert_threshold?: number
  yara_scan_interval_seconds?: number
  yara_max_bytes?: number
  payload_dedupe_interval_seconds?: number
}

/** `payload.report_presets`: name/description overrides keyed by report
 * template id. An arbitrary object on the wire; config.rs
 * `validate_report_presets` checks each key against the live template
 * catalog. */
export type ReportPresetsWire = Record<string, { name?: string; description?: string }>

/** The four `payload.*` blocks, under the wire's own snake_case name. */
export interface ConfigPayloadWire {
  presentation?: PresentationWire
  behavior?: BehaviorWire
  honeypot?: HoneypotWire
  report_presets?: ReportPresetsWire
}

/** GET /api/v1/config, and the answer to every config write. The document is
 * opaque `Value` in the tier; these are the keys the whole system reads.
 * `revision` is monotonic and is what `If-Match` carries. A document that
 * was never written answers `{revision: 0, payload: {}}`. */
export interface ConfigWire {
  revision: number
  payload: ConfigPayloadWire
  schema_version?: number
  /** RFC 3339, written on every save. Absent on the never-written default. */
  updated?: string
}

/** The URL section names `PUT /api/v1/config/{section}` accepts
 * (config.rs `config_section_key`). Anything else — including
 * `presentation`, which has its own route — is a 404 "unknown config
 * section". */
export type ConfigSectionPath = 'honeypot' | 'behavior' | 'report-presets'

/** POST /api/v1/config/validate body: an object of sections, keyed
 * presentation | behavior | honeypot | report_presets | report-presets.
 * Only the sections present are checked, and within a section only the
 * fields present — a preview validates what is about to be saved, not the
 * stored document. */
export interface ConfigValidateBody {
  presentation?: PresentationWire
  behavior?: BehaviorWire
  honeypot?: HoneypotWire
  report_presets?: ReportPresetsWire
  'report-presets'?: ReportPresetsWire
}

/** POST /api/v1/config/validate response. `problems` is a flat array of
 * prose, most of them prefixed `section.field ` — NOT the per-field map the
 * page's `ConfigProblems` is. Messages without a dotted prefix name the
 * section or the whole patch ("unknown config section \"mystery\"",
 * "report_presets has an unknown template id \"x\""). */
export interface ConfigValidateWire {
  ok: boolean
  problems: string[]
}

/** POST /api/v1/config/rollback body: `RollbackBody`. `revision` is the
 * INTEGER from `GET /api/v1/config/history` — the page's `rev-41` string
 * id does not exist on the wire. Restores that revision's payload as a new
 * revision; history is append-only. */
export interface ConfigRollbackBody {
  revision: number
  actor_subject?: string
  actor_username?: string
}

// ---- history and audit -----------------------------------------------------

/** One `config_history::HistoryEntry` as `GET /api/v1/config/history`
 * returns it — the retained payload snapshot deliberately excluded, so a
 * rollback still works but the list is cheap. Newest first, at most
 * HISTORY_READ_LIMIT (200). */
export interface ConfigHistoryEntryWire {
  revision: number
  /** RFC 3339. */
  time: string
  actor_subject: string
  actor_username: string
  /** update | rollback */
  action: string
  /** The `payload.*` key(s) the entry wrote; absent when empty
   * (`skip_serializing_if`), `["*"]` for a rollback. */
  fields?: string[]
}

/** GET /api/v1/config/history. */
export interface ConfigHistoryWire {
  entries: ConfigHistoryEntryWire[]
}

/** One line of the JSONL audit log (audit.rs `AuditEvent`), as
 * `GET /api/v1/audit` returns it. No id — the log has no key. `time`,
 * `request_id` and `client_ip` are `skip_serializing_if` empty, so they can
 * be absent. `result` is success | conflict | invalid | error. */
export interface AuditEventWire {
  actor_subject: string
  actor_username: string
  action: string
  /** The changed field names; values are never logged. */
  fields?: string[]
  revision: number
  result: string
  time?: string
  request_id?: string
  client_ip?: string
}

/** GET /api/v1/audit?limit=&action= — newest first. `limit` defaults to 100
 * and is clamped to [1, 500]. Not paged and not ES-backed: the log is one
 * JSONL file, one rotated generation, so the ceiling is however many events
 * fit in 8 MiB since the last rotation. */
export interface AuditWire {
  events: AuditEventWire[]
}

// ---- users -----------------------------------------------------------------

/** GET /api/v1/users, one row per subject in the preferences store. Note
 * there is no display name — `username` is the store's `last_username`. */
export interface DashboardUserWire {
  subject: string
  username: string
  /** The store's `role_snapshot`, written at first contact; not the live
   * identity-provider role. */
  role: string
  first_seen_at: string
  last_seen_at: string
}

export interface UsersWire {
  users: DashboardUserWire[]
}

// ---- services --------------------------------------------------------------

/** One row of the services adapter's inventory, as
 * `GET /api/v1/services` forwards it. The shape comes from
 * `services-adapter/services-adapter.py` `container_status`, which is its
 * only writer: `services_control.rs` `load_services_status` forwards the
 * adapter's rows verbatim after checking that `name` is non-empty and
 * `state` is one of the nine below, rejecting the whole response otherwise.
 * The handler adds, renames and defaults nothing. */
export interface ServiceWire {
  name: string
  /** running | exited | restarting | paused | created | removing | dead |
   * not_found | unknown */
  state: string
  /** Docker's `State.ExitCode`. Null while the container is running. Absent,
   * with `started_at` and `restart_count`, on a `not_found` or `unknown` row:
   * `container_status` returns just `{name, state}` when the inspect call
   * failed or the container does not exist. */
  exit_code?: number | null
  /** Docker's `State.StartedAt`. */
  started_at?: string | null
  /** The container's `RestartCount` (a top-level inspect field), not
   * `State`'s. */
  restart_count?: number | null
  /** Docker's `State.Health.Status`. Absent unless the image declares a
   * HEALTHCHECK — services-adapter.py adds the key only when `Health` is a
   * dict carrying a truthy `Status`. */
  health?: string
}

/** GET /api/v1/services. Always a 200-with-`available:true` or a 503 with
 * `available:false` and a reason — never a bare empty list, so a pane can
 * tell "no services" from "the adapter is down". */
export interface ServicesWire {
  available: boolean
  services: ServiceWire[]
  /** Present when `available` is false. */
  reason?: string
}

/** GET /api/v1/services/{name}/logs?lines=200. `lines` defaults to 200 and
 * is clamped to 1000. The log is ONE plain-text blob, not a per-line
 * envelope: there is no level per line. */
export interface ServiceLogsWire {
  name: string
  /** The value actually used, after the clamp. */
  lines: number
  log: string
}

/** POST /api/v1/services/{name}/{action}, where action is one of
 * start | stop | restart (services_control.rs `VALID_ACTIONS`). The answer
 * is an ack, not the service's new state — refetch the list. `POST
 * /api/v1/services/{name}/{other}` is a 400 "unsupported action". */
export type ServiceActionWireResponse =
  | { ok: true; name: string; action: string }
  | { ok: false; error: string }

// ---- reporter and storage --------------------------------------------------

/** GET /api/v1/reporter-stats. `available:false` carries `reason` and no
 * `stats` — an unreachable store, an index with nothing in it yet, and a
 * document missing `reporter_metrics` all land here (the last as a 500). */
export interface ReporterStatsWire {
  available: boolean
  reason?: string
  /** The reporter worker's own metrics.json, mirrored by
   * es-results-importer. TBD: a raw `_source`, so the keys below are the
   * reporter's, not this crate's — reporter_stats.rs passes it through
   * without a struct. */
  stats?: {
    attempted?: number
    sent?: number
    suppressed_cooldown?: number
    dry_run?: number
    failed?: number
    updated_at?: string
  }
}

/** GET /api/v1/settings/storage (health.rs `Storage`). There is no
 * per-family breakdown on this endpoint. */
export interface StorageWire {
  /** green | yellow | red, or "unreachable" when the cluster could not be
   * asked (es.rs `cluster_status`). */
  cluster_status: string
  index_count: number
  doc_count: number
  store_bytes: number
}

// ---- problem reports -------------------------------------------------------

/** One entry of the report-a-problem capture trail, as
 * problem_reports.rs `ActionEntry` reads it. */
export interface ProblemActionTrailWire {
  at: string
  /** click | nav | … — whatever the client recorded. */
  kind: string
  detail: string
}

/** One captured API call, as problem_reports.rs `ApiCall` reads it. Note
 * `url`, and that the server masks every query-string value in it before
 * storing. */
export interface ProblemApiCallWire {
  at: string
  method: string
  url: string
  status: number
  request_body: string
  response_body: string
}

/** POST /api/v1/problem-reports body: problem_reports.rs `Submission`, and
 * the ONLY shape a submission is trusted from — no id, timestamp, submitter
 * or status, the server assigns those.
 *
 * Everything here is redacted and truncated by the server before it is ever
 * written (the trust boundary is here, not in the client): captured text to
 * 20 KB, the DOM snapshot to 200 KB, the trail to the last 200 entries, 50
 * console errors, 50 network failures, 30 API calls, and every query-string
 * VALUE in a captured URL masked unconditionally. `expected` must be
 * non-empty (400) and `behavior.show_problem_report_button` must be on
 * (404) or the POST is refused. */
export interface ProblemReportBody {
  page: string
  expected: string
  actual: string
  action_trail: ProblemActionTrailWire[]
  console_errors: string[]
  network_failures: string[]
  api_calls: ProblemApiCallWire[]
  dom_snapshot: string
  user_agent: string
}

/** The 201 answer to POST /api/v1/problem-reports. */
export interface ProblemReportCreatedWire {
  id: string
}

/** One `dashboard-problem-reports-v1` document, as
 * `GET /api/v1/store/problem-reports` passes it through (stores.rs
 * `store_config` excludes `dom_snapshot` from `_source`; `_doc_id` rides
 * along for row-level actions).
 *
 * Note what is NOT here: there is no `GET /api/v1/problem-reports`. The
 * Rust tier serves only the POST and the PATCH; the list the settings and
 * problem-reports pages render comes from the allowlisted generic store
 * passthrough, exactly as the canonical page reads it. The document is
 * post-redaction by construction — problem_reports.rs redacts on write, so
 * nothing below is a second pass. */
export interface ProblemReportRowWire extends Record<string, unknown> {
  id: string
  submitted_at: string
  /** The OIDC subject the BFF passed; the display name is `submitted_by_name`. */
  submitted_by: string
  submitted_by_name?: string
  page: string
  expected: string
  actual: string
  /** The four capture lists are omitted, not empty: they are truncated by
   * size (the trail to 200 entries, 50 console errors, 50 network failures,
   * 30 API calls) and a document that hit the cap is not the same thing as
   * one that had nothing to report. `api.ts`'s caller is the seam's only
   * reader and passes the wire shape straight through, so the contract does
   * not narrow them — the adapter defaults each to `[]`, which is the
   * honest reading of an absent list and is why `ProblemReport`'s own field
   * types stay non-optional. */
  action_trail?: ProblemActionTrailWire[]
  console_errors?: string[]
  network_failures?: string[]
  api_calls?: ProblemApiCallWire[]
  /** Absent: the store excludes it from `_source`, so its presence can only
   * be inferred from that exclusion. */
  dom_snapshot?: string
  user_agent?: string
  status: string
}

/** GET /api/v1/store/problem-reports?offset=&size=. `size` is clamped to 100
 * (stores.rs `store_search_body`), newest first by `submitted_at`. */
export interface ProblemReportsPageWire {
  total: number
  rows: ProblemReportRowWire[]
}

/** PATCH /api/v1/problem-reports/{id} body: problem_reports.rs `StatusPatch`.
 * The wire accepts exactly open | triaged | closed — `fixed` and `wontfix`
 * are the page's own vocabulary and have no status the store can hold. */
export interface ProblemStatusPatchWire {
  status: string
}

// ---- captured mail ---------------------------------------------------------

/** mail.rs `MailAddress` — both parts default to "" when the header
 * carried none. */
export interface MailAddressWire {
  name: string
  address: string
}

/** mail.rs `MailAttachment` — metadata only; the bytes are never served,
 * so this endpoint cannot become a malware source. */
export interface MailAttachmentWire {
  filename: string
  content_type: string
  size_bytes: number
  sha256: string
}

/** GET /api/v1/mail/{session_id}. One response carries both the summary and
 * the detail — there is no query flag and no second endpoint; the page's
 * two seam functions read the same document.
 *
 * The body is text only: `body_text` is the plain-text part, or the HTML
 * part decoded to a string when there was no plain part (mail.rs
 * `parse_eml`). The page cannot tell which happened — the wire does not say
 * — so `fromHtml` has no source and reads as false.
 *
 * `eml_base64` (the raw .eml) and `body_path` (the on-disk name it was
 * mirrored from) have no page field. */
export interface MailWire {
  session_id: string
  body_path: string
  size_bytes: number
  imported_at: string
  /** mail.rs `from` is an `Option` with no skip_serializing_if: a message
   * with no From header carries an explicit null, not an absent key. */
  from: MailAddressWire | null
  to: MailAddressWire[]
  subject: string
  /** The Date header as sent, RFC 3339; "" when the message carried none. */
  date: string
  message_id: string
  body_text: string
  attachments: MailAttachmentWire[]
  eml_base64: string
}

// ---- attack vectors --------------------------------------------------------

/** One aggregation bucket. The `link` is a server-built drill-down href
 * (`/events?sensor=…&port=…`) with no page field. */
export interface VectorBucketWire {
  key: string
  count: number
  link: string
}

/** GET /api/v1/attack-vectors?sensor= — the overview heatmap's per-sensor
 * panel, last 24h, top 12 ports and protocols. `sensor` is required and
 * empty/suricata/portbridge are refused with a 400: those ship to their own
 * index families and would read as a silent empty. */
export interface AttackVectorsWire {
  sensor: string
  ports: VectorBucketWire[]
  protocols: VectorBucketWire[]
}