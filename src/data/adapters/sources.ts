// Wire → page mapping for the sources & correlation slice. Pure functions
// over the shapes in ../contracts/sources; nothing here fetches.
import type { EventRow } from '../contracts/events'
import type {
  AttackerEntity,
  BlockRecord,
  SessionSummary,
  TimelineItem,
  ClusterKind,
  CountRow,
  CredEdge,
  HoneypotEvent,
  IdentityFusion,
  InfraCluster,
  IpProfile,
  KillChainData,
  MapPoint,
  NetworkCampaign,
  SourceProfile,
  SharedSignal,
  SourceGroup,
  Technique,
} from '../types'
import type {
  AttackerEntityWire,
  AttackerGraphWire,
  AttackerPageWire,
  BlockedIpsWire,
  AttckGridWire,
  CampaignTimelineWire,
  CampaignWire,
  FusionWire,
  SankeyWire,
  CampaignPageWire,
  ClusterPageWire,
  CorrelationWire,
  CredEdgeWire,
  IpBlockWire,
  IpProfileWire,
  KvWire,
  MapPointsWire,
  SetIpBlockBody,
  SourcesPageWire,
  TechniqueWire,
} from '../contracts/sources'

// ---- shared rows ------------------------------------------------------------

/** An aggregation bucket. The page's CountRow carries an explicit `id` the
 * wire has no field for; the key is both, as every other adapter in this
 * tree does. */
const counts = (rows: KvWire[]): CountRow[] => rows.map((row) => ({ id: row.key, label: row.key, count: row.count }))

const techniques = (rows: TechniqueWire[]): Technique[] => rows.map((row) => ({ id: row.id, name: row.name, tactic: row.domain, events: row.count }))

const scanOf = (scan: string): 'horizontal' | 'vertical' | undefined => (scan === 'horizontal' || scan === 'vertical' ? scan : undefined)

// ---- GET /api/v1/sources ----------------------------------------------------

/** GET /api/v1/sources — one row per address. The page's `SourceProfile`
 * wants an `org`; this wire row has no organization field at all (a terms
 * aggregation over `source.ip` never asks for one), so it reads as "".
 * `truncated` and `total_unique` have no page field. */
export const sourceProfiles = (wire: SourcesPageWire): SourceProfile[] =>
  wire.rows.map((row) => ({
    ip: row.ip,
    country: row.country,
    org: '',
    events: row.events,
    logins: row.logins,
    sessions: row.sessions,
    sensors: row.sensors,
    first: row.first,
    last: row.last,
  }))

/** GET /api/v1/overview/dashboard?parts=map_points. The page's MapPoint has
 * no `city` and no `url`; `ips` is optional on the page and always a count
 * on the wire, so it is always carried across. */
export const mapPoints = (wire: MapPointsWire): MapPoint[] =>
  wire.map_points.map((point) => ({ country: point.country, lat: point.lat, lon: point.lon, events: point.events, ips: point.ips }))

// ---- GET /api/v1/attackers --------------------------------------------------

/** One attackers-v1 document → the page's AttackerEntity. Shared by the store
 * list and the single-address read (`/api/v1/sources/{ip}/identities`).
 * `protocols_touched` has no page field. */
export const attacker = (row: AttackerEntityWire): AttackerEntity => {
  const entity: AttackerEntity = {
    id: row.id,
    ips: row.ips,
    fingerprints: row.fingerprints,
    payloads: row.payloads,
    credentials: row.credentials,
    sensors: row.sensors,
    events: row.events,
    first: row.first,
    last: row.last,
    updated: row.updated,
    verdicts: row.verdicts,
    techniques: row.techniques,
    destIps: row.dest_ips,
    portsTouched: row.ports_touched,
  }
  const scan = scanOf(row.scan)
  return scan ? { ...entity, scan } : entity
}

/** GET /api/v1/attackers — the entity documents, page-shaped. */
export const attackers = (wire: AttackerPageWire): AttackerEntity[] => wire.rows.map((row) => attacker(row))

/** GET /api/v1/attackers-graph?id= — the Cytoscape shape, unchanged. No
 * page type consumes it: `AttackerGraph.tsx` lays the star out from
 * `AttackerEntity.ips` itself, the same pass `ghidraCallGraph` documents. */
export const attackerGraph = (wire: AttackerGraphWire): AttackerGraphWire => ({ nodes: wire.nodes, edges: wire.edges })

// ---- GET /api/v1/campaigns and /cred-reuse ----------------------------------

/** GET /api/v1/campaigns. Three fields the page has and the wire does not:
 * `asns` (a campaigns-v1 document carries `providers`, never ASNs), `scan`
 * when the correlator found neither window, and `sequence` (the backend's
 * `explanation` is prose, not an ordered tactic list). Two numbers that
 * could be confused: the page's `portsTouched` is the size of `ports`,
 * where the wire's `ports_touched` is the *scored* count the correlator
 * blended into `score` — a different number under a similar name, so the
 * page's own value is used and the wire's is dropped. */
export const networkCampaign = (row: CampaignWire): NetworkCampaign => {
    const campaign: NetworkCampaign = {
      cidr: row.cidr,
      score: row.score,
      events: row.events,
      uniqueIps: row.unique_ips,
      sensors: row.sensors,
      ports: row.ports.map(Number).filter(Number.isFinite),
      creds: row.creds,
      payloads: row.payloads,
      alerts: row.alerts,
      providers: row.providers,
      asns: [],
      fingerprints: row.fingerprints,
      explanation: row.explanation,
      sequence: [],
      dstIpsTouched: row.dst_ips_touched,
      portsTouched: row.ports.length,
      first: row.first,
      last: row.last,
    }
    const scan = scanOf(row.scan)
    return scan ? { ...campaign, scan } : campaign
}

export const networkCampaigns = (wire: CampaignPageWire): NetworkCampaign[] => wire.rows.map((row) => networkCampaign(row))

/** GET /api/v1/cred-reuse — a bare array, most-shared first.
 * `CredEdge.id` is the `user:pass` pair: the wire splits the two halves and
 * never serves a document id, so it is rejoined. The page holds no address
 * list, so `ips` is dropped, and with it `first` — the page type carries
 * `last` only. */
export const credReuse = (wire: CredEdgeWire[]): CredEdge[] =>
  wire.map((edge) => ({
    id: `${edge.user}:${edge.pass}`,
    user: edge.user,
    pass: edge.pass,
    uniqueIps: edge.unique_ips,
    sensors: edge.sensors,
    events: edge.events,
    last: edge.last,
  }))

// ---- GET /api/v1/clusters ---------------------------------------------------

const clusterKind = (kind: string): ClusterKind => (kind === 'fingerprint' || kind === 'payload' || kind === 'asn' || kind === 'provider' ? kind : 'fingerprint')

/** GET /api/v1/clusters. The wire's four kinds are the page's four; the
 * page's fifth, `credential`, has no cluster document (a gap — widening
 * the union to match a backend that never writes one would be fiction). An
 * unknown wire kind degrades to `fingerprint` rather than widening
 * ClusterKind. `id` is the store's `kind:value` document id. */
export const infraClusters = (wire: ClusterPageWire): InfraCluster[] =>
  wire.rows.map((row) => ({ id: `${row.kind}:${row.value}`, kind: clusterKind(row.kind), value: row.value, sources: row.sources, events: row.events, sensors: row.sensors }))

// ---- GET /api/v1/ip-block ----------------------------------------------------

/** GET /api/v1/investigate/blocked-ips → the addresses whose block holds now.
 * The same rule as ip_block.rs `active()`: `Blocked`, and either no expiry or
 * one still ahead. The list is the raw document, so this is where it is
 * applied; a lapsed row is dropped rather than shown as blocked. */
export const activeBlockIps = (wire: BlockedIpsWire, now = Date.now()): string[] =>
  wire.rows
    .filter((row) => {
      if (!row.Blocked) return false
      const expires = row.ExpiresAt?.trim()
      if (!expires || expires.startsWith('0001-')) return true
      const at = Date.parse(expires)
      return Number.isNaN(at) || now < at
    })
    .map((row) => row.IP)
    .sort()

/** GET /api/v1/ip-block/{ip} — the page's BlockRecord. A record the backend
 * reports as lapsed (`Blocked` true, `Active` false) has no BlockRecord at
 * all: the page carries `block` only while the block holds, so a lapsed
 * one reads as blocked-but-unattributed. */
export function ipBlockRecord(wire: IpBlockWire): BlockRecord | null {
  if (!wire.Active) return null
  return { by: wire.BlockedBy ?? '', at: wire.BlockedAt ?? '', ...(wire.ExpiresAt ? { expiresAt: wire.ExpiresAt } : {}) }
}

/** POST /api/v1/ip-block body. Blocking carries an explicit duration in
 * days (`expires_days`; 0 = permanent): the backend refuses a block without
 * one (422). Unblocking sends none. `actor` is bound server-side, so it is
 * never sent from here. */
export const setIpBlockBody = (ip: string, blocked: boolean, expiresDays?: number): SetIpBlockBody => {
  if (!blocked) return { ip, blocked }
  if (expiresDays === undefined || !Number.isInteger(expiresDays) || expiresDays < 0) throw new Error('a block needs a duration in whole days; 0 means permanent')
  return { ip, blocked, expires_days: expiresDays }
}

// ---- GET /api/v1/investigate/{ip,cidr,cluster} ------------------------------

/** The one `Correlation` → the SourceGroup fields all three drill-downs
 * share. `truncated` and `sensors` have no field there. */
export const correlation = (wire: CorrelationWire) => ({ totalMatches: wire.total, tunnelConnections: wire.tunnel_connections, tunnelOsGuesses: wire.tunnel_os_guesses })

/** The same struct → the page IpProfile's `correlation` block.
 * `distinctSensors` is the backend's own `sensors_total`: `sensors` is only
 * the top 10, so its length undercounts on a wider spread. */
export const ipCorrelation = (wire: CorrelationWire) => ({ totalMatches: wire.total, tunnelConnections: wire.tunnel_connections, distinctSensors: wire.sensors_total, tunnelOsGuesses: wire.tunnel_os_guesses })

/** GET /api/v1/investigate/ip/{ip}. The page's `source` wants an `org`, a
 * `riskScore` and `tags`. `org` is `as_organization` and `asn` the formatted
 * `AS<as_number>` ('' when the number is unknown); the wire's deprecated
 * `asn` (the org name again) is not read. There is no score, so 0 and []. `blocked`/`block` come from the ip-block
 * endpoint and `attackerId` from the attackers store — neither is
 * something this endpoint can answer, so both are left to the caller. */
export const ipProfile = (wire: IpProfileWire): IpProfile => ({
  source: {
    ip: wire.ip,
    country: wire.country,
    org: wire.as_organization,
    events: wire.total,
    logins: 0,
    sessions: wire.sessions.reduce((sum, row) => sum + row.count, 0),
    sensors: wire.sensors.map((row) => row.key),
    first: wire.first,
    last: wire.last,
    asn: wire.as_number === null ? '' : `AS${wire.as_number}`,
    asNumber: wire.as_number,
    riskScore: 0,
    tags: [],
  },
  blocked: false,
  confirmedMalicious: wire.confirmed_malicious,
  events: [],
  sensors: counts(wire.sensors),
  credentials: counts(wire.credentials),
  commands: counts(wire.commands),
  paths: counts(wire.paths),
  ports: counts(wire.ports),
  protocols: counts(wire.protos),
  sessions: counts(wire.sessions),
  payloads: counts(wire.payloads),
  alerts: counts(wire.alerts),
  techniques: techniques(wire.techniques),
  correlation: ipCorrelation(wire.correlation),
})
// ---- GET /api/v1/charts/{attck-coverage,kill-chain-sankey,campaign-timeline}

/** GET /api/v1/charts/attck-coverage. The wire's `techniques` entries are
 * `"T1059.004 Unix Shell"` — id and name joined by one space — so they are
 * split back apart here rather than the page rendering the joined string as
 * a name. A cell is positional (`tactic_idx` / `technique_idx`), and a cell
 * pointing outside either list is dropped rather than rendered as `undefined`. */
export const attackCoverage = (wire: AttckGridWire): Pick<KillChainData, 'tactics' | 'coverage'> => {
  const ids = wire.techniques.map((entry) => entry.split(' ')[0])
  return {
    tactics: wire.tactics,
    coverage: wire.cells.flatMap((cell) => {
      const id = ids[cell.technique_idx]
      const tactic = wire.tactics[cell.tactic_idx]
      return id && tactic ? [{ tactic, technique: id, name: wire.techniques[cell.technique_idx].slice(id.length + 1), events: cell.count }] : []
    }),
  }
}

/** GET /api/v1/charts/kill-chain-sankey. The links name their tactics; the
 * page's Sankey indexes into `nodes`, so the names are resolved here. A
 * link naming a node the list does not hold is dropped, not drawn to 0. */
export const killChainFlow = (wire: SankeyWire) => {
  const index = new Map(wire.nodes.map((node, i) => [node.name, i]))
  return {
    nodes: wire.nodes.map((node) => ({ name: node.name })),
    links: wire.links.flatMap((link) => {
      const source = index.get(link.source)
      const target = index.get(link.target)
      return source === undefined || target === undefined ? [] : [{ source, target, value: link.value }]
    }),
  }
}

/** GET /api/v1/charts/campaign-timeline. Epoch millis in, ISO strings out —
 * the page's timeline parses with `Date.parse`, so the conversion happens
 * once here rather than in the chart. */
export const campaignTimeline = (wire: CampaignTimelineWire[]): KillChainData['timeline'] => wire.map((row) => ({ cidr: row.cidr, first: new Date(row.start_ms).toISOString(), last: new Date(row.end_ms).toISOString(), events: row.events }))

/** GET /api/v1/charts/attacker-fusion. The three page fields are the wire's
 * three arrays; the category a sensor does not produce is a zero column
 * upstream, so nothing is dropped here either. */
export const identityFusion = (wire: FusionWire): IdentityFusion => ({ categories: wire.categories, values: wire.values, ips: wire.ips })

// ---- the entity pages' SourceGroup ---------------------------------------

/** Value → count, most frequent first, ties by name. */
const tally = (values: string[]): CountRow[] => {
  const buckets = new Map<string, number>()
  for (const value of values) buckets.set(value, (buckets.get(value) ?? 0) + 1)
  return [...buckets].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, count]) => ({ id: label, label, count }))
}

/** The page `SourceGroup`, built from one correlation's records — the same
 * records the entity pages' event tab renders, folded by their own list
 * definitions. The rows arrive already mapped through the seam's
 * `pageEvent`, so the fold reads the page's own field names.
 *
 * What the group wants that `Correlation` cannot supply, and what is done
 * about it rather than invented:
 *
 * - `members` — `Correlation` carries no address list, only rows, so the
 *   members are the distinct `src_ip` of those rows. The records are capped
 *   at 200 across honeypot and portbridge (`CORRELATION_LIMIT`), so on a
 *   wider block this is the addresses the records show, not every address
 *   in it; the header counts `members.length`, which is then a floor.
 * - `org` — never: nothing upstream carries an organization per address, so
 *   every member reads "". The same gap as `SourceProfile.org` above.
 * - `logins` — 0: no row upstream classifies a login, so no member claims
 *   one. The same gap the ip profile fills from `sessions` instead.
 * - `networks` — the /24 of each member, which is the grouping the page's
 *   "Networks" table shows and the finest one derivable from an address.
 * - `sensors` — the correlation's own sensor buckets, capped at 10
 *   upstream, which is why this is the buckets and not a recount; the real
 *   distinct count rides alongside as `sensorsTotal`. */
export const correlationGroup = (wire: CorrelationWire, events: HoneypotEvent[]): SourceGroup => {
  const byIp = new Map<string, HoneypotEvent[]>()
  for (const row of events) if (row.srcIp) byIp.set(row.srcIp, [...(byIp.get(row.srcIp) ?? []), row])
  const times = events.map((row) => row.timestamp).sort()
  const members: SourceProfile[] = [...byIp].map(([ip, rows]) => ({
    ip,
    country: rows.find((row) => row.country)?.country ?? '',
    org: '',
    events: rows.length,
    logins: 0,
    sessions: new Set(rows.map((row) => row.sessionId).filter(Boolean)).size,
    sensors: [...new Set(rows.map((row) => row.sensor).filter(Boolean))],
    first: rows.map((row) => row.timestamp).sort()[0],
    last: rows.map((row) => row.timestamp).sort().at(-1) ?? '',
  }))
  return {
    members,
    events,
    totalMatches: wire.total,
    tunnelConnections: wire.tunnel_connections,
    tunnelOsGuesses: wire.tunnel_os_guesses,
    ...(times[0] ? { first: times[0] } : {}),
    ...(times.length ? { last: times.at(-1)! } : {}),
    sensors: wire.sensors.map((row) => ({ id: row.key, label: row.key, count: row.count })),
    sensorsTotal: wire.sensors_total,
    countries: tally(events.flatMap((row) => (row.country ? [row.country] : []))),
    networks: tally(members.map((member) => `${member.ip.split('.').slice(0, 3).join('.')}.0/24`)),
    ports: tally(events.map((row) => String(row.dstPort))),
    // The page event carries each pivot already lifted off the wire row:
    // `pivots.user` is the event's `username`, `pivots.command` its
    // `command`, and `pivots.shasum` has no page field at all — so the
    // payload table reads the sensor's own `honeypot.shasum` from `fields`,
    // which is where the row keeps it.
    credentials: tally(events.map((row) => row.username ?? '')),
    commands: tally(events.map((row) => row.command ?? '')),
    payloads: tally(events.map((row) => String(row.fields.shasum ?? ''))),
  }
}

// ---- the events read, as a source's timeline and sessions -------------------

/** GET /api/v1/events?ip= as the source's timeline: one item per event, newest
 * first as the handler serves it. A row carrying a payload hash is a capture,
 * and links to the payload; every other row links to its event. Only the
 * events of this source are here — the mock's timeline also folds in ML
 * anomalies, LLM analyses, canary triggers, auth failures and alerts, which
 * the backend does not serve for a source yet. */
export const sourceTimeline = (rows: EventRow[]): TimelineItem[] =>
  rows.map((row) => {
    const place = [row.src_ip, row.sensor].filter(Boolean).join(' · ')
    const hash = row.pivots.shasum
    if (hash) return { id: row.id, at: row.time, kind: 'capture', title: `Payload captured: ${hash.slice(0, 16)}…`, detail: place, href: `/payloads/${hash}` }
    const service = [row.proto.toUpperCase(), row.port].filter(Boolean).join(' ')
    return { id: row.id, at: row.time, kind: 'event', title: row.detail || row.sensor, detail: [place, service].filter(Boolean).join(' · '), href: `/events/${row.id}` }
  })

/** The sessions among a set of events, derived from those events alone.
 * `logins`, `commands` and `downloads` count the page's event types, so they
 * agree with the explorer's classification. `recordingShasum` is not derived
 * here: it needs the session's close record, which this read does not carry.
 * Newest session first. Events with no session id are not sessions. */
export const sessionSummaries = (events: HoneypotEvent[]): SessionSummary[] => {
  const groups = new Map<string, HoneypotEvent[]>()
  for (const event of events) if (event.sessionId) groups.set(event.sessionId, [...(groups.get(event.sessionId) ?? []), event])
  return [...groups]
    .map(([id, rows]): SessionSummary => {
      const times = rows.map((row) => row.timestamp).sort()
      return {
        id,
        srcIp: rows[0].srcIp,
        sensors: [...new Set(rows.map((row) => row.sensor))],
        first: times[0],
        last: times[times.length - 1],
        events: rows.length,
        logins: rows.filter((row) => row.type === 'login.failed' || row.type === 'login.success').length,
        commands: rows.filter((row) => row.type === 'command.input').length,
        downloads: rows.filter((row) => row.type === 'file.download').length,
      }
    })
    .sort((a, b) => b.last.localeCompare(a.last))
}

/** Address → count, most frequent first: a payload's sources. */
export const sourceCounts = (events: HoneypotEvent[]): CountRow[] => {
  const perSource = new Map<string, number>()
  for (const event of events) perSource.set(event.srcIp, (perSource.get(event.srcIp) ?? 0) + 1)
  return [...perSource].sort((a, b) => b[1] - a[1]).map(([ip, count]) => ({ id: ip, label: ip, count }))
}

// ---- GET /api/v1/investigate/{identity,campaign}/{id} -----------------------

/** The most member addresses an identity page profiles. An identity can hold
 * thousands of addresses; the first 50 are read and the page's header states
 * the identity's own total (`AttackerEntity.ips.length`). */
export const MEMBER_LIMIT = 50

/** One ip profile (GET /api/v1/investigate/ip/{ip}) as a group member: the
 * same row `sourceProfiles` builds from /sources, for an address the source
 * list's top 1000 does not hold. `asn` on this wire is the organization name. */
export const profileMember = (wire: IpProfileWire): SourceProfile => ({
  ip: wire.ip,
  country: wire.country,
  org: wire.asn,
  events: wire.total,
  logins: 0,
  sessions: wire.sessions.reduce((sum, row) => sum + row.count, 0),
  sensors: wire.sensors.map((row) => row.key),
  first: wire.first,
  last: wire.last,
})

/** The identity's `SourceGroup`: the members are given (profiled per
 * address), and every other field is folded from the events read for those
 * addresses (GET /api/v1/events?ips=, newest 100). So `sensors`, `ports` and
 * the leaderboards describe those events, not every event of the identity.
 * `totalMatches` is that read's own total. The events read does not cover the
 * portbridge tunnel, so there are no tunnel connections or OS guesses: 0 and
 * none, as nothing was counted. */
export const membersGroup = (members: SourceProfile[], events: HoneypotEvent[], total: number): SourceGroup => {
  const times = events.map((row) => row.timestamp).sort()
  return {
    members,
    events,
    totalMatches: total,
    tunnelConnections: 0,
    tunnelOsGuesses: [],
    ...(times[0] ? { first: times[0] } : {}),
    ...(times.length ? { last: times.at(-1)! } : {}),
    sensors: tally(events.map((row) => row.sensor)),
    countries: tally(events.flatMap((row) => (row.country ? [row.country] : []))),
    networks: tally(members.map((member) => `${member.ip.split('.').slice(0, 3).join('.')}.0/24`)),
    ports: tally(events.map((row) => String(row.dstPort))),
    credentials: tally(events.map((row) => row.username ?? '')),
    commands: tally(events.map((row) => row.command ?? '')),
    payloads: tally(events.map((row) => String(row.fields.shasum ?? ''))),
  }
}

/** Signals two or more member addresses share, among the events read: a
 * credential pair, a client fingerprint, a payload hash or an ASN seen from
 * at least two distinct addresses. The backend serves no per-value member
 * list, so this is derived from the (at most 100) events the page holds; a
 * signal only visible past them is not listed. Most-shared first. */
export const sharedSignals = (events: HoneypotEvent[]): SharedSignal[] => {
  const seen = new Map<string, SharedSignal>()
  const note = (kind: SharedSignal['kind'], value: string | undefined, ip: string) => {
    if (!value || !ip) return
    const id = `${kind}:${value}`
    const signal = seen.get(id) ?? { id, kind, value, members: [] }
    if (!signal.members.includes(ip)) signal.members.push(ip)
    seen.set(id, signal)
  }
  for (const row of events) {
    if (row.username || row.password) note('credential', `${row.username ?? ''}:${row.password ?? ''}`, row.srcIp)
    note('fingerprint', row.fingerprint, row.srcIp)
    note('payload', row.fields.shasum ? String(row.fields.shasum) : undefined, row.srcIp)
    note('asn', row.asn, row.srcIp)
  }
  return [...seen.values()].filter((signal) => signal.members.length >= 2).sort((a, b) => b.members.length - a.members.length || a.id.localeCompare(b.id))
}
