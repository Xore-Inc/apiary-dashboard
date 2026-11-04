// Wire shapes of the backend's event rows, shared by every slice that lists
// events. Typed from the Rust structs in backend-service: src/events.rs
// (EventRow, EventPivots, CorrelatedIp, EventsPage, row_from_source,
// row_from_hit, pivots_from_source). Snake_case as on the wire.
//
// #75 builds on this file, as do the Monitor pages: /api/v1/events is the
// endpoint behind the overview's recent-activity list as well as the
// sessions and IP-profile drill-downs, so the row shape is deliberately
// here rather than in any one slice's contract.
//
// Every String field the backend builds with `unwrap_or("")` arrives as ""
// when the source document lacks it, so "" means "absent" throughout — the
// one exception is `id`, which is `#[serde(default)]` (present, but "").
//
// These are all backend-built structs with every field set on every path,
// so nothing here is optional. That is the opposite of the store rows in
// ./monitor, which are raw `_source` documents written by the workers.

/** events.rs `EventRow.record`: the complete normalized ECS `_source` the
 * backend read, for the record-inspector pane. Dynamic — only the two
 * sub-objects the backend itself reads (events.rs `pivots_from_source`,
 * `attacker_ip`) and the canonical frontend reads are typed. For
 * `http-honeypot` and `cisco-asa-honeypot` this is the document with
 * credential values replaced by `[redacted]` (`secrets_boundary::scrub_source`);
 * every other sensor's record is untouched. */
export interface EsRecord {
  /** The sensor's own object, as each sensor writes it. */
  honeypot?: Record<string, unknown>
  /** `network.community_id` (suricata rows only) and `network.protocol`. */
  network?: { community_id?: string; protocol?: string }
  [key: string]: unknown
}

/** events.rs `EventPivots`: the values pulled out of the record for the
 * detail pane's pivot links, extracted server-side so the frontend never
 * re-derives per-sensor field naming. Every field is a string, "" meaning
 * absent — the pane skips an empty one. `pass` is scrubbed for the two
 * decoys above (#3213); `ics_severity` is "critical"/"high"/"" and only
 * ever set for DNP3; `provider` is the attribution class. */
export interface EventPivots {
  persona: string
  site: string
  asset: string
  fingerprint: string
  fingerprint_kind: string
  command: string
  user: string
  pass: string
  path: string
  shasum: string
  asn: string
  org: string
  provider: string
  alert: string
  category: string
  payload_class: string
  tty_replay: string
  ics_severity: string
}

/** events.rs `severity_from_source`'s closed set. */
export type EventSeverityWire = 'critical' | 'high' | 'medium' | 'low'

/** events.rs `kind_from_source`'s closed set. */
export type EventKindWire = 'connection' | 'login' | 'command' | 'download' | 'http' | 'alert'

/** events.rs `EventRow`. `port` is a string even when the port is numeric
 * (`destination.port`, falling back to `honeypot.port` then
 * `honeypot.dst_port` for the sensors that write only those). */
export interface EventRow {
  /** The address the request itself claimed (X-Forwarded-For) when it
   * disagrees with the connection portbridge recorded; "" otherwise. It
   * is `skip_serializing_if` empty, so it is absent from the JSON on a row
   * with no claim. */
  src_ip_claimed?: string
  /** The ES document id (events.rs `row_from_hit`), or "" on the SSE live
   * stream and the CSV exports, which carry a bare `_source` and no hit. */
  id: string
  time: string
  sensor: string
  src_ip: string
  /** `source.geo.country_iso_code`. */
  country: string
  port: string
  /** events.rs `src_port_from_source` (APIARY#3561): `source.port`, or the
   * Suricata alert's own `src_port`. `skip_serializing_if` none, so absent
   * when no document carries one — and on a backend older than #3561. */
  src_port?: number
  /** `source.geo.city_name`. Absent when the address resolved to no city. */
  city?: string
  /** events.rs `severity_from_source`: Suricata 1/2/3 → high/medium/low,
   * DNP3 critical/high. Absent on an unrated event, never defaulted. */
  severity?: EventSeverityWire
  /** events.rs `kind_from_source`: the producer's event name normalized.
   * Absent when the name maps onto none of these. */
  kind?: EventKindWire
  /** ATT&CK technique ids the Suricata rule assigned. Omitted when empty. */
  techniques?: string[]
  proto: string
  detail: string
  session: string
  pivots: EventPivots
  record: EsRecord
}

/** events.rs `CorrelatedIp`: the distinct addresses sharing the active
 * fingerprint filter, each pre-checked against the other active filters. */
export interface CorrelatedIp {
  ip: string
  count: number
  checked: boolean
}

/** GET /api/v1/events: events.rs `list` → `EventsPage`. `size` is clamped
 * to 100 and the returned `offset` to `10_000 - size` (the ES from+size
 * window guard), so `offset` can differ from the one requested — always
 * page with the returned value. `total` is exact (`track_total_hits`). */
export interface EventsPage {
  total: number
  offset: number
  rows: EventRow[]
  /** null unless a `?fingerprint=` filter matched more than one address
   * (nothing to isolate otherwise). */
  fingerprint_ips: CorrelatedIp[] | null
}