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

/** One drawn marker: an origin, or several merged. `countries` names each
 * country once; production's points are per city, so one country can be
 * many origins. */
export type Marker = { key: string; lat: number; lon: number; radius: number; events: number; countries: string[]; points: MapPoint[] }

const pointKey = (p: MapPoint) => `${p.country}@${p.lat.toFixed(3)},${p.lon.toFixed(3)}`

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
  if (!clustering) return sorted.map((p) => ({ key: pointKey(p), lat: p.lat, lon: p.lon, radius: markerRadius(p.events, max), events: p.events, countries: [p.country], points: [p] }))
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
      if (!near.countries.includes(p.country)) near.countries.push(p.country)
      near.points.push(p)
      near.radius = markerRadius(total, max)
    } else groups.push({ key: pointKey(p), lat: p.lat, lon: p.lon, x, y, radius: markerRadius(p.events, max), events: p.events, countries: [p.country], points: [p] })
  }
  return groups.map(({ x: _x, y: _y, ...m }) => m).sort((a, b) => b.radius - a.radius)
}

/** Whether a marker merges several origins (a click zooms in on them). */
export const isCluster = (m: Marker) => m.points.length > 1

/** What a marker says, as its tooltip and its accessible name: each country
 * once, at most five named. */
export function markerLabel(m: Marker): string {
  const named = m.countries.length > 5 ? `${m.countries.slice(0, 5).join(', ')} and ${m.countries.length - 5} more` : m.countries.join(', ')
  const where = isCluster(m) ? `${m.points.length} origins in ${named}` : named
  return `${where}: ${formatNumber(m.events)} events`
}

/** The event explorer filtered to a marker's countries. */
export const markerHref = (m: Marker) => `/events?country=${m.countries.map(encodeURIComponent).join(',')}`

/** The markers that pulse: the busiest few. */
export const busiest = (markers: Marker[]) => new Set([...markers].sort((a, b) => b.events - a.events).slice(0, PULSING).map((m) => m.key))

/** The zoom at which the world fills `width` without side gutters (Leaflet
 * tiles are 256 px), in quarter steps, never below 1. */
export const worldZoom = (width: number) => Math.max(1, Math.ceil(Math.log2(Math.max(256, width) / 256) * 4) / 4)
