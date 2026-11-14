import { describe, expect, it } from 'vitest'
import { asHref, clusterHref, entityHref } from './entities'

describe('AS links', () => {
  it.each([
    ['AS64496', '/asn/AS64496'],
    ['64496', '/asn/AS64496'],
    ['as64496', '/asn/AS64496'],
    // Older documents carry the org after the number in `asn`.
    ['AS9541 Cyber Internet Services (Pvt) Ltd.', '/asn/AS9541'],
  ])('links %s to its number', (label, href) => {
    expect(asHref(label)).toBe(href)
    expect(entityHref('asn', label)).toBe(href)
    expect(clusterHref('asn', label)).toBe(href)
  })

  it('gives an org name with no AS number no page', () => {
    expect(asHref('Cyber Internet Services (Pvt) Ltd.')).toBeUndefined()
    expect(entityHref('asn', 'Example Transit')).toBeUndefined()
  })
})
