// The route part of the source-to-destination inventory (#2): every route
// module of the canonical dashboard (docs/migration/canonical-routes.txt, at
// the pinned commit) and where its behavior lives in the rewrite.
//
//   bun scripts/route-matrix.ts     writes docs/migration/route-matrix.md
//
// src/test/route-matrix.test.ts fails when a canonical route has no row,
// when a destination is not in the route tree, or when the document is
// stale.

import { sliceOfRoute, sliceRef } from './inventory/slice-map'

export type Status = 'implemented' | 'replaced' | 'pending'

export type Row = {
  /** The canonical route module, as named under src/routes. */
  source: string
  /** Where it lives now: rewrite route paths (the first is the main one). */
  destination: string[]
  /** Rewrite code owner when a canonical transport route was removed rather
   * than exposed as another public route. */
  owners?: string[]
  status: Status
  note: string
  /** Who enforces the canonical boundary, for a direct handler or auth
   * route; pages are all behind the navigation guard and the function
   * middleware. */
  security?: string
}

export const ROWS: Row[] = [
  // ---- Pages ----------------------------------------------------------------
  { source: 'index.tsx', destination: ['/'], status: 'implemented', note: 'Overview with its five views as top-bar tabs.' },
  { source: 'agent-campaigns.tsx', destination: ['/agent-campaigns', '/agent-campaigns/$id'], status: 'implemented', note: 'List, and an entity page per campaign.' },
  { source: 'alerts.tsx', destination: ['/alerts', '/alerts/$key'], status: 'implemented', note: 'New and Acknowledged as tabs; an entity page per alert group.' },
  { source: 'attackers.tsx', destination: ['/attackers', '/identities/$id'], status: 'implemented', note: 'The attacker dossier became the identity entity page.' },
  { source: 'auth-events.tsx', destination: ['/auth-events', '/auth-events/$id'], status: 'implemented', note: '' },
  { source: 'campaigns.tsx', destination: ['/campaigns', '/campaigns/$cidr'], status: 'implemented', note: '' },
  { source: 'canarytokens.tsx', destination: ['/canarytokens', '/canarytokens/$id', '/canarytokens/triggers/$id'], status: 'implemented', note: 'Tokens and fired tokens as tabs; creation as a dialog wizard.' },
  { source: 'cape.index.tsx', destination: ['/cape'], status: 'implemented', note: 'A tab of Analysis results.' },
  { source: 'cape.$sha.tsx', destination: ['/cape/$sha', '/payloads/$hash/cape'], status: 'replaced', note: 'Redirects to the payload page\'s CAPE tab.' },
  { source: 'clusters.tsx', destination: ['/clusters', '/clusters/$kind/$value'], status: 'implemented', note: '' },
  { source: 'commands.tsx', destination: ['/commands'], status: 'implemented', note: 'Under Indicators → Commands → Every execution; server-paged.' },
  { source: 'credentials.tsx', destination: ['/credentials', '/credentials/$id'], status: 'implemented', note: 'Provisioning as a dialog wizard.' },
  { source: 'dead-letters.tsx', destination: ['/dead-letters', '/dead-letters/$id'], status: 'implemented', note: 'A tab of Source & pipeline health.' },
  { source: 'event.$id.tsx', destination: ['/event/$id', '/events/$id'], status: 'replaced', note: 'Redirects to the event entity page.' },
  { source: 'events.tsx', destination: ['/events', '/events/$id'], status: 'implemented', note: 'Server-paged; tool links and exports as in production.' },
  { source: 'ghidra.$sha.tsx', destination: ['/ghidra/$sha', '/payloads/$hash/ghidra'], status: 'replaced', note: 'Redirects to the payload page\'s Ghidra tab.' },
  { source: 'github-analysis.index.tsx', destination: ['/github-analysis'], status: 'implemented', note: 'A tab of Analysis results.' },
  { source: 'github-analysis.$sha.tsx', destination: ['/github-analysis/$sha', '/payloads/$hash/github'], status: 'replaced', note: 'Redirects to the payload page\'s GitHub tab.' },
  { source: 'history.tsx', destination: ['/history'], status: 'implemented', note: 'Server-paged.' },
  { source: 'investigate.cidr.$cidr.tsx', destination: ['/investigate/cidr/$cidr', '/networks/$cidr'], status: 'replaced', note: 'Redirects to the network entity page.' },
  { source: 'investigate.cluster.tsx', destination: ['/investigate/cluster', '/clusters/$kind/$value'], status: 'replaced', note: 'Redirects to the cluster entity page.' },
  { source: 'investigate.ip.$ip.tsx', destination: ['/investigate/ip/$ip', '/sources/$ip'], status: 'replaced', note: 'Redirects to the source entity page.' },
  { source: 'investigate.lookup.tsx', destination: ['/investigate/lookup', '/iocs'], status: 'replaced', note: 'The lookup heads the Indicators hub.' },
  { source: 'ips.tsx', destination: ['/ips', '/sources/$ip'], status: 'implemented', note: '' },
  { source: 'kill-chain.tsx', destination: ['/kill-chain'], status: 'implemented', note: '' },
  { source: 'llm-analysis.tsx', destination: ['/llm-analysis', '/llm-analysis/$id'], status: 'implemented', note: '' },
  { source: 'ml-anomalies.tsx', destination: ['/ml-anomalies', '/ml-anomalies/$id'], status: 'implemented', note: '' },
  { source: 'payload-analysis.$hash.tsx', destination: ['/payload-analysis/$hash', '/payloads/$hash'], status: 'replaced', note: 'Redirects to the payload entity page.' },
  { source: 'payloads.tsx', destination: ['/payloads', '/payloads/$hash'], status: 'implemented', note: '' },
  { source: 'payload-workbench.results.tsx', destination: ['/payload-workbench/results'], status: 'implemented', note: 'Analyzers as top-bar tabs, with the CAPE, GitHub and RevDeck lists and the sandbox live view.' },
  { source: 'problem-reports.tsx', destination: ['/problem-reports', '/problem-reports/$id'], status: 'implemented', note: 'A tab of Source & pipeline health.' },
  { source: 'recordings.tsx', destination: ['/recordings', '/recordings/$shasum'], status: 'implemented', note: '' },
  { source: 'reports.tsx', destination: ['/reports', '/reports/generate', '/reports/history', '/reports/templates', '/reports/library'], status: 'replaced', note: 'The studio split into four pages, one sidebar entry; the old path redirects. Definitions, generation and history read and write through the Rust tier when BACKEND_URL is set; the wizard\'s preview step and the facet pickers stay on the mock, having no backend route.' },
  { source: 'revdeck.index.tsx', destination: ['/revdeck'], status: 'implemented', note: 'A tab of Analysis results.' },
  { source: 'revdeck.$sha.tsx', destination: ['/revdeck/$sha', '/payloads/$hash/revdeck'], status: 'replaced', note: 'Redirects to the payload page\'s RevDeck tab.' },
  { source: 'sandbox.$job.tsx', destination: ['/sandbox/$job', '/payloads/$hash/sandbox'], status: 'replaced', note: 'Redirects to the payload page\'s Sandbox tab.' },
  { source: 'sandbox.vnc.tsx', destination: ['/sandbox/vnc'], status: 'implemented', note: 'Under Analysis results → Sandbox → Live view.' },
  { source: 'search.tsx', destination: ['/search'], status: 'implemented', note: 'Also the command palette.' },
  { source: 'sensors.index.tsx', destination: ['/sensors', '/sensors/$sensor'], status: 'replaced', note: 'Opens the busiest sensor\'s page; every sensor is one switch away.' },
  { source: 'sensors.$sensor.tsx', destination: ['/sensors/$sensor'], status: 'implemented', note: '' },
  { source: 'sessions.$id.tsx', destination: ['/sessions/$id'], status: 'implemented', note: '' },
  { source: 'settings.tsx', destination: ['/settings', '/', '/admin'], status: 'replaced', note: 'Personal settings in the dialog (?settings=<pane>) over any page, the old path opens it; administration is its own page, /admin.' },
  { source: 'source-health.tsx', destination: ['/source-health'], status: 'implemented', note: '' },
  { source: 'topology.tsx', destination: ['/topology'], status: 'implemented', note: '' },
  { source: 'tty-replay.$shasum.tsx', destination: ['/tty-replay/$shasum', '/recordings/$shasum'], status: 'replaced', note: 'Redirects to the recording entity page.' },

  // ---- Sign-in ----------------------------------------------------------------
  { source: 'auth/login.ts', destination: ['/auth/login'], status: 'implemented', note: 'Keycloak authorization-code flow with PKCE; the local-only mock provider exercises the same pages.' , security: 'public; PKCE state and verifier kept one-time in Redis; safe `return_to`; the mock provider is refused outside development' },
  { source: 'auth/callback.ts', destination: ['/auth/callback'], status: 'implemented', note: 'Exchanges the Keycloak code, consumes one-time state, creates the Redis session, and renders provider, state, and exchange failures.' , security: 'public; completes the PKCE exchange against the one-time state; provider errors render as pages' },
  { source: 'auth/logout.ts', destination: ['/auth/logout'], status: 'implemented', note: 'Destroys the Redis session, clears the cookie, and performs Keycloak RP-initiated logout; cross-site requests get 403.' , security: 'same-origin `Origin`/`Referer` required (cross-origin 403, #3153); destroys the Redis session, then Keycloak end-session' },

  // ---- Direct handlers ----------------------------------------------------------
  { source: 'api/artifact.$kind.$key.$filename.ts', destination: ['/api/artifact/$kind/$key/$filename'], status: 'implemented', note: 'Mock files built from the run.' , security: 'handler\'s own session check; artifact admission gate' },
  { source: 'api/canarytoken.$id.download.ts', destination: ['/api/canarytoken/$id/download'], status: 'implemented', note: 'The token file proxied off the Rust tier\'s own /api/v1/canarytokens/{id}/download; a 404 there is a 404 here.', security: 'handler\'s own session check; admission gate' },
  { source: 'api/export.$name.ts', destination: ['/api/export/$name'], status: 'implemented', note: 'Same allowlist; full scope, capped at the export limit.' , security: 'handler\'s own session check; name allowlist; export admission gate' },
  { source: 'api/payload.$hash.download.ts', destination: ['/api/payload/$hash/download'], status: 'implemented', note: 'Admins only; a harmless stand-in for the live bytes.' , security: 'handler\'s own session check, then admin role; hash validated; payload admission gate' },
  { source: 'api/raw-report.$kind.$sha.ts', destination: ['/api/raw-report/$kind/$sha'], status: 'implemented', note: '' , security: 'handler\'s own session check; kind allowlist; admission gate' },
  { source: 'api/recording.$shasum.$format.ts', destination: ['/api/recording/$shasum/$format'], status: 'implemented', note: 'asciicast v2 and the raw log.' , security: 'handler\'s own session check; shasum and format validated; admission gate' },
  { source: 'api/report.$id.pdf.ts', destination: ['/api/report/$id/pdf'], status: 'implemented', note: 'A real PDF from the report\'s sections, proxied off the Rust tier\'s own reports::pdf.' , security: 'handler\'s own session check; PDF admission gate' },
  { source: 'api/chart.$name.ts', destination: ['/api/chart/$name'], status: 'implemented', note: `The 21-name allowlist, checked before the backend is called, then proxied to the Rust tier's own /api/v1/charts/{name}; a chart it cannot answer is 502, never a wrong payload.` , security: 'handler\'s own session check; chart allowlist' },
  { source: 'api/live.ts', destination: ['/api/live'], status: 'implemented', note: `Server-Sent Events proxied off the Rust tier's /api/v1/live, behind the same stream admission gate (LIVE_MAX_STREAMS) that guards the mock feed; frames are mapped into this tier's own wire shape.` , security: 'handler\'s own session check; stream admission gate (503 when full)' },
  { source: 'api/topology.flow.ts', destination: ['/api/topology/flow'], status: 'implemented', note: `The flow graph proxied off the Rust tier's /api/v1/topology, which answers the whole document; only its flow slice is served, as canonical serves it.` , security: 'handler\'s own session check' },

  // ---- Infrastructure -------------------------------------------------------------
  { source: 'healthz.ts', destination: ['/healthz'], status: 'implemented', note: 'Unauthenticated, always 200: the Traefik and Docker probe.' , security: 'public by design: the infrastructure probe' },
  { source: 'export.portbridge-manual-blackhole[.]txt.ts', destination: ['/export/portbridge-manual-blackhole.txt'], status: 'implemented', note: 'The firewall puller\'s list, byte for byte; 5xx on outage.' , security: '`X-Export-Token` equal to `EXPORT_TOKEN` (constant-time; never read from the URL; refused when unset; `SERVICE_TOKEN` is not accepted), or a signed-in session the `getBlockedIps` policy allows; 401 without either, 403 for a refused role' },
  { source: 'metrics.ts', destination: ['/metrics'], status: 'implemented', note: 'Same operational series, including backend calls, admission sheds, request timing, and authentication outcomes.' , security: 'inbound service token (`x-service-token`); refuses when none is configured' },
  { source: 'bff.$.ts', destination: [], owners: ['src/data/api.ts'], status: 'replaced', note: 'No public catch-all proxy: server functions call BACKEND_URL through the bounded, timed backend adapter.' , security: 'server-side adapter sends the service token; browser requests cannot select an upstream path' },
  { source: 'bff-mounted.$.ts', destination: [], owners: ['src/data/api.ts'], status: 'replaced', note: 'No public mounted catch-all: mounted downloads use BACKEND_MOUNTED_URL through the same allowlisted adapter.' , security: 'server-side adapter sends the service token; only fixed download operations select the mounted upstream' },
]

const LEGEND: Record<Status, string> = {
  implemented: 'the behavior lives at the destination; backend deviations are explicit in `backend-coverage.md`',
  replaced: 'the old path redirects to its new home, or its transport is owned by the named server module',
  pending: 'not in the rewrite yet; the note says what stands in and where it is tracked',
}

/** Every page: the root route's navigation guard (session, else sign-in
 * with a safe return path), and its data through server functions behind
 * the global middleware (same-origin, then session). */
const PAGE_SECURITY = 'navigation guard; function middleware'

export function renderMatrix(rows: Row[] = ROWS): string {
  const count = (status: Status) => rows.filter((r) => r.status === status).length
  const cell = (text: string) => text.replace(/\|/g, '\\|')
  const lines = [
    '# Route matrix',
    '',
    'Every route module of the canonical dashboard (`Xore/APIARY@62ee45d`, listed in `canonical-routes.txt`) and where its behavior lives in the rewrite. Generated by `bun scripts/route-matrix.ts`; `src/test/route-matrix.test.ts` keeps it complete and current.',
    '',
    `**${rows.length} routes**: ${count('implemented')} implemented, ${count('replaced')} replaced, ${count('pending')} pending.`,
    '',
    ...(['implemented', 'replaced', 'pending'] as const).map((s) => `- **${s}**: ${LEGEND[s]}`),
    '',
    '**Security owner** is who enforces the canonical boundary. Pages rely on the root route\'s navigation guard and on the global function middleware (same-origin, then session) for their data; direct handlers do not pass through either, so each names its own.',
    '',
    '| Canonical module | Rewrite | Status | Note | Security owner | Slice |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| \`${cell(r.source)}\` | ${[...r.destination.map((d) => `\`${cell(d)}\``), ...(r.owners ?? []).map((o) => `owner: \`${cell(o)}\``)].join('<br>') || '—'} | ${r.status} | ${cell(r.note)} | ${cell(r.security ?? PAGE_SECURITY)} | ${sliceRef(sliceOfRoute(r.source))} |`),
    '',
    'Each row links its migration slice (`slices.md`). Server functions with their permissions, rewrite owners, and data fields: `server-functions.md`; per-route data, mutations and states: `routes.md`; components: `components.md`; the shell: `shell.md`.',
    '',
  ]
  return lines.join('\n')
}

if (import.meta.main) {
  const { writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  writeFileSync(join(import.meta.dirname, '..', 'docs/migration/route-matrix.md'), renderMatrix())
  console.log(`docs/migration/route-matrix.md: ${ROWS.length} routes`)
}
