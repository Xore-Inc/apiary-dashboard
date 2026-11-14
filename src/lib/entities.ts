// The entity registry: every kind of thing the dashboard can open, with the
// route that shows it and the event-explorer filter behind "events with
// this". Links, the value menu, breadcrumbs, and prev/next all read from
// here, so a route rename is a one-line change (epic #25).

export type IocKind =
  | 'domain'
  | 'url'
  | 'credential'
  | 'command'
  | 'username'
  | 'password'
  | 'fingerprint'
  | 'user-agent'
  | 'cve'
  | 'signature'

export type EntityKind =
  | 'event'
  | 'session'
  | 'source'
  | 'network'
  | 'asn'
  | 'identity'
  | 'campaign'
  | 'agent-campaign'
  | 'cluster'
  | 'payload'
  | 'sensor'
  | 'recording'
  | 'country'
  | 'port'
  | 'persona'
  | 'site'
  | 'asset'
  | 'provider'
  | IocKind

type EntityDef = {
  /** Singular noun, e.g. "source IP". */
  noun: string
  /** Page that shows this entity, if it has one yet. */
  href?: (id: string) => string | undefined
  /** Event-explorer / history query for "events with this value". */
  events?: (id: string) => string
  /** Values rendered in monospace (hashes, commands, credentials…). */
  isCode?: boolean
}

const q = encodeURIComponent
const history = (query: string) => `/history?q=${q(query)}`

export const ENTITIES: Record<EntityKind, EntityDef> = {
  event: { noun: 'event', href: (id) => `/events/${q(id)}`, isCode: true },
  session: { noun: 'session', href: (id) => `/sessions/${q(id)}`, events: (id) => history(`session:${id}`), isCode: true },
  source: { noun: 'source IP', href: (id) => `/sources/${q(id)}`, events: (id) => `/events?ip=${q(id)}` },
  network: { noun: 'network', href: (id) => `/networks/${q(id)}` },
  // An AS page is keyed by its number. A label with no number (an older
  // document's org name in `asn`) has no page: plain text, never a link the
  // backend refuses.
  asn: { noun: 'autonomous system', href: (id) => asHref(id) },
  identity: { noun: 'attacker identity', href: (id) => `/identities/${q(id)}`, isCode: true },
  campaign: { noun: 'campaign', href: (id) => `/campaigns/${q(id)}` },
  'agent-campaign': { noun: 'agent campaign', href: (id) => `/agent-campaigns/${q(id)}`, isCode: true },
  cluster: { noun: 'cluster' },
  payload: { noun: 'payload', href: (id) => `/payloads/${q(id)}`, isCode: true },
  sensor: { noun: 'sensor', href: (id) => `/sensors/${q(id)}`, events: (id) => `/events?sensor=${q(id)}` },
  recording: { noun: 'recording', href: (id) => `/recordings/${q(id)}`, isCode: true },
  country: { noun: 'country', events: (id) => `/events?country=${q(id)}` },
  port: { noun: 'port', events: (id) => `/events?port=${q(id)}` },
  // The decoy side: which fictional identity, site and emulated asset was hit.
  persona: { noun: 'decoy persona', events: (id) => `/events?persona=${q(id)}` },
  site: { noun: 'decoy site', events: (id) => `/events?site=${q(id)}` },
  asset: { noun: 'decoy asset', events: (id) => `/events?asset=${q(id)}` },
  provider: { noun: 'provider class', events: (id) => `/events?provider=${q(id)}` },
  domain: { noun: 'domain', href: (id) => iocHref('domain', id), events: (id) => history(id), isCode: true },
  url: { noun: 'URL', href: (id) => iocHref('url', id), events: (id) => history(id), isCode: true },
  credential: {
    noun: 'credential pair',
    href: (id) => iocHref('credential', id),
    // A password-only pair (`:pass`, e.g. VNC) has no username to search by.
    events: (id) => (id.startsWith(':') ? history(id.slice(1)) : history(`username:${id.split(':')[0]}`)),
    isCode: true,
  },
  command: { noun: 'command', href: (id) => iocHref('command', id), events: (id) => history(id), isCode: true },
  username: { noun: 'username', href: (id) => iocHref('username', id), events: (id) => history(`username:${id}`), isCode: true },
  password: { noun: 'password', href: (id) => iocHref('password', id), events: (id) => history(id), isCode: true },
  fingerprint: { noun: 'fingerprint', href: (id) => iocHref('fingerprint', id), isCode: true },
  'user-agent': { noun: 'user agent', events: (id) => history(id), isCode: true },
  cve: { noun: 'CVE', href: (id) => iocHref('cve', id), events: (id) => history(id) },
  signature: { noun: 'IDS signature', href: (id) => iocHref('signature', id), events: (id) => history(id) },
}

/** An indicator's page; a payload hash is its payload. */
export const iocHref = (kind: string, value: string) => (kind === 'hash' ? `/payloads/${value}` : `/ioc/${kind}/${q(value)}`)

/** Infrastructure clusters live at /clusters/$kind/$value; an ASN cluster is
 * just the ASN's own page. */
export const clusterHref = (kind: string, value: string) => (kind === 'asn' ? (asHref(value) ?? `/clusters/${kind}/${q(value)}`) : `/clusters/${kind}/${q(value)}`)

/** `/asn/AS<n>` for any label that starts with an AS number. */
export function asHref(label: string): string | undefined {
  const n = /^\s*(?:AS)?(\d+)(?!\d)/i.exec(label)?.[1]
  return n ? `/asn/AS${n}` : undefined
}

export const entityHref = (kind: EntityKind, id: string) => ENTITIES[kind].href?.(id)
