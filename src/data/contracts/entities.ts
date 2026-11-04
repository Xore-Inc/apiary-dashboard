// Wire shapes of the IOC and entity endpoints (APIARY#3572, entity_details.rs)
// and the facets and report-preview endpoints (APIARY#3569, facets.rs and
// reports_data.rs). Snake_case as on the wire.
//
// The entity_details handlers build their bodies with `json!`, so the OpenAPI
// document types them as a bare object; the shapes here are the handlers'
// own literals. A min/max aggregation's `value_as_string` is `null` on an
// empty aggregation, hence the `| null` on first/last.

import type { KeyCountWire, SessionBucketWire } from './sources'

/** The ten indicator kinds entity_details.rs `IOC_KINDS` defines. */
export type IocKindWire = 'hash' | 'domain' | 'url' | 'credential' | 'command' | 'fingerprint' | 'cve' | 'signature' | 'username' | 'password'

/** entity_details.rs `IocRow::to_json`. `sources` is distinct `source.ip`. */
export interface IocCatalogRowWire {
  id: string
  kind: IocKindWire
  value: string
  events: number
  sources: number
  sessions: number
  first_seen: string | null
  last_seen: string | null
}

/** GET /api/v1/ioc/catalog — every kind present, busiest value first;
 * `truncated` names the kinds holding more values than `size`. */
export interface IocCatalogWire {
  range: string
  size: number
  /** Every kind on today's backend; Partial so a dropped kind reads empty. */
  kinds: Partial<Record<IocKindWire, IocCatalogRowWire[]>>
  truncated: IocKindWire[]
}

/** entity_details.rs `event_summary`: one hit reduced to the row fields the
 * indicator page lists. Not an EventRow: no port, pivots or record. */
export interface IocEventSummaryWire {
  id: string
  time: string
  sensor: string
  src_ip: string
  country: string
  kind: 'connection' | 'login' | 'command' | 'download' | 'http' | 'alert' | null
  proto: string
  detail: string
  session: string
}

/** GET /api/v1/ioc/{kind}/{value}. 404 when the indicator was not seen. */
export interface IocDetailWire {
  id: string
  kind: IocKindWire
  value: string
  range: string
  events: number
  first_seen: string | null
  last_seen: string | null
  sources_total: number
  sessions_total: number
  sensors: KeyCountWire[]
  /** Top 20. */
  sources: KeyCountWire[]
  /** Newest 20. */
  sessions: SessionBucketWire[]
  payloads: KeyCountWire[]
  /** Newest 20. */
  recent_events: IocEventSummaryWire[]
}

/** `{kind, value}` of a parsed entity id. */
export interface EntityRefWire {
  kind: string
  value: string
}

/** entity_details.rs `timeline_item`. `severity` is null when unrated. */
export interface EntityTimelineItemWire {
  id: string
  at: string
  kind: 'event' | 'alert' | 'capture' | 'canary' | 'anomaly' | 'llm'
  title: string
  detail: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | null
  href: string
}

/** GET /api/v1/entities/{id}/timeline — newest first; `total` counts the
 * items found before `limit`. */
export interface EntityTimelineWire {
  id: string
  entity: EntityRefWire
  range: string
  total: number
  items: EntityTimelineItemWire[]
}

/** entity_details.rs `related_item`. */
export interface RelatedItemWire {
  id: string
  label: string | null
  note: string | null
  count: number
  reason: string
}

/** GET /api/v1/entities/{id}/related — empty groups are dropped. */
export interface EntityRelatedWire {
  id: string
  entity: EntityRefWire
  range: string
  groups: Array<{ kind: string; label: string; items: RelatedItemWire[] }>
}

/** facets.rs `FacetValue`: `value` is what to send back as the filter. */
export interface FacetValueWire {
  value: string
  count: number
}

/** GET /api/v1/facets/events — facets.rs `Facets`. */
export interface FacetsWire {
  kind: string
  total: number
  sensors: FacetValueWire[]
  sources: FacetValueWire[]
  countries: FacetValueWire[]
  protocols: FacetValueWire[]
  ports: FacetValueWire[]
  signatures: FacetValueWire[]
  kinds: FacetValueWire[]
  personas: FacetValueWire[]
  providers: FacetValueWire[]
  cities: FacetValueWire[]
}

/** POST /api/v1/reports/preview — reports_data.rs `ReportPreview`. */
export interface ReportPreviewWire {
  period: { from: string; to: string }
  events: number
  sources: number
  sensors: number
  sessions: number
  sections: Array<{ id: string; label: string; rows: number; pages: number; columns: [string, string]; sample: Array<[string, string]> }>
  pages: number
  /** reports_data.rs `PreviewEmptyFilter`, absent when every filter matched. */
  empty_filter?: { field: string; message: string }
}
