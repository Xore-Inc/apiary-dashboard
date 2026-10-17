// Settings, preferences and shell adapters: one realistic wire fixture per
// endpoint, mapped to the page types the settings page already renders.
import { describe, expect, it } from 'vitest'
import type { ConfigWire, MailWire, PreferencesDocWire, PreferencesPatchWire, ProblemReportBody } from '../contracts/settings'
import {
  attackVectors,
  auditEntries,
  capturedMail,
  configHistory,
  configProblems,
  configRollbackBody,
  configSectionBody,
  configSectionPath,
  configValidateBody,
  dashboardConfig,
  dashboardOperators,
  esStorage,
  preferences,
  preferencesDocument,
  preferencesPatch,
  preferencesQuery,
  preferencesResetBody,
  preferencesWriteBody,
  problemReportBody,
  reporterStats,
  serviceLogs,
  services,
  settingsData,
  shellConfig,
} from './settings'

const doc: PreferencesDocWire = {
  theme: 'dark',
  palette: 'sage',
  density: 'compact',
  reduced_motion: 'off',
  collapsed_sidebar: true,
  landing_page: '/events',
  remember_filters: true,
  rows_per_page: 25,
  wrap_long_values: true,
  timezone: 'Europe/Berlin',
  clock: 'h12',
  timestamps: 'absolute',
  auto_refresh: false,
  refresh_interval_seconds: 120,
  live_toasts: true,
  live_toast_interval_seconds: 300,
  map_basemap: 'osm',
  map_clustering: false,
  map_animation: true,
  high_contrast: true,
  large_evidence_text: false,
  notify_severity: 'critical',
  notify_sound: true,
  notify_desktop: false,
  default_event_window: '7d',
  preserve_filters: true,
  open_details_new_tab: true,
}

const config: ConfigWire = {
  revision: 14,
  schema_version: 4,
  updated: '2026-10-04T09:12:00Z',
  payload: {
    presentation: {
      app_name: 'APIARY',
      title_format: '{page} — {app}',
      product_label: 'Automated Payload Intelligence',
      dashboard_title: 'Overview',
      dashboard_subtitle: 'What reached the decoys',
      org_name: 'Example SOC',
      overview_intro: '',
      help_link_label: 'Runbook',
      help_link_url: 'https://example.test/runbook',
      banner_text: 'Maintenance window Sunday',
      banner_severity: 'warning',
      banner_expires: '2026-10-06T02:00:00Z',
      footer_text: 'APIARY honeypot platform',
      ai_disclaimer: 'Model output can be wrong.',
      privacy_notice: 'Captured traffic holds third-party data.',
      brand_prefix: 'APIARY',
    },
    behavior: {
      default_landing: '/',
      default_time_window: '24h',
      rows_per_page_options: [25, 50, 100],
      max_export_rows: 5000,
      refresh_interval_seconds_options: [15, 30, 60],
      source_stale_minutes: 15,
      map_provider: 'osm',
      default_timezone: 'browser',
      show_ml_panels: true,
      maintenance_mode: false,
      read_only: false,
      show_problem_report_button: true,
    },
    honeypot: {
      alert_cooldown: '30m',
      alert_campaign_score: 70,
      sandbox_alert_risk_score: 80,
      ml_alert_threshold: 0.85,
      yara_scan_interval_seconds: 3600,
      yara_max_bytes: 67_108_864,
      payload_dedupe_interval_seconds: 900,
    },
    report_presets: { executive: { name: 'Board briefing', description: 'One page for the monthly review.' } },
  },
}

describe('preferences adapters', () => {
  it('maps the whole document the GET always returns', () => {
    const prefs = preferencesDocument({ preferences: doc, revision: 3 })
    expect(prefs).toEqual({
      theme: 'dark',
      palette: 'sage',
      density: 'compact',
      motion: 'off',
      highContrast: true,
      largeEvidenceText: false,
      wrapLongValues: true,
      collapsedSidebar: true,
      landing: '/events',
      rowsPerPage: 25,
      openDetailsInNewTab: true,
      rememberFilters: true,
      timezone: 'Europe/Berlin',
      clock: 'h12',
      timestamps: 'absolute',
      autoRefresh: false,
      refreshSeconds: 120,
      liveToasts: true,
      liveToastSeconds: 300,
      mapBasemap: 'osm',
      mapClustering: false,
      mapAnimation: true,
      notifySeverity: 'critical',
      notifySound: true,
      notifyDesktop: false,
      notifyCanary: false,
      defaultWindow: '7d',
    })
  })

  it('drops the wire-only preserve_filters and keeps an unknown palette', () => {
    // `palette` is shape-checked by the backend, not list-checked, so a new
    // theme name has to survive the round trip; `preserve_filters` is stored
    // and never rendered, so it must not reach the page.
    const prefs = preferences({ ...doc, palette: 'nightwatch' })
    expect(prefs.palette).toBe('nightwatch')
    expect(prefs).not.toHaveProperty('preserve_filters')
  })

  it('falls back when a document predates an enum the page now offers', () => {
    const prefs = preferences({ ...doc, theme: 'sepia', clock: 'h36', density: 'roomy' })
    expect([prefs.theme, prefs.clock, prefs.density]).toEqual(['system', 'h24', 'comfortable'])
  })

  it('builds the query and the write/reset bodies', () => {
    expect(preferencesQuery('oidc|1', { username: 'operator', role: 'admin', timezone: 'UTC' })).toEqual({
      subject: 'oidc|1',
      username: 'operator',
      role: 'admin',
      timezone: 'UTC',
    })
    expect(preferencesQuery('oidc|1')).toEqual({ subject: 'oidc|1' })
    expect(preferencesWriteBody('oidc|1', { theme: 'dark' }, 'operator')).toEqual({ subject: 'oidc|1', username: 'operator', patch: { theme: 'dark' } })
    expect(preferencesResetBody('oidc|1', 'operator', 'UTC')).toEqual({ subject: 'oidc|1', username: 'operator', timezone: 'UTC' })
  })

  it('sends only the fields a partial setter changed', () => {
    // The regression this slice can introduce: preferences.rs MERGES the
    // patch into the stored document, so anything sent that the operator
    // did not change overwrites their setting. A full page object is the
    // wrong shape — `changed` is what the caller edited.
    const page = preferences(doc)
    expect(preferencesPatch({ theme: 'light' })).toEqual({ theme: 'light' })
    expect(preferencesPatch({ liveToasts: false })).toEqual({ live_toasts: false })
    expect(preferencesPatch({ mapClustering: false, mapAnimation: false })).toEqual({ map_clustering: false, map_animation: false })
    expect(preferencesPatch({})).toEqual({})
    // A caller that hands over the whole object gets the whole patch, which
    // is exactly why the seam's partial setters must not.
    expect(Object.keys(preferencesPatch(page)).length).toBeGreaterThan(1)
  })

  it('never sends a key the patch struct would reject', () => {
    // The patch is `deny_unknown_fields`; `notifyCanary` and `mapBasemap`
    // are page-only, so a save carrying them 400s the whole request.
    const patch = preferencesPatch(preferences(doc))
    const keys = Object.keys(patch) as Array<keyof PreferencesPatchWire>
    expect(keys).not.toContain('notify_canary')
    expect(keys).not.toContain('map_basemap')
    expect(keys).not.toContain('preserve_filters')
  })
})

describe('config adapters', () => {
  it('maps GET /config', () => {
    expect(dashboardConfig(config)).toMatchObject({
      revision: 14,
      presentation: { appName: 'APIARY', titleFormat: '{page} — {app}', bannerSeverity: 'warning', bannerExpires: '2026-10-06T02:00:00Z' },
      behavior: { defaultLanding: '/', rowsPerPageOptions: [25, 50, 100], sourceStaleMinutes: 15, mapProvider: 'osm', showProblemReportButton: true },
      honeypot: { alertCooldown: '30m', mlAlertThreshold: 0.85, yaraMaxBytes: 67_108_864 },
      reportPresets: { executive: { name: 'Board briefing', description: 'One page for the monthly review.' } },
    })
  })

  it('maps a never-written document to empty defaults', () => {
    const empty = dashboardConfig({ revision: 0, payload: {} })
    expect(empty.presentation.appName).toBe('')
    expect(empty.behavior.rowsPerPageOptions).toEqual([])
    expect(empty.behavior.showProblemReportButton).toBe(false)
    expect(empty.reportPresets).toEqual({})
  })

  it('keeps the shell links the config document does not carry', () => {
    expect(shellConfig(config, { kibana: 'https://kibana.example.test' })).toMatchObject({
      presentation: { appName: 'APIARY' },
      behavior: { defaultLanding: '/' },
      links: { kibana: 'https://kibana.example.test' },
    })
  })

  it('keeps a stored brand_prefix through a presentation save', () => {
    const loaded = dashboardConfig(config)
    expect(loaded.presentation.brandPrefix).toBe('APIARY')
    expect(configSectionBody('presentation', loaded.presentation)).toMatchObject({ brand_prefix: 'APIARY' })
    // The page never edits it, so a save of an edited page still carries the loaded value.
    expect(configSectionBody('presentation', { ...loaded.presentation, appName: 'Renamed' })).toMatchObject({ app_name: 'Renamed', brand_prefix: 'APIARY' })
  })

  it('leaves an absent or empty brand_prefix absent from the presentation save', () => {
    const absent = dashboardConfig({ revision: 3, payload: { presentation: { app_name: 'APIARY' } } })
    expect(absent.presentation.brandPrefix).toBeUndefined()
    expect(configSectionBody('presentation', absent.presentation)).not.toHaveProperty('brand_prefix')
    const empty = dashboardConfig({ revision: 3, payload: { presentation: { app_name: 'APIARY', brand_prefix: '' } } })
    expect(empty.presentation.brandPrefix).toBeUndefined()
    expect(configSectionBody('presentation', empty.presentation)).not.toHaveProperty('brand_prefix')
  })

  it('routes each section to the path the backend accepts', () => {
    expect([configSectionPath('presentation'), configSectionPath('behavior'), configSectionPath('honeypot'), configSectionPath('reportPresets')]).toEqual([
      'presentation',
      'behavior',
      'honeypot',
      'report-presets',
    ])
  })

  it('builds whole-section bodies, since both handlers replace their block', () => {
    const page = dashboardConfig(config)
    expect(configSectionBody('behavior', page.behavior)).toMatchObject({ default_time_window: '24h', rows_per_page_options: [25, 50, 100], map_provider: 'osm' })
    expect(configSectionBody('reportPresets', page.reportPresets)).toEqual({ executive: { name: 'Board briefing', description: 'One page for the monthly review.' } })
    // A preset with only a name must not send `description: undefined`.
    expect(configSectionBody('reportPresets', { executive: { name: 'Ops digest' } })).toEqual({ executive: { name: 'Ops digest', description: '' } })
    expect(configValidateBody('honeypot', page.honeypot)).toEqual({ honeypot: configSectionBody('honeypot', page.honeypot) })
    expect(Object.keys(configValidateBody('reportPresets', page.reportPresets))).toEqual(['report_presets'])
  })

  it('keys the validator prose into the page field map', () => {
    expect(
      configProblems({
        ok: false,
        problems: ['presentation.app_name must not be empty', 'behavior.max_export_rows must be an integer between 100 and 100000', 'honeypot.alert_cooldown must be a duration between 5m and 168h'],
      }),
    ).toEqual({
      'presentation.app_name': 'must not be empty',
      'behavior.max_export_rows': 'must be an integer between 100 and 100000',
      'honeypot.alert_cooldown': 'must be a duration between 5m and 168h',
    })
  })

  it('keeps a message that names no field, and reads a clean answer as no problems', () => {
    expect(configProblems({ ok: false, problems: ['unknown config section "mystery"'] })).toEqual({ 'unknown config section "mystery"': 'unknown config section "mystery"' })
    expect(configProblems({ ok: true, problems: [] })).toEqual({})
  })
})

describe('history, rollback, audit and users', () => {
  it('maps history rows, whose identity is the integer revision', () => {
    const history = configHistory({
      entries: [
        { revision: 41, time: '2026-10-04T08:00:00Z', actor_subject: 'oidc|1', actor_username: 'operator', action: 'update', fields: ['behavior'] },
        { revision: 40, time: '2026-10-03T08:00:00Z', actor_subject: 'oidc|1', actor_username: 'operator', action: 'rollback', fields: ['*'] },
      ],
    })
    expect(history).toEqual([
      { id: '41', at: '2026-10-04T08:00:00Z', actor: 'operator', section: 'behavior', summary: 'Changed behavior' },
      { id: '40', at: '2026-10-03T08:00:00Z', actor: 'operator', section: '*', summary: 'Rolled back a past revision' },
    ])
  })

  it('takes the rollback id back to the integer the backend wants', () => {
    expect(configRollbackBody('41')).toEqual({ revision: 41 })
    expect(configRollbackBody('rev-41')).toEqual({ revision: 41 })
    expect(configRollbackBody('not-a-revision')).toBeNull()
  })

  it('maps audit rows, whose result words are coarser than the page’s', () => {
    expect(
      auditEntries({
        events: [
          { actor_subject: 'oidc|1', actor_username: 'operator', action: 'config.update', fields: ['behavior'], revision: 41, result: 'success', time: '2026-10-04T08:00:00Z' },
          { actor_subject: 'oidc|2', actor_username: 'analyst', action: 'preferences.update', revision: 12, result: 'conflict' },
        ],
      }),
    ).toEqual([
      { id: 'audit-0', at: '2026-10-04T08:00:00Z', actor: 'operator', action: 'config.update', fields: ['behavior'], result: 'ok' },
      { id: 'audit-1', at: '', actor: 'analyst', action: 'preferences.update', fields: [], result: 'rejected' },
    ])
  })

  it('maps users, falling back to the subject when there is no username', () => {
    expect(
      dashboardOperators({
        users: [
          { subject: 'oidc|1', username: 'operator', role: 'admin', first_seen_at: '2026-06-01T00:00:00Z', last_seen_at: '2026-10-04T08:00:00Z' },
          { subject: 'oidc|2', username: 'analyst', role: 'something-else', first_seen_at: '2026-09-01T00:00:00Z', last_seen_at: '2026-10-04T07:00:00Z' },
        ],
      }),
    ).toEqual([
      { subject: 'oidc|1', username: 'operator', name: 'operator', role: 'admin', firstSeenAt: '2026-06-01T00:00:00Z', lastSeenAt: '2026-10-04T08:00:00Z' },
      { subject: 'oidc|2', username: 'analyst', name: 'analyst', role: 'admin', firstSeenAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-10-04T07:00:00Z' },
    ])
  })
})

describe('services, reporter and storage', () => {
  it('maps the service list, an adapter state the page has no word for reading as unknown', () => {
    expect(
      services({
        available: true,
        services: [
          { name: 'hp-tanner', state: 'running', exit_code: null, started_at: '2026-10-04T08:00:00Z', restart_count: 0 },
          { name: 'hp-cowrie', state: 'paused', exit_code: 137, started_at: '2026-10-03T08:00:00Z', restart_count: 4, health: 'unhealthy' },
        ],
      }),
    ).toEqual({
      available: true,
      services: [
        { name: 'hp-tanner', stack: '', state: 'running', uptime: '', image: '' },
        { name: 'hp-cowrie', stack: '', state: 'unknown', uptime: '', image: '' },
      ],
    })
  })

  it('keeps the adapter-down answer rather than rendering it as no services', () => {
    expect(services({ available: false, services: [], reason: 'services adapter is not configured' })).toEqual({
      available: false,
      services: [],
      reason: 'services adapter is not configured',
    })
  })

  it('splits the log blob on newlines, keeping the clamped line count', () => {
    expect(serviceLogs({ name: 'hp-tanner', lines: 200, log: 'a\nb\nc\n' })).toEqual({ name: 'hp-tanner', lines: 200, text: ['a', 'b', 'c'] })
    expect(serviceLogs({ name: 'hp-cowrie', lines: 1000, log: '' }).text).toEqual([])
  })

  it('reads reporter stats only when the reporter answered', () => {
    expect(reporterStats({ available: true, stats: { attempted: 1842, sent: 1206, suppressed_cooldown: 598, dry_run: 0, failed: 38, updated_at: '2026-10-04T08:56:00Z' } })).toEqual({
      available: true,
      stats: { attempted: 1842, sent: 1206, suppressedCooldown: 598, dryRun: 0, failed: 38, updatedAt: '2026-10-04T08:56:00Z' },
    })
    expect(reporterStats({ available: false, reason: 'no reporter metrics indexed yet' })).toEqual({ available: false, reason: 'no reporter metrics indexed yet' })
  })

  it('fills reporter counters a partial metrics document omits', () => {
    expect(reporterStats({ available: true, stats: { sent: 12 } }).stats).toEqual({ attempted: 0, sent: 12, suppressedCooldown: 0, dryRun: 0, failed: 0, updatedAt: '' })
  })

  it('maps storage, whose endpoint carries no per-family breakdown', () => {
    expect(esStorage({ cluster_status: 'yellow', index_count: 991, doc_count: 1_958_402_117, store_bytes: 6_337_816_832 })).toEqual({
      clusterStatus: 'yellow',
      indexCount: 991,
      docCount: 1_958_402_117,
      storeBytes: 6_337_816_832,
      families: [],
    })
    expect(esStorage({ cluster_status: 'unreachable', index_count: 0, doc_count: 0, store_bytes: 0 }).clusterStatus).toBe('red')
  })
})

describe('problem reports and captured mail', () => {
  it('builds the submit body, widening the page’s flat trail and call path', () => {
    const body = problemReportBody({
      page: '/settings',
      expected: 'Saving the behavior pane keeps the theme',
      actual: 'The theme reverted to system',
      actionTrail: ['clicked Save'],
      consoleErrors: ['TypeError: x is not a function'],
      networkFailures: ['PUT /api/v1/config/behavior 409'],
      apiCalls: [{ method: 'PUT', path: '/api/v1/config/behavior?actor_subject=oidc|1', status: 409 }],
      domSnapshot: '<html></html>',
      userAgent: 'Mozilla/5.0',
    })
    expect(body).toEqual({
      page: '/settings',
      expected: 'Saving the behavior pane keeps the theme',
      actual: 'The theme reverted to system',
      action_trail: [{ at: '', kind: '', detail: 'clicked Save' }],
      console_errors: ['TypeError: x is not a function'],
      network_failures: ['PUT /api/v1/config/behavior 409'],
      api_calls: [{ at: '', method: 'PUT', url: '/api/v1/config/behavior?actor_subject=oidc|1', status: 409, request_body: '', response_body: '' }],
      dom_snapshot: '<html></html>',
      user_agent: 'Mozilla/5.0',
    } satisfies ProblemReportBody)
  })

  it('omits an absent DOM snapshot rather than sending an empty one', () => {
    expect(problemReportBody({ page: '/', expected: 'x', actual: 'y', actionTrail: [], consoleErrors: [], networkFailures: [], apiCalls: [], userAgent: 'UA' }).dom_snapshot).toBe('')
  })

  const mail: MailWire = {
    session_id: 'sess-4417',
    body_path: 'mailoney/2026/10/msg.eml',
    size_bytes: 8123,
    imported_at: '2026-10-04T08:10:00Z',
    from: { name: 'Attacker', address: 'attacker@evil.example' },
    to: [{ name: '', address: 'victim@example.org' }],
    subject: 'invoice attached',
    date: '2026-08-18T10:00:00+00:00',
    message_id: '<abc123@evil.example>',
    body_text: 'see attached',
    attachments: [{ filename: 'payload.bin', content_type: 'application/octet-stream', size_bytes: 5, sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' }],
    eml_base64: 'RnJvbTogQXR0YWNrZXI=',
  }

  it('maps captured mail, whose HTML fallback the wire does not report', () => {
    expect(capturedMail(mail)).toEqual({
      sessionId: 'sess-4417',
      sizeBytes: 8123,
      importedAt: '2026-10-04T08:10:00Z',
      from: { name: 'Attacker', address: 'attacker@evil.example' },
      to: [{ name: '', address: 'victim@example.org' }],
      subject: 'invoice attached',
      date: '2026-08-18T10:00:00+00:00',
      messageId: '<abc123@evil.example>',
      bodyText: 'see attached',
      fromHtml: false,
      attachments: [{ filename: 'payload.bin', contentType: 'application/octet-stream', sizeBytes: 5, sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' }],
    })
  })

  it('reads a mail with no envelope sender as no sender', () => {
    const { from: _, ...withoutSender } = mail
    expect(capturedMail(withoutSender as MailWire).from).toBeNull()
    expect(capturedMail({ ...mail, to: [] }).to).toEqual([])
  })
})

describe('attack vectors and the assembled settings page', () => {
  it('maps the per-sensor heatmap buckets, dropping the server-built link', () => {
    expect(
      attackVectors({
        sensor: 'cowrie',
        ports: [{ key: '22', count: 812, link: '/events?sensor=cowrie&port=22' }],
        protocols: [{ key: 'ssh', count: 812, link: '/events?sensor=cowrie&proto=ssh' }],
      }),
    ).toEqual({ ports: [{ id: '22', label: '22', count: 812 }], protocols: [{ id: 'ssh', label: 'ssh', count: 812 }] })
  })

  it('reads an empty panel as no rows, not as a broken one', () => {
    expect(attackVectors({ sensor: 'cowrie', ports: [], protocols: [] })).toEqual({ ports: [], protocols: [] })
  })

  it('assembles the settings page from the seven documents it reads', () => {
    const page = settingsData({
      user: { name: 'Operator', email: 'operator@example.test', roles: ['admin'] },
      config,
      templates: [{ id: 'executive', name: 'Executive', description: 'One-page brief', elements: ['summary'] }],
      users: { users: [{ subject: 'oidc|1', username: 'operator', role: 'admin', first_seen_at: '2026-06-01T00:00:00Z', last_seen_at: '2026-10-04T08:00:00Z' }] },
      preferences: doc,
      services: { available: true, services: [{ name: 'hp-tanner', state: 'running', exit_code: null, started_at: '2026-10-04T08:00:00Z', restart_count: 0 }] },
      history: { entries: [{ revision: 41, time: '2026-10-04T08:00:00Z', actor_subject: 'oidc|1', actor_username: 'operator', action: 'update', fields: ['behavior'] }] },
      audit: { events: [{ actor_subject: 'oidc|1', actor_username: 'operator', action: 'config.update', fields: ['behavior'], revision: 41, result: 'success', time: '2026-10-04T08:00:00Z' }] },
      reporter: { available: false, reason: 'no reporter metrics indexed yet' },
      storage: { cluster_status: 'green', index_count: 42, doc_count: 1_000, store_bytes: 2_048 },
    })
    expect(page.users).toHaveLength(1)
    expect(page.services).toHaveLength(1)
    expect(page.history[0]?.id).toBe('41')
    expect(page.audit[0]?.result).toBe('ok')
    expect(page.config.revision).toBe(14)
    expect(page.reporter).toEqual({ available: false, reason: 'no reporter metrics indexed yet' })
    expect(page.storage.clusterStatus).toBe('green')
    expect(page.reportTemplates).toHaveLength(1)
    expect(page.preferences.theme).toBe('dark')
  })
})