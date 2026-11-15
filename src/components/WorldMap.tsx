// The attack map on Leaflet (dash#305), as the old dashboard drew it: real
// tiles from the configured provider (keyless OpenStreetMap by default,
// darkened in dark mode), one marker per source country sized by volume,
// clustered on screen so zooming in splits a group.
//
// Leaflet and its stylesheet are loaded inside an effect: their own chunk,
// fetched only where a map is drawn, never part of the server render. The
// div Leaflet draws into is never one React renders children into.
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@astryxdesign/core/theme'
import { useNavigate } from '@tanstack/react-router'
import type * as Leaflet from 'leaflet'
import type { Map as LeafletMap } from 'leaflet'
import type { MapPoint, MapTileProvider } from '#/data/types'
import { DEFAULT_MAP_TILES } from '#/data/mapTiles'
import { busiest, clusterMarkers, isCluster as merged, markerHref, markerLabel, worldZoom } from '#/lib/mapMarkers'
import { usePreferences } from '#/lib/prefs'
import { useShellConfig } from '#/lib/session'
import { DATA_INK } from '#/lib/chartTheme'

const HEIGHT = 420
const CARD = 'var(--color-background-card)'

/** Attack origins: one marker per source country (or per cluster of nearby
 * countries, as the operator prefers), area proportional to event volume.
 * A country's marker opens its events; a cluster's zooms in on its members.
 * Markers are links a keyboard reaches. The busiest pulse, unless the
 * operator turned map animation off or asked for reduced motion. */
export function WorldMap({ points }: { points: MapPoint[] }) {
  const navigate = useNavigate()
  const prefs = usePreferences()
  const tiles = useShellConfig().map ?? DEFAULT_MAP_TILES
  const { mode } = useTheme()
  const clustering = prefs?.mapClustering ?? true
  const animate = (prefs?.mapAnimation ?? true) && prefs?.motion !== 'on'
  // The basemap preference has one value today ("osm"), which follows the theme.
  const provider: MapTileProvider = mode === 'dark' ? tiles.dark : tiles.light
  const boxRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<{ L: typeof Leaflet; map: LeafletMap; animate: boolean } | null>(null)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  // The map itself: rebuilt only when the animation setting changes (Leaflet
  // fixes its animations at construction).
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const life = { disposed: false }
    let created: LeafletMap | null = null
    let observer: ResizeObserver | null = null
    void (async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (life.disposed) return
      const m = L.map(box, {
        minZoom: 1,
        maxZoom: 10,
        zoomSnap: 0.25,
        // One world: no blank gutters past ±180°.
        maxBounds: [
          [-85, -180],
          [85, 180],
        ],
        maxBoundsViscosity: 1,
        // `map_animation` off means off everywhere Leaflet animates.
        zoomAnimation: animate,
        fadeAnimation: animate,
        markerZoomAnimation: animate,
      })
      created = m
      // The card settles at its width after the map is built, and changes it
      // when the sidebar or the window does; Leaflet measures only at
      // construction, so it is told (old dashboard #1565: a bare strip down
      // the right edge). An untouched map re-fits the world.
      let touched = false
      m.on('dragstart', () => (touched = true))
      const fit = () => {
        m.invalidateSize({ animate: false })
        if (!touched) m.setView([25, 10], worldZoom(box.clientWidth), { animate: false })
      }
      fit()
      m.on('zoomstart', (e) => {
        if ((e as unknown as { originalEvent?: unknown }).originalEvent !== undefined) touched = true
      })
      m.getContainer().addEventListener('wheel', () => (touched = true), { passive: true })
      observer = new ResizeObserver(fit)
      observer.observe(box)
      setMap({ L, map: m, animate })
    })()
    return () => {
      life.disposed = true
      observer?.disconnect()
      created?.remove()
      setMap(null)
    }
  }, [animate])

  // The tiles: swapped in place when the mode or the provider changes, so a
  // theme switch keeps the reader's view.
  useEffect(() => {
    if (!map) return
    const layer = map.L.tileLayer(provider.url, {
      attribution: provider.attribution,
      noWrap: true,
      // Only tiles that exist: none past ±180° or the poles.
      bounds: [
        [-85.0511, -180],
        [85.0511, 180],
      ],
      ...(provider.subdomains ? { subdomains: provider.subdomains } : {}),
      ...(provider.apiKey ? { apikey: provider.apiKey } : {}),
    }).addTo(map.map)
    // Light tiles serving dark mode are darkened in place (an inline style on
    // Leaflet's own pane, not a stylesheet).
    const pane = map.map.getPane('tilePane')
    if (pane) pane.style.filter = provider.filter ?? ''
    return () => {
      layer.remove()
    }
  }, [map, provider.url, provider.attribution, provider.subdomains, provider.apiKey, provider.filter])

  // The markers: redrawn for new data, the clustering preference, and each
  // zoom (clusters are measured on screen).
  // The animation setting is the map's own (it was built with it): read from
  // the map, not the prop, so a change of the setting never redraws onto the
  // map being torn down for it before its replacement exists (#317).
  useEffect(() => {
    if (!map) return
    const { L, map: m, animate: built } = map
    const layer = L.layerGroup().addTo(m)
    let frame = 0
    const draw = () => {
      cancelAnimationFrame(frame)
      layer.clearLayers()
      const markers = clusterMarkers(points, clustering, (lat, lon) => {
        const p = m.latLngToContainerPoint([lat, lon])
        return [p.x, p.y]
      })
      const pulsing = built ? busiest(markers) : new Set<string>()
      const rings: Array<{ ring: Leaflet.CircleMarker; r: number }> = []
      for (const marker of markers) {
        const label = markerLabel(marker)
        const isCluster = merged(marker)
        if (pulsing.has(marker.key)) {
          const ring = L.circleMarker([marker.lat, marker.lon], { radius: marker.radius, color: DATA_INK, weight: 2, fill: false, interactive: false, opacity: 0.6 })
          ring.addTo(layer)
          rings.push({ ring, r: marker.radius })
        }
        const circle = L.circleMarker([marker.lat, marker.lon], {
          radius: marker.radius,
          color: CARD,
          weight: isCluster ? 3 : 2,
          fillColor: DATA_INK,
          fillOpacity: isCluster ? 0.75 : 0.55,
        })
        circle.bindTooltip(isCluster ? `${label}. Click to zoom in.` : label, { direction: 'top', offset: [0, -marker.radius] })
        const go = () => {
          if (isCluster) {
            m.fitBounds(L.latLngBounds(marker.points.map((p) => [p.lat, p.lon] as [number, number])).pad(0.5), { maxZoom: Math.min(m.getMaxZoom(), m.getZoom() + 3), animate: built })
          } else void navigateRef.current({ href: markerHref(marker) })
        }
        circle.on('click', go)
        circle.on('add', () => {
          const el = circle.getElement()
          if (!el) return
          // Tabbable, announced, Enter/Space-activated, its tooltip shown on focus.
          el.setAttribute('tabindex', '0')
          el.setAttribute('role', isCluster ? 'button' : 'link')
          el.setAttribute('aria-label', isCluster ? `${label}. Zoom in` : label)
          el.addEventListener('keydown', (event: Event) => {
            if (!(event instanceof KeyboardEvent)) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              go()
            }
          })
          el.addEventListener('focus', () => circle.openTooltip())
          el.addEventListener('blur', () => circle.closeTooltip())
        })
        circle.addTo(layer)
      }
      // The busiest origins pulse: a ring that grows and fades every 2.4 s.
      if (rings.length) {
        const start = performance.now()
        const tick = (now: number) => {
          const phase = ((now - start) % 2400) / 2400
          for (const { ring, r } of rings) {
            ring.setRadius(r + phase * 14)
            ring.setStyle({ opacity: 0.6 * (1 - phase) })
          }
          frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
      }
    }
    draw()
    m.on('zoomend', draw)
    return () => {
      cancelAnimationFrame(frame)
      m.off('zoomend', draw)
      layer.remove()
    }
  }, [map, points, clustering])

  return (
    <div style={{ position: 'relative', height: HEIGHT, borderRadius: 8, overflow: 'hidden', isolation: 'isolate' }}>
      <div ref={boxRef} role="region" aria-label="Map of attack origins by country. Markers are links to their events." style={{ height: HEIGHT, background: 'var(--color-background-muted)' }} />
    </div>
  )
}
