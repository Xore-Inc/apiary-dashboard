// Backend event row → the page's HoneypotEvent. Pure; nothing calls the
// backend yet. Wire shape: ../contracts/events.ts, which is shared with
// #75 and with every slice that lists events.
//
// "": on a row means absent — the backend builds each pivot with
// unwrap_or("") — so it maps to an omitted optional field, never to "".

import type { EventRow } from '../contracts/events'
import type { HoneypotEvent, ProviderClass } from '../types'

/** HoneypotEvent fields the event row never sets, and why:
 *
 * - `type` — the page's event type is finer than the row's `kind` (it
 *   splits a login into failed and succeeded), so the seam derives it from
 *   `kind` and the sensor's own event name (`pageEvent`).
 * - `eventName` — the sensor's own event name (`cowrie.login.failed`,
 *   `NEW_CONNECTION`, …) is inside `record.honeypot` under whatever key
 *   that sensor writes it as, not lifted to the row.
 * - `organization` — the decoy org. `pivots.org` is the ATTACKER's
 *   network org (`source.as.org`), a different value that the row does
 *   carry as `org`.
 *
 * `srcPort`, `city`, `severity` and `techniques` are on the row since
 * APIARY#3561, each only when present. A backend older than that sends none
 * of them: the port and city stay absent, the technique list is empty (none
 * assigned), and the severity falls back to `pivots.ics_severity`.
 */
export type EventRowGap = 'type' | 'eventName' | 'organization'

const PROVIDERS: readonly ProviderClass[] = ['network', 'hosting', 'cloud', 'scanner', 'blocklist:spamhaus']

/** "" on the wire means absent. */
const opt = (s: string): string | undefined => (s === '' ? undefined : s)

export function toHoneypotEvent(row: EventRow): Omit<HoneypotEvent, EventRowGap> {
  const p = row.pivots
  const ics = p.ics_severity
  return {
    id: row.id,
    timestamp: row.time,
    sensor: row.sensor,
    protocol: row.proto,
    srcIp: row.src_ip,
    srcIpClaimed: opt(row.src_ip_claimed ?? ''),
    dstPort: Number(row.port) || 0,
    // 0 is not a port (events.rs drops it too); absent, never 0.
    ...(typeof row.src_port === 'number' && row.src_port > 0 ? { srcPort: row.src_port } : {}),
    country: opt(row.country),
    city: opt(row.city ?? ''),
    asn: opt(p.asn),
    sessionId: opt(row.session),
    username: opt(p.user),
    password: opt(p.pass),
    command: opt(p.command),
    summary: opt(row.detail),
    // The sensor's own object, passed through as written (credentials
    // already replaced with [redacted] for the two decoys the backend
    // scrubs — see EsRecord).
    fields: row.record.honeypot ?? {},
    persona: opt(p.persona),
    site: opt(p.site),
    asset: opt(p.asset),
    fingerprint: opt(p.fingerprint),
    fingerprintKind: opt(p.fingerprint_kind),
    org: opt(p.org),
    // A class the page does not know stays absent rather than being
    // rounded to `network`: that would claim a classification the row lacks.
    provider: PROVIDERS.includes(p.provider as ProviderClass) ? p.provider : undefined,
    payloadClass: opt(p.payload_class),
    // Only DNP3 sets this, and only to those two values (ics_severity.rs).
    icsSeverity: ics === 'critical' || ics === 'high' ? ics : undefined,
    // The backend's normalized rating (APIARY#3561), or on an older backend
    // the DNP3 rating it already sent. Absent on every other row: an
    // unclassified event has no severity, not `info`.
    severity: row.severity ?? (ics === 'critical' || ics === 'high' ? ics : undefined),
    techniques: (row.techniques ?? []).filter((t) => t !== ''),
    communityId: opt(row.record.network?.community_id ?? ''),
  }
}