// The attack map's markers, apart from Leaflet (dash#305): sizes, the
// on-screen clustering and the words each marker says, so they are tested
// without a map.
import type { MapPoint } from '#/data/types'
import { formatNumber } from '#/lib/format'

/** Origins closer than this many screen pixels merge into one marker when
 * clustering is on. Measured on screen, so zooming in splits a cluster. */
export const CLUSTER_DISTANCE = 36
/** How many of the busiest markers pulse, when the map animates. */
export const PULSING = 5

export type Marker = { key: string; lat: number; lon: number; radius: number; events: number; countries: string[] }

/** Area proportional to event volume, 4 to 26 px across the map's range. */
export const markerRadius = (events: number, max: number) => 4 + Math.sqrt(events / Math.max(1, max)) * 22

/** One marker per country or, clustering, per group of countries whose
 * markers would overlap on screen: greedy, biggest first, each origin joining
 * the first marker within reach. `project` is the map's current
 * lat/lon -> pixel projection. Big markers come first, so small ones draw
 * on top and stay clickable. */
export function clusterMarkers(points: MapPoint[], clustering: boolean, project: (lat: number, lon: number) => [number, number]): Marker[] {
  const max = Math.max(1, ...points.map((p) => p.events))
  const sorted = [...points].sort((a, b) => b.events - a.events)
  if (!clustering) return sorted.map((p) => ({ key: p.country, lat: p.lat, lon: p.lon, radius: markerRadius(p.events, max), events: p.events, countries: [p.country] }))
  const groups: Array<Marker & { x: number; y: number }> = []
  for (const p of sorted) {
    const [x, y] = project(p.lat, p.lon)
    const near = groups.find((g) => Math.hypot(g.x - x, g.y - y) < CLUSTER_DISTANCE)
    if (near) {
      const total = near.events + p.events
      near.lat = (near.lat * near.events + p.lat * p.events) / total
      near.lon = (near.lon * near.events + p.lon * p.events) / total
      near.x = (near.x * near.events + x * p.events) / total
      near.y = (near.y * near.events + y * p.events) / total
      near.events = total
      near.countries.push(p.country)
      near.radius = markerRadius(total, max)
    } else groups.push({ key: p.country, lat: p.lat, lon: p.lon, x, y, radius: markerRadius(p.events, max), events: p.events, countries: [p.country] })
  }
  return groups.map(({ x: _x, y: _y, ...m }) => ({ ...m, key: m.countries.join(',') })).sort((a, b) => b.radius - a.radius)
}

/** What a marker says, as its tooltip and its accessible name. */
export function markerLabel(m: Marker): string {
  const where = m.countries.length > 1 ? `${m.countries.length} countries: ${m.countries.join(', ')}` : m.countries[0]
  return `${where}: ${formatNumber(m.events)} events`
}

/** The event explorer filtered to a marker's countries. */
export const markerHref = (m: Marker) => `/events?country=${m.countries.map(encodeURIComponent).join(',')}`

/** The markers that pulse: the busiest few. */
export const busiest = (markers: Marker[]) => new Set([...markers].sort((a, b) => b.events - a.events).slice(0, PULSING).map((m) => m.key))

/** The zoom at which the world fills `width` without side gutters (Leaflet
 * tiles are 256 px), in quarter steps, never below 1. */
export const worldZoom = (width: number) => Math.max(1, Math.ceil(Math.log2(Math.max(256, width) / 256) * 4) / 4)
