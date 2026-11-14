import { describe, expect, it } from 'vitest'
import { DARKEN, DEFAULT_MAP_TILES, mapTiles } from './mapTiles'

describe('map tiles from the environment', () => {
  it('defaults to keyless OpenStreetMap, darkened in dark mode (CARTO now needs a key)', () => {
    const tiles = mapTiles({})
    expect(tiles).toEqual(DEFAULT_MAP_TILES)
    expect(tiles.light.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(tiles.light.filter).toBeUndefined()
    expect(tiles.dark).toEqual({ ...tiles.light, filter: DARKEN })
    expect(JSON.stringify(tiles)).not.toContain('apiKey')
  })

  it('takes a configured provider for both modes, with its attribution and subdomains', () => {
    const tiles = mapTiles({ MAP_TILE_URL: 'https://{s}.tiles.example.test/{z}/{x}/{y}.png', MAP_TILE_ATTRIBUTION: '© Example', MAP_TILE_SUBDOMAINS: 'abc' })
    expect(tiles.light).toEqual({ url: 'https://{s}.tiles.example.test/{z}/{x}/{y}.png', attribution: '© Example', subdomains: 'abc' })
    expect(tiles.dark).toEqual({ ...tiles.light, filter: DARKEN })
  })

  it('uses a separate dark template when one is set', () => {
    const tiles = mapTiles({ MAP_TILE_URL: 'https://tiles.example.test/light/{z}/{x}/{y}.png', MAP_TILE_DARK_URL: 'https://tiles.example.test/dark/{z}/{x}/{y}.png' })
    expect(tiles.dark.url).toContain('/dark/')
    expect(tiles.dark.filter).toBeUndefined()
    expect(tiles.light.url).toContain('/light/')
  })

  it('passes the key only to a template that asks for it', () => {
    const asked = mapTiles({ MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png?key={apikey}', MAP_TILE_API_KEY: 'k-123' })
    expect(asked.light.apiKey).toBe('k-123')
    const unasked = mapTiles({ MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png', MAP_TILE_API_KEY: 'k-123' })
    expect(unasked.light.apiKey).toBeUndefined()
    // A key with no custom provider is never sent to OpenStreetMap or CARTO.
    expect(JSON.stringify(mapTiles({ MAP_TILE_API_KEY: 'k-123' }))).not.toContain('k-123')
  })

  it('ignores a template that is not an https URL', () => {
    expect(mapTiles({ MAP_TILE_URL: 'javascript:alert(1)//{z}' })).toEqual(DEFAULT_MAP_TILES)
    expect(mapTiles({ MAP_TILE_URL: 'http://tiles.example.test/{z}/{x}/{y}.png' })).toEqual(DEFAULT_MAP_TILES)
  })
})
