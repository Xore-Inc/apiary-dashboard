// The effective role policy for every generated HTTP route and every server
// query. Route paths come from TanStack's generated tree; query names come
// from the one backend facade, so additions cannot silently miss the matrix.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { queryNames } from '../src/data/backend'
import { authorize } from '../src/server/authorize'
import type { SessionUser } from '../src/data/types'

const root = join(import.meta.dirname, '..')

export type RoutePolicy =
  | 'public'
  | 'same-origin'
  | 'service-token'
  | 'network'
  | 'session-or-token'
  | 'page'
  | 'handler'
  | 'admin-page'
  | 'admin-handler'

export function routeEntries(
  tree = readFileSync(join(root, 'src/routeTree.gen.ts'), 'utf8'),
): Array<{ path: string; type: string }> {
  const start = tree.indexOf('export interface FileRoutesByFullPath')
  const block = tree.slice(start, tree.indexOf('\n}', start))
  return [...block.matchAll(/^\s+'([^']+)': typeof (\w+)/gm)].map((match) => ({ path: match[1], type: match[2] }))
}

export const routePaths = (tree?: string): string[] => routeEntries(tree).map((route) => route.path)
const generatedTypes = new Map(routeEntries().map((route) => [route.path, route.type]))

const trimIndexSlash = (path: string) =>
  path.length > 1 ? path.replace(/\/$/, '') : path

export function routePolicy(path: string, type = generatedTypes.get(path)): RoutePolicy {
  const route = trimIndexSlash(path)
  if (['/auth/login', '/auth/callback', '/healthz', '/readyz'].includes(route))
    return 'public'
  if (route === '/auth/logout') return 'same-origin'
  if (route === '/metrics') return 'service-token'
  if (route === '/export/portbridge-manual-blackhole.txt') return 'session-or-token'
  if (route === '/admin') return 'admin-page'
  if (route === '/api/payload/$hash/download') return 'admin-handler'
  if (route.startsWith('/api/')) return 'handler'
  if (type?.startsWith('Layout')) return 'page'
  throw new Error(`No authorization policy for ${path} (${type ?? 'unknown route type'})`)
}

const ROUTE_ACCESS: Record<
  RoutePolicy,
  { anonymous: string; viewer: string; admin: string; enforcement: string }
> = {
  public: {
    anonymous: 'allow',
    viewer: 'allow',
    admin: 'allow',
    enforcement: 'public route handler',
  },
  'same-origin': {
    anonymous: 'same-origin',
    viewer: 'same-origin',
    admin: 'same-origin',
    enforcement: '`Origin`/`Referer`; cross-origin 403',
  },
  'service-token': {
    anonymous: 'token',
    viewer: 'token',
    admin: 'token',
    enforcement: '`x-service-token`; roles do not grant access',
  },
  network: {
    anonymous: 'allow',
    viewer: 'allow',
    admin: 'allow',
    enforcement: 'network boundary; backend service token',
  },
  'session-or-token': {
    anonymous: '401 (or token)',
    viewer: 'allow',
    admin: 'allow',
    enforcement: '`x-service-token` = `SERVICE_TOKEN`, else session with `getBlockedIps` access',
  },
  page: {
    anonymous: '307 sign-in',
    viewer: 'allow',
    admin: 'allow',
    enforcement: '`_layout` navigation guard',
  },
  handler: {
    anonymous: '401',
    viewer: 'allow',
    admin: 'allow',
    enforcement: 'route handler session check',
  },
  'admin-page': {
    anonymous: '307 sign-in',
    viewer: 'redirect `/`',
    admin: 'allow',
    enforcement: '`_layout` then route `beforeLoad`',
  },
  'admin-handler': {
    anonymous: '401',
    viewer: '403',
    admin: 'allow',
    enforcement: 'route handler session and role checks',
  },
}

const viewer: SessionUser = {
  name: 'Viewer',
  email: 'viewer@example.test',
  roles: ['viewer'],
}
const admin: SessionUser = {
  name: 'Admin',
  email: 'admin@example.test',
  roles: ['admin'],
}
const decision = (name: string, user: SessionUser | null) => {
  const value = authorize(name, user)
  return value === 'allowed' ? 'allow' : value === 'sign-in' ? '401' : '403'
}

export function renderAuthorizationMatrix(
  paths = routePaths(),
  queries = queryNames(),
): string {
  const routeRows = paths.map((path) => ({
    path,
    ...ROUTE_ACCESS[routePolicy(path)],
  }))
  return [
    '# Authorization matrix',
    '',
    'Effective access for every generated HTTP route and every server query. “Viewer” is the canonical user role. A page redirect is navigation behavior; a direct handler or server query returns an HTTP refusal.',
    '',
    `## HTTP routes (${routeRows.length})`,
    '',
    '| Route | Anonymous | Viewer | Admin | Enforcement owner |',
    '|---|---|---|---|---|',
    ...routeRows.map(
      (row) =>
        `| \`${row.path}\` | ${row.anonymous} | ${row.viewer} | ${row.admin} | ${row.enforcement} |`,
    ),
    '',
    'The two canonical catch-all BFF routes are intentionally absent: browser-selected upstream paths were removed. `src/data/api.ts` owns fixed server-side backend calls and sends the service token. Static assets are served by `server.ts` and contain no protected data.',
    '',
    `## Server queries (${queries.length})`,
    '',
    'Every TanStack server function first passes the same-origin middleware in `src/start.ts`. State-changing calls also require `x-csrf-token`; the role decision below is then enforced in `src/data/backend.ts` for both mock and live adapters.',
    '',
    '| Query | Anonymous | Viewer | Admin |',
    '|---|---|---|---|',
    ...[...queries]
      .sort()
      .map(
        (name) =>
          `| \`${name}\` | ${decision(name, null)} | ${decision(name, viewer)} | ${decision(name, admin)} |`,
      ),
    '',
  ].join('\n')
}

if (import.meta.main) {
  writeFileSync(
    join(root, 'docs/migration/authorization-matrix.md'),
    renderAuthorizationMatrix(),
  )
  console.log(
    `docs/migration/authorization-matrix.md: ${routePaths().length} routes, ${queryNames().length} queries`,
  )
}
