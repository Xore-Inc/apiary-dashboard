// The attack map's tile provider (dash#305), from the dashboard's own
// environment at runtime, never compiled into the bundle. With nothing set,
// the keyless default: OpenStreetMap, darkened by a CSS filter in dark mode.
// (CARTO's dark_all, the old dashboard's dark basemap, now answers every
// keyless request with an "API key required" tile; with a CARTO key it is one
// MAP_TILE_DARK_URL away.)
//
//   MAP_TILE_URL          Leaflet URL template, e.g. https://{s}.tile.example/{z}/{x}/{y}.png?key={apikey}
//   MAP_TILE_DARK_URL     a native dark-mode template (default: the light tiles, darkened)
//   MAP_TILE_ATTRIBUTION  the provider's required credit
//   MAP_TILE_SUBDOMAINS   letters for {s}, e.g. abc
//   MAP_TILE_API_KEY      fills {apikey}; optional
//
// A tile key reaches the browser in every tile URL: that is how tile keys
// work. It belongs in the environment (never the repository), should be
// restricted to the dashboard's domain at the provider, and is never logged.
import type { MapTileProvider, MapTiles } from './types'

const OSM: MapTileProvider = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}

/** Light tiles turned dark: inverted, hues turned back, contrast eased, so
 * water stays blue-ish and labels stay legible on the dark card. */
export const DARKEN = 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.85) saturate(0.6)'

const darkened = (light: MapTileProvider): MapTileProvider => ({ ...light, filter: DARKEN })

/** The keyless default. */
export const DEFAULT_MAP_TILES: MapTiles = { light: OSM, dark: darkened(OSM) }

const clean = (value: string | undefined) => (value ?? '').trim()

/** Only http(s) templates: anything else would be a script or data URL in
 * an <img src>. */
const isTileUrl = (url: string) => /^https:\/\/[^\s"'<>]+$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"'<>]*$/i.test(url)

export function mapTiles(env: NodeJS.ProcessEnv = process.env): MapTiles {
  const url = clean(env.MAP_TILE_URL)
  const darkUrl = clean(env.MAP_TILE_DARK_URL)
  if (!isTileUrl(url)) {
    // No custom provider: the default, with a custom dark layer if only that is set.
    return isTileUrl(darkUrl) ? { light: OSM, dark: provider(darkUrl, env) } : DEFAULT_MAP_TILES
  }
  const light = provider(url, env)
  return { light, dark: isTileUrl(darkUrl) ? provider(darkUrl, env) : darkened(light) }
}

function provider(url: string, env: NodeJS.ProcessEnv): MapTileProvider {
  const attribution = clean(env.MAP_TILE_ATTRIBUTION)
  const subdomains = clean(env.MAP_TILE_SUBDOMAINS)
  const apiKey = clean(env.MAP_TILE_API_KEY)
  return {
    url,
    attribution,
    ...(subdomains ? { subdomains } : {}),
    // Sent only when the template asks for it.
    ...(apiKey && url.includes('{apikey}') ? { apiKey } : {}),
  }
}
