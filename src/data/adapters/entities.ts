// Wire → page mapping for the IOC and entity endpoints (APIARY#3572) and the
// facets and report-preview endpoints (APIARY#3569). Pure; nothing fetches.
// Wire shapes: ../contracts/entities.ts.

import type {
  EntityRelatedWire,
  EntityTimelineWire,
  FacetValueWire,
  FacetsWire,
  IocCatalogWire,
  IocEventSummaryWire,
  ReportPreviewWire,
} from '../contracts/entities'
import type { EventRow } from '../contracts/events'
import type { Facets, FacetValue, IocHubKind, IocRow, PreviewFilterField, RelatedGroup, ReportPreview, TimelineEntity, TimelineItem } from '../types'

export const IOC_KINDS: readonly IocHubKind[] = ['hash', 'domain', 'url', 'credential', 'command', 'fingerprint', 'cve', 'signature', 'username', 'password']

/** The ranges every entity_details.rs handler accepts. */
const ENTITY_RANGES = new Set(['1h', '6h', '24h', '7d', '30d'])

/** A page range → the entity endpoints' `range`. They take 1h…30d only, so
 * the page's `all` reads the widest window the backend serves (30d), and a
 * range the page does not name is left to the handler's own default. */
export const entityRange = (range?: string): { range?: string } =>
  range && ENTITY_RANGES.has(range) ? { range } : range === 'all' ? { range: '30d' } : {}

/** The page's entity (kind, id) → the backend's `kind:value` entity id
 * (entity_details.rs `parse_entity`). An AS is sent as its bare number,
 * which the parser takes with or without the `AS` prefix. */
export function entityId(kind: TimelineEntity, id: string): string {
  switch (kind) {
    case 'source':
      return `ip:${id}`
    case 'network':
      return `cidr:${id}`
    case 'asn':
      return `asn:${id.trim().replace(/^AS/i, '')}`
    default:
      // session, payload, identity, campaign, and the two `kind:value`
      // pairs cluster and ioc, whose page id already is that pair.
      return `${kind}:${id}`
  }
}

/** GET /api/v1/ioc/catalog → the hub's rows per kind. Every kind is present
 * on the wire; a kind it lacks (a future backend dropping one) is empty. */
export const iocCatalog = (wire: IocCatalogWire): Record<IocHubKind, IocRow[]> =>
  Object.fromEntries(
    IOC_KINDS.map((kind) => [
      kind,
      (wire.kinds[kind] ?? []).map(
        (row): IocRow => ({
          id: row.id,
          kind,
          value: row.value,
          events: row.events,
          sources: row.sources,
          sessions: row.sessions,
          ...(row.last_seen ? { last: row.last_seen } : {}),
        }),
      ),
    ]),
  ) as Record<IocHubKind, IocRow[]>

const NO_PIVOTS: EventRow['pivots'] = {
  persona: '', site: '', asset: '', fingerprint: '', fingerprint_kind: '', command: '', user: '', pass: '', path: '', shasum: '',
  asn: '', org: '', provider: '', alert: '', category: '', payload_class: '', tty_replay: '', ics_severity: '',
}

/** An indicator page's event summary (entity_details.rs `event_summary`) as
 * the row shape the event mapping reads. The summary carries no port,
 * pivots or record, so those are the empty values the row uses for absent,
 * as the event-detail row does (`detailRow`). */
export const summaryRow = (wire: IocEventSummaryWire): EventRow => ({
  id: wire.id,
  time: wire.time,
  sensor: wire.sensor,
  src_ip: wire.src_ip,
  country: wire.country,
  port: '',
  proto: wire.proto,
  detail: wire.detail,
  session: wire.session,
  ...(wire.kind ? { kind: wire.kind } : {}),
  pivots: NO_PIVOTS,
  record: {},
})

/** GET /api/v1/entities/{id}/timeline → the page's items. An unrated item
 * has no severity and an empty detail is absent, never `info` or ''. */
export const entityTimeline = (wire: EntityTimelineWire): TimelineItem[] =>
  wire.items.map((item) => ({
    id: item.id,
    at: item.at,
    kind: item.kind,
    title: item.title,
    ...(item.detail ? { detail: item.detail } : {}),
    ...(item.severity ? { severity: item.severity } : {}),
    ...(item.href ? { href: item.href } : {}),
  }))

/** GET /api/v1/entities/{id}/related → the page's groups. The note is the
 * backend's own, else the reason it states for the relation. */
export const entityRelated = (wire: EntityRelatedWire): RelatedGroup[] =>
  wire.groups
    .map((group) => ({
      kind: group.kind,
      label: group.label,
      items: group.items
        .filter((item) => item.id !== '')
        .map((item) => {
          const note = item.note ?? item.reason
          return { id: item.id, ...(item.label ? { label: item.label } : {}), ...(note ? { note } : {}) }
        }),
    }))
    .filter((group) => group.items.length > 0)

const facetValues = (rows: FacetValueWire[] | undefined): FacetValue[] => (rows ?? []).filter((row) => row.value !== '').map((row) => ({ value: row.value, count: row.count }))

/** GET /api/v1/facets/events → the pickers' value lists. */
export const facets = (wire: FacetsWire): Facets => ({
  sensors: facetValues(wire.sensors),
  sources: facetValues(wire.sources),
  countries: facetValues(wire.countries),
  protocols: facetValues(wire.protocols),
  ports: facetValues(wire.ports),
  signatures: facetValues(wire.signatures),
  kinds: facetValues(wire.kinds),
  personas: facetValues(wire.personas),
  providers: facetValues(wire.providers),
  cities: facetValues(wire.cities),
})

/** POST /api/v1/reports/preview → the wizard's preview. */
export const reportPreview = (wire: ReportPreviewWire): ReportPreview => ({
  events: wire.events,
  sources: wire.sources,
  sensors: wire.sensors,
  sessions: wire.sessions,
  sections: wire.sections,
  pages: wire.pages,
  period: wire.period,
  ...(wire.empty_filter ? { emptyFilter: { field: wire.empty_filter.field as PreviewFilterField, message: wire.empty_filter.message } } : {}),
})
