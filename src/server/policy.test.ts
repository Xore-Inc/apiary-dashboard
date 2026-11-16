import { describe, expect, it } from 'vitest'
import { assertBootPolicies, backendUrlPolicy, devHttpCookiePolicy, exportTokenPolicy, identityProviderPolicy, oidcDisabledPolicy, serviceTokenPolicy } from './policy'

const backend = { BACKEND_URL: 'http://backend.example.test:8080' }

describe('boot policies', () => {
  it('needs a service token, or the explicit development override', () => {
    expect(serviceTokenPolicy({ SERVICE_TOKEN: 's3cret' }).kind).toBe('token')
    expect(serviceTokenPolicy({ APIARY_ALLOW_UNAUTH_DEV: '1' }).kind).toBe('dev-override')
    for (const env of [{}, { SERVICE_TOKEN: '' }, { APIARY_ALLOW_UNAUTH_DEV: 'true' }, { APIARY_ALLOW_UNAUTH_DEV: '0' }]) expect(serviceTokenPolicy(env).kind).toBe('refuse')
  })

  it('keeps the export token apart from the service token', () => {
    expect(exportTokenPolicy({}).kind).toBe('disabled')
    expect(exportTokenPolicy({ EXPORT_TOKEN: '', SERVICE_TOKEN: '' }).kind).toBe('disabled')
    expect(exportTokenPolicy({ EXPORT_TOKEN: 'e', SERVICE_TOKEN: 's' }).kind).toBe('export-token')
    expect(exportTokenPolicy({ EXPORT_TOKEN: 'e', APIARY_ALLOW_UNAUTH_DEV: '1' }).kind).toBe('export-token')
    expect(exportTokenPolicy({ EXPORT_TOKEN: 'same', SERVICE_TOKEN: 'same' }).kind).toBe('refuse')
    const oidc = { ...backend, OIDC_ISSUER_URL: 'https://kc.example.test/realms/apiary' }
    expect(() => assertBootPolicies({ ...oidc, SERVICE_TOKEN: 'same', EXPORT_TOKEN: 'same' })).toThrow('[E-EXPORT-TOKEN]')
    expect(() => assertBootPolicies({ ...oidc, SERVICE_TOKEN: 's', EXPORT_TOKEN: 'e' })).not.toThrow()
  })

  it('needs a backend: there is no built-in data', () => {
    expect(backendUrlPolicy(backend).kind).toBe('backend')
    expect(backendUrlPolicy({ BACKEND_URL: 'https://backend.example.test/' }).kind).toBe('backend')
    for (const env of [{}, { BACKEND_URL: '' }, { BACKEND_URL: '  ' }, { BACKEND_URL: 'backend:8080' }, { BACKEND_URL: 'ftp://backend.example.test' }]) expect(backendUrlPolicy(env).kind).toBe('refuse')
    expect(() => assertBootPolicies({ SERVICE_TOKEN: 's', OIDC_ISSUER_URL: 'https://kc.example.test/realms/apiary' })).toThrow('[E-BACKEND-URL] refusing to start: BACKEND_URL is unset')
    expect(() => assertBootPolicies({ APIARY_ALLOW_UNAUTH_DEV: '1', OIDC_DISABLED: '1' })).toThrow('[E-BACKEND-URL]')
  })

  it('allows OIDC_DISABLED only in development', () => {
    expect(oidcDisabledPolicy({}).kind).toBe('enforced')
    expect(oidcDisabledPolicy({ OIDC_DISABLED: '1', NODE_ENV: 'development' }).kind).toBe('dev-override')
    expect(oidcDisabledPolicy({ OIDC_DISABLED: '1', APIARY_ALLOW_UNAUTH_DEV: '1' }).kind).toBe('dev-override')
    expect(oidcDisabledPolicy({ OIDC_DISABLED: '1', NODE_ENV: 'production' }).kind).toBe('refuse')
  })

  it('allows a clear-text session cookie only in development', () => {
    expect(devHttpCookiePolicy({}).kind).toBe('secure')
    expect(devHttpCookiePolicy({ APIARY_DEV_HTTP_COOKIE: '1', APIARY_ALLOW_UNAUTH_DEV: '1' }).kind).toBe('dev-override')
    expect(devHttpCookiePolicy({ APIARY_DEV_HTTP_COOKIE: '1', NODE_ENV: 'development' }).kind).toBe('dev-override')
    expect(() => assertBootPolicies({ ...backend, SERVICE_TOKEN: 'x', APIARY_DEV_HTTP_COOKIE: '1', NODE_ENV: 'production' })).toThrow('E-DEV-HTTP-COOKIE')
  })

  it('refuses to boot with the canonical codes', () => {
    expect(() => assertBootPolicies({})).toThrow('[E-BACKEND-URL]')
    expect(() => assertBootPolicies(backend)).toThrow('[E-SERVICE-TOKEN]')
    expect(() => assertBootPolicies({ ...backend, SERVICE_TOKEN: 's', OIDC_DISABLED: '1', NODE_ENV: 'production' })).toThrow('[E-OIDC-DISABLED]')
    expect(() => assertBootPolicies({ ...backend, SERVICE_TOKEN: 's' })).toThrow('[E-OIDC-ISSUER]')
    expect(() => assertBootPolicies({ ...backend, SERVICE_TOKEN: 's', NODE_ENV: 'development' })).toThrow('[E-OIDC-ISSUER]')
    expect(() => assertBootPolicies({ ...backend, SERVICE_TOKEN: 's', OIDC_ISSUER_URL: 'https://kc.example.test/realms/apiary' })).not.toThrow()
    expect(() => assertBootPolicies({ ...backend, APIARY_ALLOW_UNAUTH_DEV: '1', OIDC_DISABLED: '1' })).not.toThrow()
  })

  it('signs people in only through Keycloak; without it only a development instance with sign-in off runs', () => {
    expect(identityProviderPolicy({ OIDC_ISSUER_URL: 'https://kc.example.test/realms/apiary', NODE_ENV: 'development' }).kind).toBe('oidc')
    expect(identityProviderPolicy({ OIDC_DISABLED: '1', NODE_ENV: 'development' }).kind).toBe('disabled')
    expect(identityProviderPolicy({ NODE_ENV: 'development' }).kind).toBe('refuse')
    expect(identityProviderPolicy({ APIARY_ALLOW_UNAUTH_DEV: '1' }).kind).toBe('refuse')
    expect(identityProviderPolicy({ NODE_ENV: 'production' }).kind).toBe('refuse')
  })
})
