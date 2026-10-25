// Boot policies: the environment must not open the dashboard by accident.
// Both are checked before the server listens (server.ts) and when the
// server code first loads (dev), so a misconfigured process dies instead of
// serving one open request. The canonical codes and override, unchanged.
import { readActorKey } from './actorAssertion'
import { readSecret } from './secret'

/** `SERVICE_TOKEN` unset and this exactly "1" is the only way an instance
 * without the shared secret may boot. */
export const DEV_UNAUTH_OVERRIDE_ENV = 'APIARY_ALLOW_UNAUTH_DEV'
export const SERVICE_TOKEN_GATE_CODE = 'E-SERVICE-TOKEN'
export const OIDC_DISABLED_GATE_CODE = 'E-OIDC-DISABLED'
export const EXPORT_TOKEN_GATE_CODE = 'E-EXPORT-TOKEN'
export const DEV_HTTP_COOKIE_GATE_CODE = 'E-DEV-HTTP-COOKIE'
export const OIDC_ISSUER_GATE_CODE = 'E-OIDC-ISSUER'
/** "1": the session cookie works over plain HTTP (a dev server reached by
 * its LAN address). Never on a deployed instance. */
export const DEV_HTTP_COOKIE_ENV = 'APIARY_DEV_HTTP_COOKIE'

type Env = Record<string, string | undefined>
type Policy<T extends string> = { kind: T } | { kind: 'refuse'; message: string }

/** Mock scenarios are local-only once this process has a live backend. */
export const mockScenariosAllowed = (env: Env = process.env): boolean => !env.BACKEND_URL?.trim() || env[DEV_UNAUTH_OVERRIDE_ENV] === '1'

export function serviceTokenPolicy(env: Env = process.env): Policy<'token' | 'dev-override'> {
  const token = readSecret('SERVICE_TOKEN', env, SERVICE_TOKEN_GATE_CODE)
  if (token.kind === 'refuse') return token
  if (token.kind === 'value') return { kind: 'token' }
  if (env[DEV_UNAUTH_OVERRIDE_ENV] === '1') return { kind: 'dev-override' }
  return {
    kind: 'refuse',
    message: `[${SERVICE_TOKEN_GATE_CODE}] refusing to start: SERVICE_TOKEN (or SERVICE_TOKEN_FILE) is unset or empty, which would leave the backend tier open to unauthenticated requests. Set SERVICE_TOKEN, or SERVICE_TOKEN_FILE to a file holding it, to the secret the backend also carries, or for local development only set ${DEV_UNAUTH_OVERRIDE_ENV}=1 explicitly.`,
  }
}

/** `EXPORT_TOKEN` opens the blocklist export only. Unset leaves machine
 * access to it off; equal to `SERVICE_TOKEN` it would be the backend-wide
 * secret under another name, so that refuses to boot. */
export function exportTokenPolicy(env: Env = process.env): Policy<'export-token' | 'disabled'> {
  const exportToken = readSecret('EXPORT_TOKEN', env, EXPORT_TOKEN_GATE_CODE)
  if (exportToken.kind === 'refuse') return exportToken
  if (exportToken.kind === 'unset') return { kind: 'disabled' }
  const serviceToken = readSecret('SERVICE_TOKEN', env)
  if (serviceToken.kind === 'value' && exportToken.value === serviceToken.value) {
    return {
      kind: 'refuse',
      message: `[${EXPORT_TOKEN_GATE_CODE}] refusing to start: EXPORT_TOKEN equals SERVICE_TOKEN, so the export-only credential would also be the backend-wide secret. Generate a separate value for EXPORT_TOKEN (or EXPORT_TOKEN_FILE), or unset it to turn machine access to the export off.`,
    }
  }
  return { kind: 'export-token' }
}

/** OIDC_DISABLED=1 lets every request in as a fixture admin: only in
 * development, said out loud. */
export function oidcDisabledPolicy(env: Env = process.env): Policy<'enforced' | 'dev-override'> {
  if (env.OIDC_DISABLED !== '1') return { kind: 'enforced' }
  if (env.NODE_ENV === 'development' || env[DEV_UNAUTH_OVERRIDE_ENV] === '1') return { kind: 'dev-override' }
  return {
    kind: 'refuse',
    message: `[${OIDC_DISABLED_GATE_CODE}] refusing to start: OIDC_DISABLED=1 is set outside development (NODE_ENV=${env.NODE_ENV ?? 'unset'}), which would let every request in as a fixture admin with no session. Unset OIDC_DISABLED, or set NODE_ENV=development or ${DEV_UNAUTH_OVERRIDE_ENV}=1 to confirm this is a local instance.`,
  }
}

/** A session cookie without Secure travels in clear text: only for a local
 * development instance, said out loud. */
export function devHttpCookiePolicy(env: Env = process.env): Policy<'secure' | 'dev-override'> {
  if (env[DEV_HTTP_COOKIE_ENV] !== '1') return { kind: 'secure' }
  if (env.NODE_ENV === 'development' || env[DEV_UNAUTH_OVERRIDE_ENV] === '1') return { kind: 'dev-override' }
  return {
    kind: 'refuse',
    message: `[${DEV_HTTP_COOKIE_GATE_CODE}] refusing to start: ${DEV_HTTP_COOKIE_ENV}=1 is set outside development (NODE_ENV=${env.NODE_ENV ?? 'unset'}), which would send session cookies in clear text. Unset it, or set NODE_ENV=development or ${DEV_UNAUTH_OVERRIDE_ENV}=1 to confirm this is a local instance.`,
  }
}

/** Who signs people in: Keycloak when OIDC_ISSUER_URL is set; otherwise
 * the mock identity provider, which signs anyone in as anyone, so only on
 * a local instance (or with OIDC_DISABLED=1, itself development only). */
export function identityProviderPolicy(env: Env = process.env): Policy<'oidc' | 'mock'> {
  if (env.OIDC_ISSUER_URL) return { kind: 'oidc' }
  if (env.OIDC_DISABLED === '1' || env.NODE_ENV === 'development' || env[DEV_UNAUTH_OVERRIDE_ENV] === '1') return { kind: 'mock' }
  return {
    kind: 'refuse',
    message: `[${OIDC_ISSUER_GATE_CODE}] refusing to start: OIDC_ISSUER_URL is unset (NODE_ENV=${env.NODE_ENV ?? 'unset'}), which would leave only the mock identity provider, where anyone signs in as an admin. Set OIDC_ISSUER_URL to the Keycloak realm, or set NODE_ENV=development or ${DEV_UNAUTH_OVERRIDE_ENV}=1 to confirm this is a local instance.`,
  }
}

/** The key the BFF signs actor assertions with (#249): unset signs nothing
 * (the backend in `off`/`log` mode is fine with that); both forms set, or a
 * key that is not a parsable Ed25519 private key, refuses to boot. */
export function actorAssertionPolicy(env: Env = process.env): Policy<'sign' | 'unsigned'> {
  const result = readActorKey(env)
  if (result.kind === 'refuse') return result
  return { kind: result.kind === 'key' ? 'sign' : 'unsigned' }
}

/** Throws the first refusal; silent when the environment is sound. */
export function assertBootPolicies(env: Env = process.env): void {
  for (const policy of [serviceTokenPolicy(env), exportTokenPolicy(env), oidcDisabledPolicy(env), devHttpCookiePolicy(env), identityProviderPolicy(env), actorAssertionPolicy(env)]) {
    if (policy.kind === 'refuse') throw new Error(policy.message)
  }
}

export const oidcDisabled = (env: Env = process.env) => env.OIDC_DISABLED === '1'

/** The mock sign-in may run: decided per call too, so a process that
 * skipped the boot check still fails closed. */
export const mockIdentityProvider = (env: Env = process.env) => identityProviderPolicy(env).kind === 'mock'
