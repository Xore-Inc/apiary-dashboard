import { describe, expect, it } from 'vitest'
import { assertBootPolicies, devHttpCookiePolicy, exportTokenPolicy, identityProviderPolicy, mockScenariosAllowed, oidcDisabledPolicy, serviceTokenPolicy } from './policy'

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
    const oidc = { OIDC_ISSUER_URL: 'https://kc.example.test/realms/apiary' }
    expect(() => assertBootPolicies({ ...oidc, SERVICE_TOKEN: 'same', EXPORT_TOKEN: 'same' })).toThrow('[E-EXPORT-TOKEN]')
    expect(() => assertBootPolicies({ ...oidc, SERVICE_TOKEN: 's', EXPORT_TOKEN: 'e' })).not.toThrow()
  })

  it('allows mock scenarios beside a live backend only with the explicit development override', () => {
    expect(mockScenariosAllowed({})).toBe(true)
    expect(mockScenariosAllowed({ BACKEND_URL: 'http://backend.test' })).toBe(false)
    expect(mockScenariosAllowed({ BACKEND_URL: 'http://backend.test', APIARY_ALLOW_UNAUTH_DEV: '1' })).toBe(true)
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
    expect(() => assertBootPolicies({ SERVICE_TOKEN: 'x', APIARY_DEV_HTTP_COOKIE: '1', NODE_ENV: 'production' })).toThrow('E-DEV-HTTP-COOKIE')
  })

  it('refuses to boot with the canonical codes', () => {
    expect(() => assertBootPolicies({})).toThrow('[E-SERVICE-TOKEN]')
    expect(() => assertBootPolicies({ SERVICE_TOKEN: 's', OIDC_DISABLED: '1', NODE_ENV: 'production' })).toThrow('[E-OIDC-DISABLED]')
    expect(() => assertBootPolicies({ SERVICE_TOKEN: 's' })).toThrow('[E-OIDC-ISSUER]')
    expect(() => assertBootPolicies({ SERVICE_TOKEN: 's', OIDC_ISSUER_URL: 'https://kc.example.test/realms/apiary' })).not.toThrow()
  })

  it('allows the mock identity provider only on a local instance', () => {
    expect(identityProviderPolicy({ OIDC_ISSUER_URL: 'https://kc.example.test/realms/apiary', NODE_ENV: 'development' }).kind).toBe('oidc')
    expect(identityProviderPolicy({ NODE_ENV: 'development' }).kind).toBe('mock')
    expect(identityProviderPolicy({ APIARY_ALLOW_UNAUTH_DEV: '1' }).kind).toBe('mock')
    expect(identityProviderPolicy({ NODE_ENV: 'production' }).kind).toBe('refuse')
  })
})
