// Sessions: an opaque id in an HttpOnly cookie, the identity behind it in a
// store. Keycloak sign-in keeps the store in Redis, shared by every
// instance. A development instance with OIDC_DISABLED=1 signs nobody in; it
// keeps an empty store in this process's memory. Server-only.
import { randomBytes } from 'node:crypto'
import { Redis } from 'ioredis'
import { warnThrottled } from './faults'
import { DEV_HTTP_COOKIE_ENV, oidcConfigured } from './policy'

export type Role = 'admin' | 'viewer'

export type Session = {
  sub: string
  username: string
  displayName: string
  email: string
  role: Role
  createdAt: number
  /** Keycloak's id token, the hint its end-session endpoint wants. */
  idToken?: string
}

/** What the Redis store and the in-memory one both do. */
export interface SessionStore {
  create: (data: Omit<Session, 'createdAt'>) => Promise<string>
  get: (sid: string | undefined) => Promise<Session | null>
  destroy: (sid: string | undefined) => Promise<void>
}

export const SESSION_TTL_SECONDS = 12 * 60 * 60
/** The canonical cookie: `__Host-` pins it to this origin, path `/`, Secure. */
export const SESSION_COOKIE = '__Host-apiary_bff'

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, { session: Session; expires: number }>()
  constructor(private readonly now: () => number = Date.now) {}

  create(data: Omit<Session, 'createdAt'>): Promise<string> {
    const sid = randomBytes(32).toString('base64url')
    this.sessions.set(sid, { session: { ...data, createdAt: this.now() }, expires: this.now() + SESSION_TTL_SECONDS * 1000 })
    return Promise.resolve(sid)
  }

  get(sid: string | undefined): Promise<Session | null> {
    if (!sid || sid.length > 128) return Promise.resolve(null)
    const entry = this.sessions.get(sid)
    if (!entry) return Promise.resolve(null)
    if (entry.expires <= this.now()) {
      this.sessions.delete(sid)
      return Promise.resolve(null)
    }
    return Promise.resolve(entry.session)
  }

  destroy(sid: string | undefined): Promise<void> {
    if (sid) this.sessions.delete(sid)
    return Promise.resolve()
  }
}

/** The commands the Redis store needs, so a test can stand in for Redis. */
export type RedisLike = Pick<Redis, 'set' | 'get' | 'getdel' | 'del'>

const SESSION_PREFIX = 'bff:session:'

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly client: RedisLike,
    private readonly now: () => number = Date.now,
  ) {}

  async create(data: Omit<Session, 'createdAt'>): Promise<string> {
    const sid = randomBytes(32).toString('base64url')
    await this.client.set(SESSION_PREFIX + sid, JSON.stringify({ ...data, createdAt: this.now() }), 'EX', SESSION_TTL_SECONDS)
    return sid
  }

  async get(sid: string | undefined): Promise<Session | null> {
    if (!sid || sid.length > 128) return null
    const raw = await this.client.get(SESSION_PREFIX + sid)
    return raw ? (JSON.parse(raw) as Session) : null
  }

  async destroy(sid: string | undefined): Promise<void> {
    if (sid) await this.client.del(SESSION_PREFIX + sid)
  }
}

/** One connection per process, for sessions and pending sign-ins. */
export function redis(): Redis {
  const holder = globalThis as typeof globalThis & { __apiaryRedis?: Redis }
  if (!holder.__apiaryRedis) {
    const client = new Redis(process.env.OIDC_SESSION_REDIS_URL ?? 'redis://127.0.0.1:6379/0', {
      maxRetriesPerRequest: 2,
      // On, unlike a cache client: with it off a command issued before the
      // socket is ready throws instead of waiting, and right after a deploy
      // every sign-in answered 500 against a healthy Redis (canonical).
      // Bounded by the retries above and the connect timeout below.
      enableOfflineQueue: true,
      connectTimeout: 5000,
      // Connects on the first command, not on import.
      lazyConnect: true,
    })
    // Never crash on a Redis flap, never swallow it either.
    client.on('error', (error: Error) => warnThrottled('[session] redis error:', error))
    holder.__apiaryRedis = client
  }
  return holder.__apiaryRedis
}

/** The process's store. Kept on the process, not the module: in
 * development a code reload re-evaluates this module, and a fresh store
 * would sign everyone out. */
const holder = globalThis as typeof globalThis & { __apiarySessions?: SessionStore }
export const sessions: SessionStore = (holder.__apiarySessions ??= oidcConfigured() ? new RedisSessionStore(redis()) : new MemorySessionStore())

/** Development over plain HTTP from another machine: browsers refuse a
 * Secure (and so a `__Host-`) cookie there, and sign-in would loop. With
 * APIARY_DEV_HTTP_COOKIE=1 (development only, see policy.ts) the session
 * rides in this cookie instead: same HttpOnly and SameSite, not Secure. */
export const DEV_SESSION_COOKIE = 'apiary_bff_dev'

const devHttp = () => process.env[DEV_HTTP_COOKIE_ENV] === '1'
const cookieName = () => (devHttp() ? DEV_SESSION_COOKIE : SESSION_COOKIE)
const attributes = (maxAge: number) => `Path=/; HttpOnly; ${devHttp() ? '' : 'Secure; '}SameSite=Lax; Max-Age=${maxAge}`

export const sessionCookie = (sid: string) => `${cookieName()}=${sid}; ${attributes(SESSION_TTL_SECONDS)}`

export const clearSessionCookie = () => `${cookieName()}=; ${attributes(0)}`

export function sidFrom(request: Request): string | undefined {
  const wanted = cookieName()
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === wanted) return rest.join('=')
  }
  return undefined
}
