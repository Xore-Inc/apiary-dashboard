// The dashboard's request bodies against the structs the Rust tier decodes
// them into (#251).
//
// The pinned openapi.json leaves every request body open (`schema: {}`), and
// none of the backend's `#[derive(Deserialize)]` structs sets
// `deny_unknown_fields` except the preferences patch. So a mistyped or renamed
// field is not an error anywhere: serde drops it, the handler falls back to the
// field's default, and the write "succeeds" with the wrong value. These tests
// pin, for every POST/PUT/PATCH the dashboard makes, the exact field set it
// sends against the field set the struct accepts.
//
// RUST below is that field set, transcribed from backend-service at the commit
// pinned in contracts/backend/SOURCE.json. `required` are fields serde has no
// default for (a missing one is a 422), `optional` the `#[serde(default)]` or
// `Option` ones, and `handler` the fields a `#[serde(default)]` struct accepts
// but the handler then refuses to run without (a 400).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveQuery } from './api'
import type { Backend } from './backend'
import { alertAckBody } from './adapters/operations'
import { mlAckBody, mlDispositionBody } from './adapters/monitor'
import { reportDefinitionBody } from './adapters/reports'
import { createWorkbenchRunBody, saveWorkbenchRecipeBody } from './adapters/evidence'
import { configRollbackBody, configSectionBody, configValidateBody, dashboardConfig, preferences, preferencesPatch, preferencesResetBody, preferencesWriteBody, problemReportBody, problemStatusPatch } from './adapters/settings'
import { setIpBlockBody } from './adapters/sources'
import { CONFIG } from './mock/details'
import type { AnalyzerOptions, ProblemStatus, ReportDefinition, WorkbenchRecipe } from './types'
import wireSettings from './__fixtures__/wire-settings.json'

interface Fields {
  /** backend-service source of the struct. */
  rust: string
  required?: string[]
  optional?: string[]
  /** Fields the handler 400s without, though serde would default them. */
  handler?: string[]
}

const PREFERENCE_KEYS = [
  'theme', 'palette', 'density', 'reduced_motion', 'collapsed_sidebar', 'landing_page', 'remember_filters', 'rows_per_page', 'wrap_long_values', 'timezone', 'clock', 'timestamps', 'auto_refresh',
  'refresh_interval_seconds', 'live_toasts', 'live_toast_interval_seconds', 'map_basemap', 'map_clustering', 'map_animation', 'high_contrast', 'large_evidence_text', 'notify_severity', 'notify_sound',
  'notify_desktop', 'default_event_window', 'preserve_filters', 'open_details_new_tab',
]
const WORKBENCH_OPTIONS = ['timeout_seconds', 'max_queue_age_seconds', 'retry_limit']

const RUST = {
  alertAck: { rust: 'stores.rs AckBody', required: ['ack'] },
  canaryCreate: { rust: 'canarytokens.rs CreateBody', required: ['token_type', 'memo'], optional: ['created_by', 'include_text_snippet', 'text_snippet', 'file_base64', 'file_name', 'file_content_type'] },
  credentialCreate: {
    rust: 'credentials.rs CreateBody',
    optional: ['target', 'path', 'username', 'password', 'content_template', 'memo', 'actor_subject', 'actor_username'],
    handler: ['path', 'username', 'password', 'memo'],
  },
  credentialRotate: { rust: 'credentials.rs RotateBody', optional: ['password', 'actor_subject', 'actor_username'] },
  credentialLink: { rust: 'credentials.rs LinkTokenBody', optional: ['token_id', 'actor_subject', 'actor_username'] },
  configRollback: { rust: 'config.rs RollbackBody', required: ['revision'], optional: ['actor_subject', 'actor_username'] },
  preferencesWrite: { rust: 'preferences.rs PreferencesWriteBody', optional: ['subject', 'username', 'role', 'patch'], handler: ['subject', 'patch'] },
  preferencesPatch: { rust: 'preferences.rs PreferencesPatch (deny_unknown_fields)', optional: PREFERENCE_KEYS },
  preferencesReset: { rust: 'preferences.rs PreferencesResetBody', optional: ['subject', 'username', 'role', 'timezone'], handler: ['subject'] },
  sandboxSubmit: { rust: 'sandbox_submit.rs SubmitBody', required: ['hash'] },
  ghidraSubmit: { rust: 'ghidra_submit.rs SubmitBody', required: ['hash'] },
  githubSubmit: { rust: 'github_analysis_submit.rs SubmitBody', required: ['hash'], optional: ['confirm', 'actor_subject', 'actor_username'], handler: ['confirm'] },
  ipBlock: { rust: 'ip_block.rs BlockBody', required: ['ip', 'blocked'], optional: ['expires_days', 'actor'] },
  mlAck: { rust: 'detail.rs MlAckBody', required: ['key', 'ack'], optional: ['actor'] },
  mlAckAll: { rust: 'detail.rs MlAckAllBody', optional: ['actor'] },
  mlDisposition: { rust: 'detail.rs MlDispositionBody', required: ['key', 'status'], optional: ['reason', 'actor'] },
  problemReport: {
    rust: 'problem_reports.rs Submission',
    optional: ['page', 'expected', 'actual', 'action_trail', 'console_errors', 'network_failures', 'api_calls', 'dom_snapshot', 'user_agent'],
    handler: ['expected'],
  },
  problemActionEntry: { rust: 'problem_reports.rs ActionEntry', optional: ['at', 'kind', 'detail'] },
  problemApiCall: { rust: 'problem_reports.rs ApiCall', optional: ['at', 'method', 'url', 'status', 'request_body', 'response_body'] },
  problemStatus: { rust: 'problem_reports.rs StatusPatch', required: ['status'] },
  reportDefinition: {
    rust: 'reports_store.rs ReportDefinition',
    optional: ['id', 'name', 'template', 'theme', 'branding', 'scope', 'elements', 'appendix_limit', 'schedule', 'created', 'updated'],
    handler: ['name', 'template', 'theme'],
  },
  reportBranding: { rust: 'reports_store.rs ReportBranding', optional: ['title', 'author', 'header_left', 'header_right', 'footer_left', 'classification'] },
  reportScope: {
    rust: 'reports_store.rs ReportScope',
    optional: ['window', 'ip', 'network', 'sensor', 'port', 'signature', 'country', 'asn', 'text', 'type', 'session', 'job', 'hash'],
  },
  reportSchedule: {
    rust: 'reports_store.rs ReportSchedule',
    optional: ['enabled', 'frequency', 'hour', 'minute', 'weekday', 'month_day', 'last_run_at', 'next_run_at', 'failures'],
  },
  generate: { rust: 'reports_api.rs GenerateBody', optional: ['origin'] },
  workbenchRun: { rust: 'workbench_api.rs CreateRunBody', required: ['payload_sha256'], optional: ['recipe_id', 'recipe_revision', 'recipe_name', 'analyzers'] },
  workbenchRecipe: { rust: 'workbench_api.rs SaveRecipeBody', required: ['name', 'scope', 'analyzers'], optional: ['id', 'description', 'base_revision'] },
  workbenchSelection: { rust: 'workbench_domain.rs WorkbenchSelection', required: ['analyzer_id'], optional: ['options'] },
  workbenchOptions: { rust: 'workbench_domain.rs WorkbenchOptions', required: WORKBENCH_OPTIONS },
} satisfies Record<string, Fields>

type Shape = keyof typeof RUST

/** The body has every field serde cannot default, every field the handler
 * insists on, and nothing the struct would silently drop. */
function expectBody(shape: Shape, body: unknown) {
  const fields: Fields = RUST[shape]
  expect(body, `${shape} (${fields.rust}) must be a JSON object`).toBeTypeOf('object')
  const sent = Object.keys(body as object)
  const accepted = [...(fields.required ?? []), ...(fields.optional ?? [])]
  expect(sent.filter((key) => !accepted.includes(key)), `${shape}: fields ${fields.rust} drops`).toEqual([])
  expect([...(fields.required ?? []), ...(fields.handler ?? [])].filter((key) => !sent.includes(key)), `${shape}: fields ${fields.rust} needs`).toEqual([])
}

// ---- adapters that build a body ------------------------------------------------

const options: AnalyzerOptions = { timeoutSeconds: 600, maxQueueAgeSeconds: 1800, retryLimit: 1 }

const definition: ReportDefinition = {
  id: 'def-1',
  name: 'Weekly executive',
  template: 'executive',
  theme: 'dark',
  elements: ['cover', 'metrics'],
  scope: { window: '7d', ip: ['203.0.113.4', '203.0.113.9'], sensor: ['cowrie'], port: ['22'], signature: ['ET SCAN'] },
  branding: { title: 'Weekly', author: 'SOC', headerLeft: 'l', headerRight: 'r', footerLeft: 'f', classification: 'INTERNAL' },
  schedule: { frequency: 'weekly', hour: 6, minute: 30, weekday: 1, monthDay: 1 },
  appendixLimit: 50,
  created: '2026-10-10T08:00:00Z',
}

describe('the bodies the adapters build match the structs the backend decodes', () => {
  it('acknowledge an alert and an ML anomaly, and disposition one', () => {
    expectBody('alertAck', alertAckBody(true))
    expectBody('mlAck', mlAckBody('anom-1', true))
    expectBody('mlAck', mlAckBody('anom-1', false, 'analyst'))
    expectBody('mlDisposition', mlDispositionBody('anom-1', 'true_positive'))
    expectBody('mlDisposition', mlDispositionBody('anom-1', 'open', 'mis-click', 'analyst'))
  })

  it('block an address', () => {
    expectBody('ipBlock', setIpBlockBody('203.0.113.4', true))
  })

  it('define a report, with and without a schedule', () => {
    for (const def of [definition, { ...definition, schedule: null }]) {
      const body = reportDefinitionBody(def)
      expectBody('reportDefinition', body)
      expectBody('reportBranding', body.branding)
      expectBody('reportScope', body.scope)
      if (body.schedule) expectBody('reportSchedule', body.schedule)
    }
    // GenerateBody takes an optional origin; the dashboard sends none and the backend defaults it to "manual".
    expectBody('generate', {})
  })

  it('start a workbench run and save a recipe', () => {
    const run = createWorkbenchRunBody('e3'.repeat(32), ['static', 'sandbox', 'ghidra'], { static: options, sandbox: options, ghidra: options }, { id: 'rec-1', name: 'Quick triage', revision: 2 })
    expectBody('workbenchRun', run)
    for (const selection of run.analyzers) {
      expectBody('workbenchSelection', selection)
      expectBody('workbenchOptions', selection.options)
    }
    // The dashboard's ids are not the backend's for two analyzers (workbench_domain.rs registry).
    expect(run.analyzers.map((a) => a.analyzer_id)).toEqual(['deterministic', 'linux-sandbox', 'ghidra'])
    const recipe: WorkbenchRecipe = { id: 'rec-1', revision: 2, name: 'Quick triage', description: '', owner: 'analyst', scope: 'shared', createdAt: '2026-10-10T08:00:00Z', analyzers: [{ analyzerId: 'ghidra', options }] }
    const saved = saveWorkbenchRecipeBody(recipe)
    expectBody('workbenchRecipe', saved)
    for (const selection of saved.analyzers) expectBody('workbenchSelection', selection)
    expectBody('workbenchRecipe', saveWorkbenchRecipeBody({ ...recipe, id: '' }))
  })

  it('save preferences, sending only keys the strict patch decoder knows', () => {
    const stored = preferences(wireSettings.preferences.preferences)
    // Every page preference at once: the widest patch the dashboard can build.
    const patch = preferencesPatch(stored)
    expectBody('preferencesPatch', patch)
    expectBody('preferencesWrite', preferencesWriteBody('sub-1', patch, 'analyst'))
    expectBody('preferencesWrite', preferencesWriteBody('sub-1', preferencesPatch({ theme: 'dark' })))
    expectBody('preferencesReset', preferencesResetBody('sub-1', 'analyst', 'Europe/Amsterdam'))
    // The page-only keys have no wire field and must not reach a deny_unknown_fields decoder.
    expect(Object.keys(preferencesPatch({ ...stored, notifyCanary: true }))).not.toContain('notify_canary')
  })

  it('save, validate and roll back configuration', () => {
    const sections = ['presentation', 'behavior', 'honeypot', 'reportPresets'] as const
    const stored = wireSettings.config.payload
    const known: Record<(typeof sections)[number], string[]> = {
      presentation: Object.keys(stored.presentation),
      behavior: Object.keys(stored.behavior),
      honeypot: Object.keys(stored.honeypot),
      reportPresets: [],
    }
    // The page saves what it loaded. Load the stored document with a brand_prefix so the presentation save is built from it.
    const loaded = dashboardConfig({ ...wireSettings.config, payload: { ...stored, presentation: { ...stored.presentation, brand_prefix: 'APIARY' } } })
    const page = { ...CONFIG, presentation: loaded.presentation }
    for (const section of sections) {
      const body = configSectionBody(section, page[section])
      expect(body).toBeTypeOf('object')
      // put_config_field replaces the whole block, so the dashboard sends it whole: every key the stored block carries.
      if (section !== 'reportPresets') {
        const unsent = known[section].filter((key) => !(key in body))
        // brand_prefix has no page control but is carried from the load, so a stored value is sent back, not erased.
        expect(unsent, `${section} keys the stored block has and the save drops`).toEqual([])
        expect(Object.keys(body).filter((key) => !known[section].includes(key)), `${section} keys the stored block does not have`).toEqual([])
      }
      // /config/validate takes an object of sections named as the backend's match arms spell them.
      const validate = configValidateBody(section, CONFIG[section])
      expect(Object.keys(validate)).toEqual([section === 'reportPresets' ? 'report_presets' : section])
    }
    // config.rs validate_*: the keys it checks are sent under the names it reads.
    expect(Object.keys(configSectionBody('presentation', CONFIG.presentation))).toEqual(
      expect.arrayContaining(['app_name', 'help_link_url', 'banner_severity', 'banner_expires', 'product_label', 'dashboard_title', 'dashboard_subtitle', 'org_name', 'overview_intro', 'help_link_label', 'banner_text', 'footer_text', 'ai_disclaimer', 'privacy_notice']),
    )
    expect(Object.keys(configSectionBody('behavior', CONFIG.behavior))).toEqual(
      expect.arrayContaining(['default_time_window', 'rows_per_page_options', 'max_export_rows', 'refresh_interval_seconds_options', 'source_stale_minutes', 'map_provider']),
    )
    expect(Object.keys(configSectionBody('honeypot', CONFIG.honeypot))).toEqual(
      expect.arrayContaining(['alert_cooldown', 'alert_campaign_score', 'sandbox_alert_risk_score', 'ml_alert_threshold', 'yara_scan_interval_seconds', 'yara_max_bytes', 'payload_dedupe_interval_seconds']),
    )
    expectBody('configRollback', { ...configRollbackBody('rev-41'), actor_subject: 's', actor_username: 'u' })
    expect(configRollbackBody('rev-41')).toEqual({ revision: 41 })
  })

  it('file a problem report and change its status', () => {
    const body = problemReportBody({
      page: '/events',
      expected: 'rows',
      actual: 'empty',
      actionTrail: ['click filters'],
      consoleErrors: ['TypeError'],
      networkFailures: ['GET /api/events 500'],
      apiCalls: [{ method: 'GET', path: '/api/events', status: 500 }],
      domSnapshot: '<div/>',
      userAgent: 'Mozilla/5.0',
    })
    expectBody('problemReport', body)
    for (const entry of body.action_trail) expectBody('problemActionEntry', entry)
    for (const call of body.api_calls) expectBody('problemApiCall', call)
    for (const status of ['open', 'triaged', 'fixed', 'wontfix'] as ProblemStatus[]) {
      const patch = problemStatusPatch(status)
      expectBody('problemStatus', patch)
      // problem_reports.rs patch_status answers 400 to anything but these three.
      expect(['open', 'triaged', 'closed']).toContain(patch.status)
    }
  })
})

// ---- bodies api.ts builds inline ------------------------------------------------

/** Every request with a body the live backend tier makes while `run` executes. */
async function requestsMadeBy(run: () => Promise<unknown>): Promise<Array<{ method: string; path: string; body: unknown }>> {
  const calls: Array<{ method: string; path: string; body: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const path = new URL(url).pathname
      if (init?.body) calls.push({ method: init.method ?? 'GET', path, body: JSON.parse(init.body) })
      // The read-only guard reads the config before each write; everything else answers an empty object.
      return Response.json(path === '/api/v1/config' ? { revision: 0, payload: {} } : {})
    }),
  )
  await run().catch(() => undefined) // the stub's empty answers need not map; the request is what is under test
  return calls
}

const live = <TQuery extends keyof Backend>(name: TQuery): Backend[TQuery] => liveQuery(name, undefined) as Backend[TQuery]

beforeEach(() => {
  process.env.SERVICE_TOKEN = 'test-token'
  process.env.BACKEND_URL = 'http://backend.test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BACKEND_URL
  delete process.env.SERVICE_TOKEN
})

describe('the bodies api.ts builds inline match the structs the backend decodes', () => {
  it('mint a canarytoken, with and without a snippet or an image', async () => {
    const calls = [
      ...(await requestsMadeBy(() => live('createCanarytoken')({ type: 'adobe_pdf', memo: 'm' }))),
      ...(await requestsMadeBy(() => live('createCanarytoken')({ type: 'ms_word', memo: 'm', snippet: 'Q3' }))),
      ...(await requestsMadeBy(() => live('createCanarytoken')({ type: 'web_image', memo: 'm', image: { name: 'a.png', contentType: 'image/png', base64: btoa('png') } }))),
    ]
    expect(calls.map((c) => c.path)).toEqual(Array(3).fill('/api/v1/canarytokens'))
    for (const call of calls) expectBody('canaryCreate', call.body)
    // canarytokens.rs only honours text_snippet alongside include_text_snippet.
    expect(calls[1].body).toMatchObject({ include_text_snippet: true, text_snippet: 'Q3' })
  })

  it('provision, rotate and relink a credential', async () => {
    const provision = await requestsMadeBy(() => live('provisionCredential')({ path: 'home/deploy/.aws/credentials', target: '', username: 'deploy', password: 'pw', memo: 'aws bait', template: 'x={{username}}' }))
    const bare = await requestsMadeBy(() => live('provisionCredential')({ path: 'p', target: 'cowrie_honeyfs', username: 'u', password: 'pw', memo: 'm', template: '' }))
    for (const call of [...provision, ...bare]) expectBody('credentialCreate', call.body)
    expect(bare[0].body).not.toHaveProperty('content_template') // an empty one lets the backend default it
    for (const password of [undefined, 'new-pw']) {
      const [rotate] = await requestsMadeBy(() => live('rotateCredential')('cred-1', password))
      expect(rotate.path).toBe('/api/v1/credentials/cred-1/rotate')
      expectBody('credentialRotate', rotate.body)
    }
    for (const token of [undefined, 'a1b2']) {
      const [link] = await requestsMadeBy(() => live('linkCredentialToken')('cred-1', token))
      expect(link.path).toBe('/api/v1/credentials/cred-1/link-token')
      expectBody('credentialLink', link.body)
      expect(link.body).toHaveProperty('token_id', token ?? '') // "" is how the handler unlinks
    }
  })

  it('roll back a config revision with the actor', async () => {
    const [rollback] = await requestsMadeBy(() => live('rollbackConfig')('rev-41'))
    expect(rollback).toMatchObject({ method: 'POST', path: '/api/v1/config/rollback' })
    expectBody('configRollback', rollback.body)
  })

  it('queue sandbox, Ghidra and GitHub analysis for a payload', async () => {
    const hash = 'e3'.repeat(32)
    const [sandbox] = await requestsMadeBy(() => live('queuePayloadAction')(hash, 'sandbox'))
    const [ghidra] = await requestsMadeBy(() => live('queuePayloadAction')(hash, 'ghidra'))
    const [github] = await requestsMadeBy(() => live('queuePayloadAction')(hash, 'github'))
    expect([sandbox.path, ghidra.path, github.path]).toEqual(['/api/v1/sandbox/submit', '/api/v1/ghidra/submit', '/api/v1/github-analysis/submit'])
    expectBody('sandboxSubmit', sandbox.body)
    expectBody('ghidraSubmit', ghidra.body)
    expectBody('githubSubmit', github.body)
    // The only value github_analysis_submit.rs accepts; anything else is refused and audited as missing consent.
    expect(github.body).toHaveProperty('confirm', 'publish')
  })

  it('acknowledge ML anomalies, all of them, and set a disposition', async () => {
    const [all] = await requestsMadeBy(() => live('acknowledgeAllAnomalies')())
    expect(all.path).toBe('/api/v1/ml-anomalies/ack-all')
    expectBody('mlAckAll', all.body)
    const [ack] = await requestsMadeBy(() => live('acknowledgeAnomalies')(['anom-1']))
    expectBody('mlAck', ack.body)
    const [disposition] = await requestsMadeBy(() => live('setAnomalyDisposition')(['anom-1'], 'false_positive', 'noise'))
    expectBody('mlDisposition', disposition.body)
  })

  it('reach the endpoints with the builders above', async () => {
    const [block] = await requestsMadeBy(() => live('setIpBlocked')('203.0.113.4', true))
    expect(block).toMatchObject({ method: 'POST', path: '/api/v1/ip-block' })
    expectBody('ipBlock', block.body)
    const [ack] = await requestsMadeBy(() => live('setAlertsAcknowledged')(['k1'], true))
    expect(ack).toMatchObject({ method: 'POST', path: '/api/v1/alerts/k1/ack' })
    expectBody('alertAck', ack.body)
    const [problem] = await requestsMadeBy(() => live('submitProblemReport')({ page: '/', expected: 'x', actual: '', actionTrail: [], consoleErrors: [], networkFailures: [], apiCalls: [], userAgent: 'ua' }))
    expect(problem).toMatchObject({ method: 'POST', path: '/api/v1/problem-reports' })
    expectBody('problemReport', problem.body)
    const [status] = await requestsMadeBy(() => live('setProblemStatus')('pr-1', 'triaged'))
    expect(status).toMatchObject({ method: 'PATCH', path: '/api/v1/problem-reports/pr-1' })
    expectBody('problemStatus', status.body)
  })

  it('save, validate and generate reports and configuration through the live queries', async () => {
    const [validate] = await requestsMadeBy(() => live('validateConfig')('behavior', CONFIG.behavior))
    expect(validate.path).toBe('/api/v1/config/validate')
    expect(Object.keys(validate.body as object)).toEqual(['behavior'])
    const [save] = await requestsMadeBy(() => live('saveConfigSection')('reportPresets', CONFIG.reportPresets))
    expect(save).toMatchObject({ method: 'PUT', path: '/api/v1/config/report-presets' })
    const [created] = await requestsMadeBy(() => live('saveReportDefinition')({ ...definition, id: '' }))
    expect(created).toMatchObject({ method: 'POST', path: '/api/v1/reports/definitions' })
    expectBody('reportDefinition', created.body)
    const [updated] = await requestsMadeBy(() => live('saveReportDefinition')(definition))
    expect(updated).toMatchObject({ method: 'PUT', path: '/api/v1/reports/definitions/def-1' })
    expectBody('reportDefinition', updated.body)
    const [generated] = await requestsMadeBy(() => live('generateReport')('def-1'))
    expectBody('generate', generated.body)
    const [run] = await requestsMadeBy(() => live('startAnalysisRun')({ hash: 'e3'.repeat(32), analyzers: ['ghidra'], options: { ghidra: options } }))
    expect(run.path).toBe('/api/v1/workbench/runs')
    expectBody('workbenchRun', run.body)
  })
})
