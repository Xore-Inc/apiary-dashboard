// Events & sessions slice: wire → page for every read the seam exposes in
// this slice. Pure functions over ../contracts/explorer and the shared row
// in ../contracts/events; nothing here fetches.
//
// The event row itself is already mapped by ./events `toHoneypotEvent`, so
// every list below reuses it rather than re-typing the conversion. What
// this file adds is the page envelope each list page wants, the session
// bundle, the recording store and its replay, and the grouped search.
//
// There is no page → wire function: issue #75 lists no mutation, and the
// seam exposes none in this slice, so there is nothing to build a body for.

import type {
  CountRow,
  EventDetail,
  EventFilters,
  EventsPage,
  FilterValues,
  FacetValue,
  Facets,
  HoneypotEvent,
  Paged,
  Recording,
  Replay,
  ReplayDetail,
  SearchGroup,
  SessionDetail,
  Technique,
} from '../types'
import { toHoneypotEvent } from './events'
import type { EventRowGap } from './events'
import type { EventRow } from '../contracts/events'
import type {
  EventPageWire,
  EventsQueryWire,
  FilterValuesWire,
  KvWire,
  ReplayWire,
  RecordingWire,
  RecordingsPageWire,
  SearchResultWire,
  SessionDetailWire,
  TechniqueWire,
} from '../contracts/explorer'

// ---- shared rows ------------------------------------------------------------

/** One page event. `toHoneypotEvent` (./events) deliberately returns
 * `Omit<HoneypotEvent, EventRowGap>` — the seven page fields the row cannot
 * carry — so every list below is typed with the same omission rather than
 * inventing values for them. Wiring therefore cannot forget: a list that
 * says `HoneypotEvent[]` would be a claim the row does not make. */
export type ExplorerEvent = Omit<HoneypotEvent, EventRowGap>

/** An aggregation bucket. The page's CountRow carries an explicit `id` the
 * wire has no field for; the key is both, as every other adapter in this
 * tree does. */
const counts = (rows: KvWire[]): CountRow[] => rows.map((row) => ({ id: row.key, label: row.key, count: row.count }))

/** session.rs `Technique` → the page Technique. `domain` is the ATT&CK
 * tactic; `evidence` and `url` are the backend's annotation and the
 * mitre.org link, and the page type has no field for either. */
const techniques = (rows: TechniqueWire[]): Technique[] => rows.map((row) => ({ id: row.id, name: row.name, tactic: row.domain, events: row.count }))

// ---- GET /api/v1/events -----------------------------------------------------

/** The page's EventFilters → the query params events.rs accepts.
 *
 * Every filter the page carries has a parameter of its own. The four
 * parameters that do NOT come from EventFilters — `cmd`, `cred`, `sig` and
 * `cat` — are values the detail pane's pivot links carry, and no page
 * filter holds them, so nothing here sends them; `EventsQueryWire` carries
 * them for the caller that reads them off a row.
 *
 * A page filter holding a COMMA LIST is narrowed to its first value: the
 * wire is single-valued on every one of these (`ips` is the sole
 * multi-valued parameter, and the page has no field for it). Documented
 * loss, the #79 precedent.
 *
 * `offset` and `size` are not filters and are added by `eventsQuery` from
 * the page's own window; `limit` becomes `size`, and an absent limit asks
 * for the handler's default 25 rather than an unbounded page. */
export function eventsQuery(filters: EventFilters = {}): EventsQueryWire {
  const first = (value: string | number | undefined): string | undefined => {
    if (value === undefined) return undefined
    const list = String(value).split(',')
    return list.find((v) => v.trim() !== '')?.trim()
  }
  const params: EventsQueryWire = {
    offset: 0,
    ...(filters.ip !== undefined ? { ip: first(filters.ip) } : {}),
    ...(filters.sensor !== undefined ? { sensor: first(filters.sensor) } : {}),
    ...(filters.country !== undefined ? { country: first(filters.country) } : {}),
    ...(filters.city !== undefined ? { city: first(filters.city) } : {}),
    ...(filters.port !== undefined ? { port: first(filters.port) } : {}),
    ...(filters.proto !== undefined ? { proto: first(filters.proto) } : {}),
    ...(filters.kind !== undefined ? { kind: first(filters.kind) } : {}),
    ...(filters.since !== undefined ? { since: first(filters.since) } : {}),
    ...(filters.persona !== undefined ? { persona: first(filters.persona) } : {}),
    ...(filters.site !== undefined ? { site: first(filters.site) } : {}),
    ...(filters.asset !== undefined ? { asset: first(filters.asset) } : {}),
    ...(filters.fingerprint !== undefined ? { fingerprint: first(filters.fingerprint) } : {}),
    ...(filters.org !== undefined ? { org: first(filters.org) } : {}),
    ...(filters.provider !== undefined ? { provider: first(filters.provider) } : {}),
  }
  // A key whose filter was present but held only empty comma-list entries
  // must not go on the wire as `key=` — events.rs ignores an empty value,
  // but the URL would read as though a filter were set.
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined))
}

/** The same, plus the result window: `limit` is the page's page size and
 * `offset` its start. Always page with the offset the RESPONSE reports —
 * the handler clamps the requested one to the ES from+size window. */
export function eventsQueryWindowed(filters: EventFilters, window: { offset?: number; limit?: number }): EventsQueryWire {
  return { ...eventsQuery(filters), offset: window.offset ?? 0, ...(window.limit !== undefined ? { size: window.limit } : {}) }
}

/** The commands list's query: the same params pinned to the exact
 * `honeypot.event` term the executor filter uses, at the commands page's own
 * page size. `kind` is an exact term on the wire, so a page filter naming a
 * different kind would be overridden by this one — the page is a list OF
 * commands, and narrowing it further is the caller's `cmd`/`session`
 * filter, which survives. */
export const commandsQuery = (window: { offset?: number; limit?: number } = {}): EventsQueryWire => ({ kind: 'command', offset: window.offset ?? 0, size: window.limit ?? 25 })

/** GET /api/v1/events?kind=cowrie.log.closed&shasum=…&size=1&since=365d — the
 * attribution query behind a recording: the one close event whose shasum is
 * this recording's, from which the source address is read. `since` is
 * pinned to 365d because the handler's 10-day default would lose
 * attribution for any recording older than that. */
export const recordingSourceIpQuery = (shasum: string): EventsQueryWire => ({ kind: 'cowrie.log.closed', shasum, offset: 0, size: 1, since: '365d' })

/** GET /api/v1/events — the explorer list. The filter vocabularies are a
 * second endpoint with its own read (`filterValues`), so this returns the
 * paged rows the seam's own shape expects. `offset` is the handler's
 * clamped value, not the one requested. */
export const eventRows = (wire: { total: number; offset: number; rows: EventRow[] }): Paged<ExplorerEvent> => ({
  total: wire.total,
  offset: wire.offset,
  rows: wire.rows.map(toHoneypotEvent),
})

/** The same rows with the explorer's own envelope filled in. */
export const eventsPage = (wire: { total: number; offset: number; rows: EventRow[] }): Omit<EventsPage, 'rows'> & { rows: ExplorerEvent[] } => ({
  total: wire.total,
  offset: wire.offset,
  rows: wire.rows.map(toHoneypotEvent),
})

// ---- GET /api/v1/filter-values ----------------------------------------------

/** GET /api/v1/filter-values → the filter vocabularies. `ports` are
 * strings on the wire and numbers on the page, so they are parsed; a port
 * that is not numeric is dropped rather than becoming NaN, since the page
 * renders them as numbers. `protos` is already `Protocol` (a string alias)
 * so it passes through. The aggregation caps (60 sensors, 200 countries,
 * 500 cities, 60 protos, 60 ports, 40 kinds) are the backend's, so a
 * vocabulary longer than its cap arrives short — not a value this adapter
 * chose to drop. `cities` has no field on `FilterValues` and is
 * dropped with it. */
export const filterValues = (wire: FilterValuesWire): FilterValues => ({
  sensors: wire.sensors,
  countries: wire.countries,
  protos: wire.protos,
  ports: wire.ports.map(Number).filter(Number.isFinite),
})

/** GET /api/v1/filter-values → the facet lists the filter pickers want.
 * FacetValue carries a count the wire does not have (a terms bucket has
 * one, but the handler drops it and serves keys only), so every count is 0
 * and a picker that sorts by count sees an alphabetical list. `sources`,
 * `signatures`, `personas`, `providers` and `cities` have no aggregation
 * behind them at all on this endpoint and are left empty — the sources
 * aggregator is /api/v1/sources and personas/providers are pivot params
 * with no terms vocabulary of their own. */
export const filterFacets = (wire: FilterValuesWire): Pick<Facets, 'sensors' | 'countries' | 'protocols' | 'ports' | 'kinds'> => ({
  sensors: wire.sensors.map(facet),
  countries: wire.countries.map(facet),
  protocols: wire.protos.map(facet),
  ports: wire.ports.map(facet),
  kinds: wire.kinds.map(facet),
})

/** A vocabulary value as the page's FacetValue-with-a-count. The wire has
 * no count; 0 says "unknown", which the page's own default for a facet it
 * never counted reads the same as. */
const facet = (value: string): FacetValue => ({ value, count: 0 })

// ---- GET /api/v1/event/{id} -------------------------------------------------

/** GET /api/v1/event/{id} → the event's own row.
 *
 * The detail endpoint cannot answer this on its own: it builds the body by
 * reading the document directly rather than through `events::row_from_hit`,
 * so it carries NO `pivots`, no `port`, no `proto` and no per-sensor
 * `detail` — the four fields `toHoneypotEvent` reads most of itself from.
 * Rather than synthesize them from `record` (which would re-derive the
 * sensor field naming the backend deliberately extracted server-side), this
 * takes the row from the LIST endpoint: `events?ip=…&…` scoped to the one
 * document is not expressible, so the caller pairs this detail call with the
 * row it already holds. Given such a row, everything the detail endpoint
 * adds above it is the relations and the hash list. */
export function eventDetail(wire: EventPageWire, row: EventRow, reading: EventDetail['reading']): Omit<EventDetail, 'event'> & { event: ExplorerEvent } {
  return {
    event: toHoneypotEvent(row),
    // The wire's relations are four-field samples, not HoneypotEvents: they
    // carry no id, no protocol, no port and no country, so a page row
    // synthesized from them would be fiction. The count is exact and the
    // samples are the newest 25 — of the event's own session, of the same
    // flow, and of the same address in the last 24 hours respectively.
    session: [],
    connection: [],
    source: [],
    hashes: wire.hashes,
    recordingShasum: undefined,
    record: wire.record,
    reading,
  }
}

/** GET /api/v1/event/{id} → the three relation counts the detail page shows
 * beside its pivot groups, and the flow key they pivot on. Nothing else on
 * the page type can be answered by this endpoint. */
export const eventRelations = (wire: EventPageWire) => ({
  session: { key: wire.session_events.key, total: wire.session_events.total },
  flow: { key: wire.flow_events.key, total: wire.flow_events.total },
  source: { key: wire.source_events.key, total: wire.source_events.total },
  flowLink: wire.flow_link,
})

/** The event document behind the inspector pane, exactly as indexed (with
 * credentials redacted for the two decoy sensors, as everywhere else). The
 * page's HoneypotEvent.fields is that same document's `honeypot` object. */
export const eventRecord = (wire: EventPageWire): Record<string, unknown> => wire.record

// ---- GET /api/v1/sessions/{id} ----------------------------------------------

/** GET /api/v1/sessions/{id} → the page SessionDetail.
 *
 * The bundle maps almost exactly: four Kv leaderboards, the ATT&CK table
 * and every event of the session. `first`/`last` are the session's own
 * bounds and `events` is the chronological body, so the page needs no
 * re-derivation. `sequences` — the backend's two curated multi-step
 * detections — have no field on SessionDetail and are dropped. `total` is
 * the true match count and can exceed `events.length`, which is capped at
 * 1000 by the handler; the page type has no total, so the cap is silent.
 * There is no recording reference on the wire at all: `recordingShasum` is
 * left undefined and the page has to get it from the recordings list. */
export function sessionDetail(wire: SessionDetailWire): Omit<SessionDetail, 'recordingShasum' | 'events'> & { events: ExplorerEvent[] } {
  return {
    id: wire.id,
    events: wire.events.map(toHoneypotEvent),
    total: wire.total,
    records: wire.events.map((row) => row.record as Record<string, unknown>),
    srcIp: wire.ip,
    country: wire.country,
    first: wire.first,
    last: wire.last,
    sensors: counts(wire.sensors),
    commands: counts(wire.commands),
    credentials: counts(wire.credentials),
    payloads: counts(wire.payloads),
    techniques: techniques(wire.techniques),
  }
}

// ---- GET /api/v1/recordings --------------------------------------------------

/** One row of GET /api/v1/recordings → the page Recording. The page's `id`
 * has no wire field: this handler projects seven paths out of the close
 * event and never serves a document id, so the shasum stands in — which is
 * exactly what the page's own list does, given that many sessions share one
 * recording. `srcIp` and `country` are optional on the page and "" on the
 * wire when enrichment left the tunnel address unattributed, so they are
 * omitted rather than rendered as an empty source. */
export const recording = (wire: RecordingWire): Recording => ({
  id: wire.shasum,
  when: wire.when,
  ...(wire.src_ip ? { srcIp: wire.src_ip } : {}),
  ...(wire.country ? { country: wire.country } : {}),
  session: wire.session,
  shasum: wire.shasum,
  sizeBytes: wire.size_bytes,
  durationMs: wire.duration_ms,
})

/** GET /api/v1/recordings?offset&size[&ip]. */
export const recordingRows = (wire: RecordingsPageWire): Recording[] => wire.rows.map(recording)

/** GET /api/v1/recordings/{shasum} → the page Replay. `size_bytes` and
 * `imported_at` have no page field; `ttylog_base64`, the original timed
 * frame stream, goes to the xterm player (dash#305). A `null` argument is
 * the 404 the handler returns, passed through as the page's own "no such
 * recording". */
export const replay = (wire: ReplayWire | null): Replay | null =>
  wire && { shasum: wire.shasum, frames: wire.frames, durationSeconds: wire.duration_seconds, transcript: wire.transcript, ...(wire.ttylog_base64 ? { ttylog: wire.ttylog_base64 } : {}) }

/** The ReplayDetail the recordings page renders: the replay itself plus the
 * sessions it covers. The attacker block behind it needs an address profile
 * this slice does not assemble — the recordings page gets it from
 * /api/v1/investigate/ip/{ip}, whose wire shape is in ../contracts/sources
 * and whose adapter is ./sources, so it is left to the caller rather than
 * half-built here. */
export const replayDetail = (wire: ReplayWire | null, sessions: Recording[]): ReplayDetail | null => {
  const decoded = replay(wire)
  return decoded && { replay: decoded, sessions, attacker: null }
}

// ---- GET /api/v1/search?q= ---------------------------------------------------

/** GET /api/v1/search?q= → the page SearchGroup list.
 *
 * The page group carries an `id`, a `total` and `items` of
 * `{label, detail, href}`; the wire group carries only a title, its hits,
 * an overflow count and an overflow URL. `id` is the title lowercased with
 * non-alphanumerics collapsed to a dash, which is stable for the seven
 * fixed group titles the handler emits (it hard-codes all of them). `total`
 * is the number of hits the group SHOWS, because the page renders one item
 * per hit and the wire's `more` is a count of documents the cap left out,
 * not additional items — the overflow link is what carries it, as
 * `moreHref`. `detail` is the hit's document count; `href` is the wire's own
 * in-app URL, already encoded.
 *
 * Groups arrive in the handler's fixed order with no ranking: the wire does
 * not sort them, and the page's own search orders by how well each group's
 * best hit matches, which is a ranking this endpoint cannot supply. */
export const searchGroups = (wire: SearchResultWire): SearchGroup[] =>
  wire.groups.map((group) => ({
    id: group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: group.title,
    total: group.hits.length,
    items: group.hits.map((hit) => ({ label: hit.label, detail: String(hit.count), href: hit.url })),
    ...(group.more > 0 ? { moreHref: group.more_url } : {}),
  }))