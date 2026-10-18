// Invariants over the mock data seam: numbers shown on different pages agree,
// and every id one page links to resolves on the page it links to. These
// caught real bugs while the mock pages were built (#12's link crawl).
import { describe, expect, it } from 'vitest'
import { fieldText, readField } from '#/lib/sensorFields'
import { backend } from './backend'
import { MOCK_NOW } from './mock/random'
import { inRange } from './shared'

// The mock backend itself: tests and scripts call it directly.
const q = backend()

describe('cross-page consistency', () => {
  it('overview event KPI equals the event explorer total', async () => {
    const [overview, events] = await Promise.all([q.getOverview(), q.getEvents({})])
    expect(overview.kpis.find((k) => k.id === 'events')?.value).toBe(events.total)
  })

  it('ML severity tiles add up to the 24h total', async () => {
    const ml = await q.getMlAnomalies()
    expect(ml.bySeverity?.reduce((sum, row) => sum + row.count, 0)).toBe(ml.total24h)
  })

  it('source health and topology agree on unhealthy feeds', async () => {
    const [health, topology] = await Promise.all([q.getSourceHealth(), q.getTopology()])
    const unhealthy = (states: Array<{ sensor: string; state?: string; feed?: string }>) =>
      states.filter((s) => (s.state ?? s.feed) !== 'fresh').map((s) => s.sensor).sort()
    expect(unhealthy(health.feeds)).toEqual(unhealthy(topology.sensors))
  })

  it('payload page and GitHub page show the same detection count', async () => {
    for (const g of await q.getGithubAnalyses()) {
      const analysis = await q.getPayloadAnalysis(g.sha)
      expect(analysis?.github?.detections).toBe(g.detections)
    }
  })

  it('analysis results, payload page and sandbox page agree on the sandbox verdict', async () => {
    const { results } = await q.getAnalysisResults('all')
    for (const r of results.filter((x) => x.analyzer === 'sandbox')) {
      const [analysis, run] = await Promise.all([q.getPayloadAnalysis(r.hash), q.getSandboxRun(r.hash)])
      expect(analysis?.sandbox?.verdict).toBe(run?.verdict)
      expect(r.verdict, r.hash).toBe(run?.verdict)
    }
  })

  it('analysis results follow the app-wide range; every analyzer result has a verdict', async () => {
    const day = (await q.getAnalysisResults('24h')).results.filter((r) => r.analyzer !== 'workbench')
    const all = (await q.getAnalysisResults('all')).results.filter((r) => r.analyzer !== 'workbench')
    expect(day.length).toBeGreaterThan(0)
    expect(day.length).toBeLessThan(all.length)
    for (const r of day) expect(inRange(r.at, '24h', MOCK_NOW), r.id).toBe(true)
    for (const r of all) expect(r.verdict, r.id).toBeDefined()
  })
})

describe('mock canarytoken writes', () => {
  it('mints a web_image when the image is supplied, and refuses one without it', async () => {
    const token = await q.createCanarytoken({ type: 'web_image', memo: 'badge', image: { name: 'badge.png', contentType: 'image/png', base64: btoa('png') } })
    expect(token).toMatchObject({ type: 'web_image', memo: 'badge' })
    await expect(q.createCanarytoken({ type: 'web_image', memo: 'badge' })).rejects.toThrow()
  })
})

describe('link integrity', () => {
  it('every referenced payload hash has an analysis page', async () => {
    const [attackers, clusters, llm] = await Promise.all([q.getAttackers(), q.getInfraClusters(), q.getLlmAnalyses()])
    const hashes = [
      ...attackers.flatMap((a) => a.payloads),
      ...clusters.filter((c) => c.kind === 'payload').map((c) => c.value),
      ...llm.flatMap((a) => (a.payloadSha256 ? [a.payloadSha256] : [])),
    ]
    expect(hashes.length).toBeGreaterThan(0)
    for (const hash of hashes) expect(await q.getPayloadAnalysis(hash), hash).not.toBeNull()
  })

  it('every analyzer result links to a page that exists', async () => {
    const { results } = await q.getAnalysisResults()
    for (const r of results.filter((x) => x.analyzer === 'ghidra')) expect(await q.getGhidraAnalysis(r.hash), r.hash).not.toBeNull()
    for (const r of results.filter((x) => x.analyzer === 'sandbox')) expect(await q.getSandboxRun(r.hash), r.hash).not.toBeNull()
    for (const run of await q.getRevDeckRuns()) expect(await q.getGhidraAnalysis(run.sha), run.sha).not.toBeNull()
  })

  it('every campaign, network, cluster, identity, and source resolves to its entity page', async () => {
    const [{ campaigns }, clusters, { sources }, identities] = await Promise.all([q.getNetworkCampaigns(), q.getInfraClusters(), q.getSourceProfiles(), q.getAttackers()])
    for (const c of campaigns) {
      expect(await q.getCampaign(c.cidr), c.cidr).not.toBeNull()
      expect(await q.getNetwork(c.cidr), c.cidr).not.toBeNull()
    }
    for (const c of clusters) expect(await (c.kind === 'asn' ? q.getAsn(c.value) : q.getCluster(c.kind, c.value)), c.id).not.toBeNull()
    for (const a of identities) {
      const identity = await q.getIdentity(a.id)
      expect(identity?.group.members.length, a.id).toBe(a.ips.length)
    }
    for (const s of sources.slice(0, 20)) {
      expect(await q.getIpProfile(s.ip), s.ip).not.toBeNull()
      expect(await q.getAsn((await q.getIpProfile(s.ip))!.source.asn), s.ip).not.toBeNull()
    }
  })

  it('identity payloads and download hashes are real captured payloads', async () => {
    const identities = await q.getAttackers()
    for (const hash of identities.flatMap((a) => a.payloads)) expect(await q.getPayloadAnalysis(hash), hash).not.toBeNull()
    for (const fp of identities.flatMap((a) => a.fingerprints)) expect(await q.getCluster('fingerprint', fp), fp).not.toBeNull()
    const { payloads } = await q.getPayloads()
    const delivered = await Promise.all(payloads.map((p) => q.getPayloadDelivery(p.hash)))
    expect(delivered.some((d) => d.events.length > 0)).toBe(true)
  })

  it('sessions, events, and recordings referenced elsewhere resolve', async () => {
    const [llm, ml, recordings] = await Promise.all([q.getLlmAnalyses(), q.getMlAnomalies(), q.getRecordings()])
    for (const a of llm.filter((x) => x.sessionId)) {
      const detail = await q.getSessionDetail(a.sessionId!)
      expect(detail, a.sessionId).not.toBeNull()
      expect(await q.getSessionEvents(a.sessionId!)).toEqual(detail?.events)
    }
    for (const a of ml.anomalies.slice(0, 20)) expect(await q.getEventDetail(a.sourceEventId), a.sourceEventId).not.toBeNull()
    for (const r of recordings.slice(0, 20)) expect(await q.getReplayDetail(r.shasum), r.shasum).not.toBeNull()
  })

  it('every indicator in the hub opens its page', async () => {
    const catalog = await q.getIocCatalog()
    for (const [kind, rows] of Object.entries(catalog)) {
      for (const row of rows.slice(0, 15)) {
        if (kind === 'hash') expect(await q.getPayloadAnalysis(row.value), row.value).not.toBeNull()
        else expect(await q.getIoc(kind, row.value), `${kind}:${row.value}`).not.toBeNull()
      }
    }
  })

  it('every indicator a page links to has an indicator page', async () => {
    const { sources } = await q.getSourceProfiles()
    const { campaigns } = await q.getNetworkCampaigns()
    const { rows: events } = await q.getEvents({})
    const links: Array<[string, string]> = []
    for (const s of sources) for (const r of (await q.getIpProfile(s.ip))?.paths ?? []) links.push(['url', r.label])
    for (const c of campaigns) for (const r of (await q.getCampaign(c.cidr))?.group.credentials ?? []) links.push(['credential', r.label])
    for (const e of events) if (e.fingerprint) links.push(['fingerprint', e.fingerprint])
    // A URL indicator is the request target alone, never 'POST /path'.
    expect(links.filter(([k, v]) => k === 'url' && /^[A-Z]+ /.test(v))).toEqual([])
    for (const kind of ['url', 'credential', 'fingerprint']) expect(links.some(([k]) => k === kind), kind).toBe(true)
    // Many pages link the same indicator; resolve each distinct one once.
    const distinct = [...new Map(links.map(([kind, value]) => [`${kind}\0${value}`, [kind, value]])).values()]
    for (const [kind, value] of distinct) expect(await q.getIoc(kind, value), `${kind}:${value}`).not.toBeNull()
  }, 20_000) // Crawl takes ~2 s alone and several times that under parallel load; the 5 s default is too tight.

  it('related entities and timeline links resolve', async () => {
    const { sources } = await q.getSourceProfiles()
    for (const s of sources.slice(0, 5)) {
      for (const group of await q.getRelated('source', s.ip)) {
        for (const item of group.items) {
          const found =
            group.kind === 'identity' ? await q.getIdentity(item.id)
            : group.kind === 'network' ? await q.getNetwork(item.id)
            : group.kind === 'campaign' ? await q.getCampaign(item.id)
            : group.kind === 'asn' ? await q.getAsn(item.id)
            : group.kind === 'session' ? await q.getSessionDetail(item.id)
            : group.kind === 'payload' ? await q.getPayloadAnalysis(item.id)
            : true
          expect(found, `${group.kind}:${item.id}`).toBeTruthy()
        }
      }
      const timeline = await q.getEntityTimeline('source', s.ip, 'all')
      expect(timeline.every((item) => item.href?.startsWith('/'))).toBe(true)
      for (const item of timeline.filter((i) => i.kind === 'anomaly').slice(0, 3)) expect(await q.getAnomaly(item.id)).not.toBeNull()
      for (const item of timeline.filter((i) => i.kind === 'llm').slice(0, 3)) expect(await q.getLlmAnalysis(item.id)).not.toBeNull()
    }
  })

  it('report previews name the scope filter that leaves nothing, and generating keeps or skips the definition', async () => {
    const data = await q.getReports()
    const draft = { ...structuredClone(data.definitions[1]), id: '', name: 'Preview test' }
    // The mock always has a preview; the live tier answers null (APIARY#3524).
    const previewOf = async (definition: typeof draft) => {
      const preview = await q.previewReport(definition)
      if (!preview) throw new Error('the mock always previews')
      return preview
    }
    const full = await previewOf(draft)
    expect(full.emptyFilter).toBeUndefined()
    expect(full.events).toBeGreaterThan(0)
    expect(full.sections.map((s) => s.id)).toEqual(draft.elements)
    // The preview prints the scope's own rows: scoped to one source, only that source appears.
    const ip = full.sections.find((s) => s.id === 'sources')?.sample[0]?.[0] ?? (await q.getFacets()).sources[0].value
    const scoped = await previewOf({ ...draft, elements: ['sources', 'appendix'], scope: { ...draft.scope, ip: [ip] } })
    expect(scoped.sections[0].sample.map(([source]) => source)).toEqual([ip])
    expect(scoped.sections[1].sample.every(([, event]) => event.startsWith(`${ip} `))).toBe(true)
    expect(Date.parse(scoped.period.to) - Date.parse(scoped.period.from)).toBeGreaterThan(0)
    const empty = await previewOf({ ...draft, scope: { ...draft.scope, ip: ['10.9.9.9'] } })
    expect(empty.emptyFilter?.field).toBe('ip')
    expect(empty.events).toBe(0)
    const oneOff = await q.generateReportFrom(draft, false)
    expect(oneOff.definition).toBeUndefined()
    expect(oneOff.report).toMatchObject({ title: 'Preview test', definitionId: '' })
    const kept = await q.generateReportFrom(draft, true)
    expect(kept.report.definitionId).toBe(kept.definition?.id)
    expect((await q.getReports()).definitions.some((d) => d.id === kept.definition?.id)).toBe(true)
  })

  it('an analysis run keeps every option and queues GPU analyzers', async () => {
    const hash = (await q.getPayloads()).payloads.find((p) => p.kind === 'ELF')!.hash
    const before = (await q.getAnalysisResults()).gpuQueue.length
    const config: Parameters<typeof q.startAnalysisRun>[0] = {
      hash,
      analyzers: ['static', 'ghidra'],
      options: {
        static: { timeoutSeconds: 120, maxQueueAgeSeconds: 900, retryLimit: 1 },
        ghidra: { timeoutSeconds: 1200, maxQueueAgeSeconds: 7200, retryLimit: 0 },
      },
    }
    const queued = await q.startAnalysisRun(config)
    expect(queued).toMatchObject({ reused: false, run: { label: 'Workbench run', state: 'queued', owner: 'Operator' } })
    expect(queued!.run.children.map((c) => [c.analyzerId, c.state, c.cancelable])).toEqual([['static', 'queued', true], ['ghidra', 'queued', true]])
    // The options travel with the run's record in Analysis results.
    const record = (await q.getAnalysisResults()).results.find((r) => r.id === queued!.run.id)!
    expect(record.detail).toMatchObject({ options: { static: { timeoutSeconds: 120, maxQueueAgeSeconds: 900, retryLimit: 1 }, ghidra: { timeoutSeconds: 1200, maxQueueAgeSeconds: 7200, retryLimit: 0 } } })
    expect(Object.keys(record.detail.options as object)).toEqual(['static', 'ghidra'])
    const after = (await q.getAnalysisResults()).gpuQueue
    expect(after.length).toBe(before + 1)
    expect(after[0]).toMatchObject({ jobType: 'ghidra-summary', model: 'qwen2.5-coder:14b', status: 'queued' })
    expect(await q.startAnalysisRun({ ...config, hash: 'deadbeef' })).toBeNull()

    // The same run again while it is in flight is reused.
    const again = await q.startAnalysisRun(config)
    expect(again).toMatchObject({ reused: true, run: { id: queued!.run.id } })
    // What the sample cannot take is refused, with the reason.
    await expect(q.startAnalysisRun({ ...config, analyzers: ['cape'], options: { cape: { timeoutSeconds: 300, maxQueueAgeSeconds: 3600, retryLimit: 0 } } })).rejects.toMatchObject({ status: 400, detail: expect.stringMatching(/^CAPE \(Windows\): Takes PE32/) })
  })

  it('says which analyzers apply to a sample, and why not', async () => {
    const payloads = (await q.getPayloads()).payloads
    const script = payloads.find((p) => p.kind === 'shell script')!
    const catalog = (await q.getAnalyzerCatalog(script.hash))!
    expect(catalog.classification).toMatchObject({ category: 'script', analysisPath: 'static only' })
    const byId = Object.fromEntries(catalog.analyzers.map((a) => [a.id, a]))
    expect(byId.static.applicable).toBe(true)
    expect(byId.ghidra).toMatchObject({ applicable: false, reason: expect.stringContaining('shell script') })
    expect(byId.github).toMatchObject({ requiresOptIn: true, localOnly: false, requiredRole: 'admin' })
    expect(await q.getAnalyzerCatalog('nope')).toBeNull()
  })

  it('retries a failed analyzer of a run and cancels a queued one', async () => {
    const runs = (await q.getAnalysisResults()).runs
    const failed = runs.find((r) => r.children.some((c) => c.state === 'failed'))!
    const child = failed.children.find((c) => c.state === 'failed')!
    const retried = (await q.setRunChild(failed.id, child.analyzerId, 'retry'))!
    expect(retried.children.find((c) => c.analyzerId === child.analyzerId)).toMatchObject({ state: 'queued', cancelable: true, retryable: false })
    expect(retried.state).toBe('queued')
    const cancelled = (await q.setRunChild(failed.id, child.analyzerId, 'cancel'))!
    expect(cancelled.children.find((c) => c.analyzerId === child.analyzerId)).toMatchObject({ state: 'cancelled', retryable: true })
    await expect(q.setRunChild(failed.id, child.analyzerId, 'cancel')).rejects.toMatchObject({ status: 400 })
  })

  it('unknown ids resolve to null (rendered as 404)', async () => {
    expect(await q.getEventDetail('evt-nope')).toBeNull()
    expect(await q.getIpProfile('10.0.0.1')).toBeNull()
    expect(await q.getPayloadAnalysis('deadbeef')).toBeNull()
    expect(await q.getNetwork('not-a-cidr')).toBeNull()
    expect(await q.getCampaign('10.0.0.0/26')).toBeNull()
    expect(await q.getIdentity('nope')).toBeNull()
    expect(await q.getAsn('AS0')).toBeNull()
    expect(await q.getIoc('cve', 'CVE-1999-0001')).toBeNull()
  })
})

describe('filters and search', () => {
  it('filters events by kind, port, and time window', async () => {
    const logins = await q.getEvents({ kind: 'login' })
    expect(logins.rows.every((e) => e.type === 'login.failed' || e.type === 'login.success')).toBe(true)
    // The Overview's "Successful logins" tile opens exactly its number.
    const [overview, accepted] = await Promise.all([q.getOverview(), q.getEvents({ kind: 'login-success' })])
    expect(accepted.rows.every((e) => e.type === 'login.success')).toBe(true)
    expect(accepted.total).toBe(overview.kpis.find((k) => k.id === 'logins')?.value)
    const ssh = await q.getEvents({ port: '22' })
    expect(ssh.rows.every((e) => e.dstPort === 22)).toBe(true)
    const all = await q.getEvents({})
    const lastHour = await q.getEvents({ since: '1h' })
    expect(lastHour.total).toBeGreaterThan(0)
    expect(lastHour.total).toBeLessThan(all.total)
  })

  it('applies every term of an AND history query', async () => {
    const { rows } = await q.searchHistory('sensor:cowrie AND username:root')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((e) => e.sensor === 'cowrie' && e.username?.includes('root'))).toBe(true)
    expect((await q.searchHistory('nosuchfield:x')).rows).toEqual([])
  })

  it('pages a list: the requested slice, where it starts, and how many match in all', async () => {
    const all = await q.getEvents({ sensor: 'cowrie' })
    const second = await q.getEvents({ sensor: 'cowrie', offset: 25, limit: 25 })
    expect(second.total).toBe(all.total)
    expect(second.offset).toBe(25)
    expect(second.rows).toEqual(all.rows.slice(25, 50))
    const past = await q.getEvents({ sensor: 'cowrie', offset: all.total + 10, limit: 25 })
    expect(past.rows).toEqual([])
    expect(past.total).toBe(all.total)
    const commands = await q.getCommands({ offset: 0, limit: 5 })
    expect(commands.rows).toHaveLength(5)
    expect(commands.rows.every((e) => e.type === 'command.input')).toBe(true)
  })

  it('groups search results and returns nothing for an empty query', async () => {
    expect(await q.searchAll('')).toEqual([])
    const groups = await q.searchAll('root')
    expect(groups.map((g) => g.id)).toContain('credentials')
  })

  it('searches every kind of entity, capped per group, with a page for each hit', async () => {
    const ids = new Set<string>()
    for (const query of ['cowrie', 'ssh', 'as', '192.0.2', 'report', 'mysql']) {
      for (const group of await q.searchAll(query, 3)) {
        ids.add(group.id)
        expect(group.items.length).toBeLessThanOrEqual(3)
        expect(group.total).toBeGreaterThanOrEqual(group.items.length)
        for (const item of group.items) expect(item.href).toMatch(/^\//)
      }
    }
    for (const id of ['sources', 'networks', 'sensors', 'alerts', 'reports']) expect(ids).toContain(id)
  })
})

describe('mock writes', () => {
  it('acknowledge-all empties the New view', async () => {
    expect((await q.getAlerts()).some((g) => !g.acknowledged)).toBe(true)
    await q.acknowledgeAllAlerts()
    expect((await q.getAlerts()).some((g) => !g.acknowledged)).toBe(false)
  })

  it('blocks and unblocks an address', async () => {
    const { sources } = await q.getSourceProfiles()
    const ip = sources[0].ip
    await q.setIpBlocked(ip, true, 7)
    const blocked = await q.getIpProfile(ip)
    expect(blocked?.blocked).toBe(true)
    expect(Date.parse(blocked!.block!.expiresAt!) - Date.parse(blocked!.block!.at)).toBe(7 * 86_400_000)
    await q.setIpBlocked(ip, true, 0)
    expect((await q.getIpProfile(ip))?.block).not.toHaveProperty('expiresAt')
    await expect(q.setIpBlocked(ip, true)).rejects.toThrow(/duration/)
    await q.setIpBlocked(ip, false)
    expect((await q.getIpProfile(ip))?.blocked).toBe(false)
  })

  it('dead-letter purge removes only the scope the query names', async () => {
    const matching = await q.getDeadLetters('mapper_parsing')
    const before = (await q.getDeadLetters('')).length
    await q.purgeDeadLetters('mapper_parsing')
    expect((await q.getDeadLetters('')).length).toBe(before - matching.length)
  })

  it('only queued GPU jobs can be aborted', async () => {
    const { gpuQueue } = await q.getAnalysisResults()
    const running = gpuQueue.find((j) => j.status === 'running')!
    const queued = gpuQueue.find((j) => j.status === 'queued')!
    expect(await q.abortGpuJob(running.jobId)).toBe(false)
    expect(await q.abortGpuJob(queued.jobId)).toBe(true)
  })
})

describe('sensor fleet', () => {
  it('reads every sensor in its own terms', async () => {
    const catalog = await q.getSensorCatalog()
    expect(catalog.length).toBeGreaterThanOrEqual(26)
    for (const { sensor } of catalog) {
      const detail = await q.getSensorDetail(sensor)
      expect(detail?.reading.what, sensor).toBeTruthy()
      // A quiet sensor may have nothing in 24h; one that has events must
      // fill every column its reading names from at least one of them.
      const { rows } = await q.getEvents({ sensor })
      if (!detail || rows.length === 0) continue
      for (const column of detail.reading.columns) {
        const filled = rows.some((e) => fieldText(readField(e.fields, column.field)) !== '')
        expect(filled, `${sensor}: ${column.header}`).toBe(true)
      }
    }
  })
})

describe('event fields', () => {
  it('facet counts honor the requested event filters', async () => {
    const [{ total }, facets] = await Promise.all([q.getEvents({ country: 'NL' }), q.getFacets('events', { country: 'NL' })])
    expect(facets.countries).toEqual([{ value: 'NL', count: total }])
    expect(facets.sources.reduce((sum, row) => sum + row.count, 0)).toBe(total)
  })

  it('a persona filter returns what its facet count says, all on the sensor that wears it', async () => {
    const facets = await q.getFacets()
    expect(facets.personas.length).toBeGreaterThan(10)
    for (const { value, count } of facets.personas) {
      const { rows, total } = await q.getEvents({ persona: value })
      expect(total, value).toBe(count)
      const sensors = new Set(rows.map((e) => e.sensor))
      expect(sensors.size, value).toBe(1)
      const sensor = (await q.getSensorDetail([...sensors][0]))?.sensor
      expect(rows.every((e) => e.persona === sensor?.persona?.id && e.organization === sensor?.persona?.organization && sensor?.persona?.assets.includes(e.asset ?? '')), value).toBe(true)
    }
  })

  it('a fingerprint filter matches whole values, commas included', async () => {
    const { rows: all } = await q.getEvents({})
    const agent = all.find((e) => e.fingerprintKind === 'User-Agent' && e.fingerprint?.includes(','))?.fingerprint
    expect(agent).toBeTruthy()
    const { rows } = await q.getEvents({ fingerprint: agent })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((e) => e.fingerprint === agent)).toBe(true)
  })
})

describe('dashboard configuration', () => {
  it('validation names every field the store would refuse, and nothing when valid', async () => {
    const { config } = await q.getSettings()
    expect(await q.validateConfig('presentation', config.presentation)).toEqual({})
    const bad = await q.validateConfig('presentation', { ...config.presentation, appName: ' ', helpLinkUrl: 'http://example.test', bannerSeverity: 'warning', bannerText: '' })
    expect(Object.keys(bad).sort()).toEqual(['appName', 'bannerText', 'helpLinkUrl'])
    const honeypot = await q.validateConfig('honeypot', { ...config.honeypot, alertCooldown: '10s', mlAlertThreshold: 1.5, yaraMaxBytes: 12 })
    expect(Object.keys(honeypot).sort()).toEqual(['alertCooldown', 'mlAlertThreshold', 'yaraMaxBytes'])
    const behavior = await q.validateConfig('behavior', { ...config.behavior, rowsPerPageOptions: [], defaultTimeWindow: '2h', maxExportRows: 5 })
    expect(Object.keys(behavior).sort()).toEqual(['defaultTimeWindow', 'maxExportRows', 'rowsPerPageOptions'])
    expect(await q.validateConfig('reportPresets', { nosuch: { name: 'x' } })).toHaveProperty('nosuch')
  })

  it('a save is validated, recorded as a revision, and rolls back to what it replaced', async () => {
    const before = (await q.getSettings()).config
    const refused = await q.saveConfigSection('honeypot', { ...before.honeypot, alertCooldown: 'soon' })
    expect(refused.ok).toBe(false)
    expect((await q.getSettings()).config.revision).toBe(before.revision)

    const saved = await q.saveConfigSection('honeypot', { ...before.honeypot, alertCooldown: '2h' })
    expect(saved).toEqual({ ok: true, revision: before.revision + 1 })
    const after = await q.getSettings()
    expect(after.config.honeypot.alertCooldown).toBe('2h')
    expect(after.history[0]).toMatchObject({ id: `rev-${before.revision + 1}`, section: 'honeypot', summary: 'Changed alertCooldown' })

    await q.rollbackConfig(`rev-${before.revision + 1}`)
    expect((await q.getSettings()).config.honeypot.alertCooldown).toBe(before.honeypot.alertCooldown)
  })
})

describe('problem reports', () => {
  it('a filed report is stored with every secret removed', async () => {
    const { id } = await q.submitProblemReport({
      page: '/events',
      expected: 'The table loads',
      actual: 'It failed; my token=abc123def456 was in the URL',
      actionTrail: ['12:00:01 open /events?session=s3cr3tvalue'],
      consoleErrors: ['Authorization: Bearer abcdefghijklmnop', 'cookie=sid=xyz; password: hunter2'],
      networkFailures: ['getEvents -> 502'],
      apiCalls: [{ method: 'GET', path: 'getEvents', status: 502 }],
      domSnapshot: '<html></html>',
      userAgent: 'test',
    })
    const report = (await q.getProblemReports()).find((r) => r.id === id)!
    expect(report).toMatchObject({ status: 'open', page: '/events', hasSnapshot: true })
    const stored = JSON.stringify(report)
    for (const secret of ['abc123def456', 's3cr3tvalue', 'abcdefghijklmnop', 'xyz', 'hunter2']) expect(stored).not.toContain(secret)
    expect(report.networkFailures).toEqual(['getEvents -> 502'])
  })
})

describe('captured mail', () => {
  it('a session with a body has its message; an envelope-only session has none', async () => {
    const sessions = [...new Set((await q.getEvents({ sensor: 'mailoney' })).rows.flatMap((e) => (e.sessionId ? [e.sessionId] : [])))]
    const mails = await Promise.all(sessions.map((id) => q.getMail(id)))
    const found = mails.filter((m) => m !== null)
    expect(found.length).toBeGreaterThan(0)
    expect(mails.some((m) => m === null)).toBe(true)
    for (const mail of found) {
      expect(mail.from?.address).toMatch(/@example\.test$/)
      expect(mail.bodyText.length).toBeGreaterThan(0)
      // Metadata only: a name, a type, a size and a hash, never content.
      for (const a of mail.attachments) expect(Object.keys(a).sort()).toEqual(['contentType', 'filename', 'sha256', 'sizeBytes'])
    }
    expect(await q.getMail('nosuchsession')).toBeNull()
  })
})

describe('attacker identity fusion', () => {
  it('every identity reads its fusion over the same ten families; a lone address shares nothing', async () => {
    for (const a of (await q.getAttackers()).slice(0, 20)) {
      const fusion = (await q.getIdentityFusion(a.id))!
      expect(fusion.categories).toHaveLength(10)
      expect(fusion.values).toHaveLength(10)
      if (a.ips.length < 2) expect(fusion.values.every((v) => v === 0)).toBe(true)
    }
    expect(await q.getIdentityFusion('nosuch')).toBeNull()
  })
})

describe('ghidra deep dive', () => {
  it('the call graph is consistent both ways, and triage names the payload family', async () => {
    const payloads = (await q.getPayloads()).payloads
    let checked = 0
    for (const p of payloads) {
      const g = await q.getGhidraAnalysis(p.hash)
      if (!g) continue
      checked++
      const byName = new Map(g.functions.map((f) => [f.name, f]))
      for (const f of g.functions) {
        for (const callee of f.callees) expect(byName.get(callee)?.callers, `${f.name} -> ${callee}`).toContain(f.name)
        for (const caller of f.callers) expect(byName.get(caller)?.callees, `${caller} -> ${f.name}`).toContain(f.name)
        expect(f.calls).toBe(f.callees.length)
      }
      if (p.verdict?.family) expect(g.aiTriage.familyGuess).toContain(p.verdict.family)
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('sandbox forensics', () => {
  it('only Windows runs carry PE forensics; every run has its captures, logs and exports', async () => {
    let windows = 0
    for (const p of (await q.getPayloads()).payloads) {
      const run = await q.getSandboxRun(p.hash)
      if (!run) continue
      expect(Boolean(run.windows), p.hash).toBe(p.kind === 'PE32')
      expect(run.route.name).toBe(p.kind === 'PE32' ? 'windows-kvm' : 'linux-qemu')
      expect(run.exported.length).toBeGreaterThan(0)
      expect(run.logs.qemu.length).toBeGreaterThan(0)
      // What appeared after detonation includes everything that was there before.
      expect(run.sockets.after).toEqual(expect.arrayContaining(run.sockets.before))
      if (run.windows) windows++
    }
    expect(windows).toBeGreaterThan(0)
  })
})
