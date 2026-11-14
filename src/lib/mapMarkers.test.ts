import { describe, expect, it } from 'vitest'
import type { MapPoint } from '#/data/types'
import { busiest, clusterMarkers, markerHref, markerLabel, markerRadius, worldZoom } from './mapMarkers'

const points: MapPoint[] = [
  { country: 'DE', lat: 51, lon: 10, events: 400 },
  { country: 'NL', lat: 52, lon: 5, events: 100 },
  { country: 'US', lat: 38, lon: -97, events: 900 },
]
// A crude projection: 4 px per degree, like a world map ~1440 px wide.
const project = (scale: number) => (lat: number, lon: number): [number, number] => [lon * scale, -lat * scale]

describe('map markers', () => {
  it('sizes markers by area, 4 to 26 px', () => {
    expect(markerRadius(0, 100)).toBe(4)
    expect(markerRadius(100, 100)).toBe(26)
    expect(markerRadius(25, 100)).toBe(15)
  })

  it('draws one marker per country, biggest first, when clustering is off', () => {
    const markers = clusterMarkers(points, false, project(4))
    expect(markers.map((m) => m.key)).toEqual(['US', 'DE', 'NL'])
  })

  it('merges origins that overlap on screen, and splits them again zoomed in', () => {
    const far = clusterMarkers(points, true, project(4))
    expect(far.map((m) => m.countries)).toEqual([['US'], ['DE', 'NL']])
    expect(far[1].events).toBe(500)
    // DE–NL are ~5 degrees apart: 20 px at 4 px/deg, 100 px at 20 px/deg.
    expect(clusterMarkers(points, true, project(20))).toHaveLength(3)
  })

  it('says where and how much, and links to the events from there', () => {
    const [us, eu] = clusterMarkers(points, true, project(4))
    expect(markerLabel(us)).toBe('US: 900 events')
    expect(markerLabel(eu)).toBe('2 countries: DE, NL: 500 events')
    expect(markerHref(eu)).toBe('/events?country=DE,NL')
  })

  it('pulses only the busiest few', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ country: `C${i}`, lat: i * 20 - 70, lon: i * 40 - 160, events: i + 1 }))
    const pulse = busiest(clusterMarkers(many, false, project(4)))
    expect([...pulse].sort()).toEqual(['C3', 'C4', 'C5', 'C6', 'C7'])
  })

  it('opens on the zoom where the world fills the card without gutters', () => {
    // 1108 px: 2^2 * 256 = 1024 leaves gutters, 2.25 covers the width.
    expect(worldZoom(1108)).toBe(2.25)
    expect(worldZoom(1024)).toBe(2)
    expect(worldZoom(300)).toBe(1)
  })
})
