import { useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Icon } from '@astryxdesign/core/Icon'
import type { IconType } from '@astryxdesign/core/Icon'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSubMenu } from '@astryxdesign/core/DropdownMenu'
import { TopNavItem, TopNavMenu } from '@astryxdesign/core/TopNav'
import { ArrowRightIcon, CheckIcon } from '@heroicons/react/24/outline'
import { useHydrated, useRouter, useRouterState } from '@tanstack/react-router'
import { formatNumber } from '#/lib/format'

export type ViewTab = {
  id: string
  label: string
  /** Shown as "Label (n)" once the page's data has loaded. */
  count?: number
  /** Sub-sections: the tab becomes a menu in the top bar listing them. */
  sections?: ReadonlyArray<ViewTabSection>
  /** A tab that is another page: it links there instead of switching this
   * page's view (families of sibling pages share one tab set). */
  href?: string
}

export type ViewTabSection = { id: string; label: string; icon?: IconType; href?: string }

type ViewTabsInput = {
  params: Record<string, string>
  search: Record<string, unknown>
  pathname: string
  /** The declaring route's loader data; undefined while it is still loading. */
  data: unknown
}

export type ViewTabsModel = {
  label: string
  tabs: ViewTab[]
  value: string
  /** The active tab's current sub-section, when it has sections. */
  section?: string
  /** Where choosing a tab (or one of its sections) goes: a path, or a change
   * to the search params. */
  href?: (id: string, section?: string) => string
  search?: (id: string, section?: string) => Record<string, unknown>
}

/** Declared on a route as `staticData.viewTabs`. A pure function of the
 * route's own state, so the top bar can draw the tabs during server render
 * and the moment a navigation starts, before the page's data arrives. */
export type ViewTabsFn = (input: ViewTabsInput) => ViewTabsModel

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    viewTabs?: ViewTabsFn
  }
}

/** Tabs kept in one search param, e.g. `?view=`; the first tab is the
 * default and is left out of the URL. A tab's sections live in
 * `sectionParam` (e.g. `?section=`), again with the first as default. */
export function searchTabs({ label, param, sectionParam = 'section', tabs }: { label: string; param: string; sectionParam?: string; tabs: (data: unknown, search: Record<string, unknown>) => ViewTab[] }): ViewTabsFn {
  return ({ search, data }) => {
    const list = tabs(data, search)
    const current = typeof search[param] === 'string' ? search[param] : undefined
    const value = list.some((tab) => tab.id === current) ? current! : list[0].id
    const sections = list.find((tab) => tab.id === value)?.sections
    const rawSection = search[sectionParam]
    return {
      label,
      tabs: list,
      value,
      section: sections ? (sections.find((x) => x.id === rawSection)?.id ?? sections[0].id) : undefined,
      search: (id, section) => {
        const own = list.find((tab) => tab.id === id)?.sections
        return { [param]: id === list[0].id ? undefined : id, [sectionParam]: own && section && section !== own[0].id ? section : undefined }
      },
    }
  }
}

/** The section a search value selects within a tab's sections, falling back
 * to the first; for pages that render the sections their tab declares. */
export const sectionOf = (sections: ReadonlyArray<{ id: string }>, value: unknown) => sections.find((s) => s.id === value)?.id ?? sections[0].id

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/** Tabs as route segments under an entity's base path (epic #25): the first
 * tab is the base path itself, the rest are `<base>/<id>`. A tab's sections
 * live in `?section=`, the first one the default and left out of the URL. */
/** `aliases` maps an old tab path to the tab it was folded into (a route
 * that only redirects there). A browser's first load renders the old path's
 * skeleton on the server (lib/pageSsr) while the client has already
 * redirected, so both must select the same tab or hydration fails (#299). */
export function entityTabs({ label, basePath, tabs, aliases = {} }: { label: string; basePath: (params: Record<string, string>) => string; tabs: (data: unknown) => ViewTab[]; aliases?: Record<string, string> }): ViewTabsFn {
  return ({ params, pathname, data, search }) => {
    const base = basePath(params)
    const list = tabs(data)
    const path = safeDecode(pathname)
    const decodedBase = safeDecode(base)
    const rest = path.startsWith(decodedBase) ? path.slice(decodedBase.length).replace(/^\//, '') : ''
    const segment = rest.split('/')[0]
    const value = list.find((tab) => tab.id === (aliases[segment] ?? segment))?.id ?? list[0].id
    const sections = list.find((tab) => tab.id === value)?.sections
    return {
      label,
      tabs: list,
      value,
      section: sections ? sectionOf(sections, search.section) : undefined,
      href: (id, section) => {
        const own = list.find((tab) => tab.id === id)?.sections
        const target = id === list[0].id ? base : `${base}/${id}`
        return own && section && section !== own[0].id ? `${target}?section=${encodeURIComponent(section)}` : target
      },
    }
  }
}

/** The current page's tabs: those of the deepest route that declares them,
 * or null when it has fewer than two (nothing to switch between). */
export function useViewTabs(): ViewTabsModel | null {
  const router = useRouter()
  const location = useRouterState({ select: (state) => state.location })
  const committed = useRouterState({ select: (state) => state.matches })
  // The server paints a page's skeleton without its data (lib/pageSsr), so
  // counts wait for hydration too, or the first render would not match.
  const hydrated = useHydrated()
  const [routes, params] = router.getMatchedRoutes(location.pathname)
  const route = [...routes].reverse().find((r) => r.options.staticData?.viewTabs)
  if (!route) return null
  // Counts come from the route's loader data once that exact match loaded.
  const match = committed.find((m) => m.routeId === route.id && JSON.stringify(m.params) === JSON.stringify(pick(params, m.params)))
  const model = route.options.staticData!.viewTabs!({
    params,
    search: location.search,
    pathname: location.pathname,
    // Under the "Loading forever" mock scenario the page stays on its
    // skeleton (lib/pending), so its counts wait too.
    data: hydrated && match?.status === 'success' && (location.search as Record<string, unknown>).mock !== 'loading' ? match.loaderData : undefined,
  })
  return model.tabs.length < 2 ? null : model
}

/** The current page's tabs with where each entry goes, and a click handler
 * that routes in-app while leaving new-tab clicks to the browser. */
export function useViewTabLinks() {
  const router = useRouter()
  const location = useRouterState({ select: (state) => state.location })
  const model = useViewTabs()
  if (!model) return null
  // Real hrefs, so every entry is a link (new tab, copy link, prefetch).
  // A tab or section that is another page links there; the rest switch
  // this page's view.
  const hrefOf = (id: string, section?: string) => {
    const tab = model.tabs.find((t) => t.id === id)
    return (section ? tab?.sections?.find((s) => s.id === section)?.href : tab?.href) ?? viewHref(id, section)
  }
  const viewHref = (id: string, section?: string) =>
    model.href
      ? model.href(id, section)
      : router.buildLocation({ to: location.pathname, search: (prev: Record<string, unknown>) => ({ ...prev, ...model.search?.(id, section) }) } as never).href
  // Menu items render as plain anchors; route their clicks client-side, but
  // leave modified clicks (new tab/window) to the browser.
  const go = (href: string) => (event?: MouseEvent) => {
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)) return
    event?.preventDefault()
    void router.navigate({ href })
  }
  return { model, hrefOf, go }
}

/** The tabs of the deepest route that declares them, drawn as top-bar nav
 * items: a plain tab is a link, a tab with sections is a hover menu listing
 * them (after the Astryx TopNav "Multiple Dropdowns" block). The bar matches
 * the current location itself, and the location switches as soon as a
 * navigation starts, so the tabs show up before the new page's data arrives
 * (and are part of the server render). */
export function ViewTabsBar() {
  const links = useViewTabLinks()
  return links ? <TabStrip {...links} /> : null
}


/** The same tabs as one "Views" menu, for screens too narrow for a strip:
 * the button names the current view, and a tab with sections opens them
 * as a submenu, so the layering stays the same. */
export function ViewTabsMenu() {
  const links = useViewTabLinks()
  if (!links) return null
  const { model, hrefOf, go } = links
  const active = model.tabs.find((tab) => tab.id === model.value) ?? model.tabs[0]
  const current = <Icon icon={CheckIcon} size="sm" />
  return (
    <DropdownMenu placement="below" alignment="start" menuWidth={260} button={{ label: labelOf(active), size: 'sm', variant: 'secondary', tooltip: model.label }}>
      {model.tabs.map((tab) =>
        tab.sections?.length ? (
          <DropdownMenuSubMenu key={tab.id} label={labelOf(tab)}>
            {tab.sections.map((section) => (
              <DropdownMenuItem
                key={section.id}
                label={section.label}
                icon={section.icon}
                endContent={tab.id === model.value && section.id === model.section ? current : undefined}
                onClick={() => go(hrefOf(tab.id, section.id))()}
              />
            ))}
          </DropdownMenuSubMenu>
        ) : (
          <DropdownMenuItem key={tab.id} label={labelOf(tab)} endContent={tab.id === model.value ? current : undefined} onClick={() => go(hrefOf(tab.id))()} />
        ),
      )}
    </DropdownMenu>
  )
}

// Keeps each entry on one line at its natural width.
const ITEM_STYLE = { flexShrink: 0, whiteSpace: 'nowrap' } as const
// TopNavMenu has no selected state; this is TopNavItem's selected fill.
const ACTIVE_STYLE = { ...ITEM_STYLE, backgroundColor: 'var(--color-neutral)' } as const
// Room kept for the "More" menu when tabs overflow.
const MORE_WIDTH = 96
// Space kept clear before the top bar's end controls.
const END_GAP = 16

/** The top bar's end controls; the strip stops short of them. */
export const TOP_NAV_END_ID = 'top-nav-end'

const labelOf = (tab: ViewTab) => (tab.count === undefined ? tab.label : `${tab.label} (${formatNumber(tab.count)})`)

/** The entries, as many as fit; the rest go into a trailing "More" menu. */
function TabStrip({ model, hrefOf, go }: { model: ViewTabsModel; hrefOf: (id: string, section?: string) => string; go: (href: string) => (event?: MouseEvent) => void }) {
  // TopNavMenu types onClick without the event, but passes it.
  const item = (title: string, href: string, icon: IconType, description?: string) => ({ title, href, description, icon: <Icon icon={icon} size="sm" />, onClick: go(href) })
  const stripRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  // Indexes of the tabs shown in the bar; the rest go into More.
  const [visible, setVisible] = useState<number[] | null>(null)
  const activeIndex = Math.max(0, model.tabs.findIndex((tab) => tab.id === model.value))
  const labels = model.tabs.map(labelOf).join('|')

  // Measure every entry in an invisible copy, then keep what fits.
  useLayoutEffect(() => {
    const strip = stripRef.current
    const measure = measureRef.current
    if (!strip || !measure) return
    const compute = () => {
      const widths = [...measure.children].map((child) => child.getBoundingClientRect().width + 2)
      // Up to the end controls when they are on the same row, else the
      // strip's own box.
      const end = document.getElementById(TOP_NAV_END_ID)?.getBoundingClientRect()
      const start = strip.getBoundingClientRect()
      // All in rendered px (the large-screen zoom applies to every rect
      // alike; clientWidth would not have it).
      const available = end && end.left > start.left ? Math.min(start.width, end.left - start.left - END_GAP) : start.width
      // No layout (tests, before first paint): show everything.
      if (available === 0 || widths.reduce((a, b) => a + b, 0) <= available) return setVisible(null)
      // The current tab always stays in the bar, so where you are is never
      // hidden in More; the others fill the room left, in order.
      let used = MORE_WIDTH + widths[activeIndex]
      const keep = new Set([activeIndex])
      for (const [i, width] of widths.entries()) {
        if (i === activeIndex) continue
        if (used + width > available) break
        used += width
        keep.add(i)
      }
      setVisible([...keep].sort((a, b) => a - b))
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(strip)
    // The copy grows when the web font replaces the fallback it was first
    // measured in (and when counts arrive): measure again, or tabs overflow
    // under the end controls.
    observer.observe(measure)
    const end = document.getElementById(TOP_NAV_END_ID)
    if (end) observer.observe(end)
    window.addEventListener('resize', compute)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [labels, activeIndex])

  const entry = (tab: ViewTab) => {
    const isActive = tab.id === model.value
    if (!tab.sections?.length) return <TopNavItem key={tab.id} label={labelOf(tab)} href={hrefOf(tab.id)} isSelected={isActive} style={ITEM_STYLE} />
    return (
      <TopNavMenu
        key={tab.id}
        label={labelOf(tab)}
        aria-current={isActive ? 'page' : undefined}
        style={isActive ? ACTIVE_STYLE : ITEM_STYLE}
        items={tab.sections.map((section) => item(section.label, hrefOf(tab.id, section.id), section.icon ?? ArrowRightIcon, isActive && section.id === model.section ? 'Showing now' : undefined))}
      />
    )
  }
  // `visible` was measured for the tabs on screen; after a navigation to a
  // page with other tabs it is stale until measured again, so only indexes
  // that exist in this page's tabs count.
  const fits = visible?.filter((i) => i < model.tabs.length)
  const shown = fits ? fits.map((i) => model.tabs[i]) : model.tabs
  const rest = fits ? model.tabs.filter((_, i) => !fits.includes(i)) : []
  const restActive = rest.some((tab) => tab.id === model.value)

  return (
    <div ref={stripRef} style={{ position: 'relative', minWidth: 0, width: '100%' }}>
      <nav aria-label={model.label} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {shown.map(entry)}
        {rest.length > 0 && (
          <TopNavMenu
            label="More"
            aria-current={restActive ? 'page' : undefined}
            style={restActive ? ACTIVE_STYLE : ITEM_STYLE}
            items={rest.flatMap((tab) =>
              tab.sections?.length
                ? // A dropdown tab keeps its layering: its sections, each naming the tab it sits under in
                  // its title (TopNavMenu keys items by title, and Sandbox and Ghidra both have "Raw").
                  tab.sections.map((section) => item(`${tab.label} · ${section.label}`, hrefOf(tab.id, section.id), section.icon ?? ArrowRightIcon, tab.id === model.value && section.id === model.section ? 'Showing now' : undefined))
                : [item(labelOf(tab), hrefOf(tab.id), ArrowRightIcon, tab.id === model.value ? 'Showing now' : undefined)],
            )}
          />
        )}
      </nav>
      {/* The measuring copy: same entries, never seen or reachable. */}
      <div ref={measureRef} aria-hidden inert style={{ position: 'absolute', visibility: 'hidden', display: 'flex', gap: 2, top: 0, left: 0, pointerEvents: 'none' }}>
        {/* One wrapper per tab: a menu also renders its (empty) popover, and
            renders nothing at all without items, so it gets a stand-in. */}
        {model.tabs.map((tab) => (
          <span key={tab.id} style={{ display: 'inline-flex', flexShrink: 0 }}>
            {tab.sections?.length ? <TopNavMenu label={labelOf(tab)} items={[{ title: tab.label }]} style={ITEM_STYLE} /> : <TopNavItem label={labelOf(tab)} style={ITEM_STYLE} />}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Tabs for a family of sibling pages: every tab (or its sections) links to
 * its own page, and `current` says which one this page is. */
export function linkTabs({ label, tabs, current }: { label: string; tabs: (data: unknown) => ViewTab[]; current: (input: ViewTabsInput) => { value: string; section?: string } }): ViewTabsFn {
  return (input) => {
    const list = tabs(input.data)
    const { value, section } = current(input)
    return {
      label,
      tabs: list,
      value,
      section,
      href: (id, sectionId) => {
        const tab = list.find((t) => t.id === id)
        const own = tab?.sections?.find((s) => s.id === sectionId) ?? tab?.sections?.[0]
        return own?.href ?? tab?.href ?? '/'
      },
    }
  }
}

/** The subset of `all` with the keys of `like` (a match's own params). */
function pick(all: Record<string, string>, like: object): Record<string, string> {
  return Object.fromEntries(Object.keys(like).map((key) => [key, all[key]]))
}
