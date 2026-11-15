import { AlertBell } from './AlertBell'
import { LiveBadge } from './LiveBadge'
import { MockScenarioMenu } from './MockScenarioMenu'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { Kbd } from '@astryxdesign/core/Kbd'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Divider } from '@astryxdesign/core/Divider'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { TOP_NAV_END_ID, ViewTabsBar, ViewTabsMenu, useViewTabs } from './ViewTabs'
import { useAppShellMobile } from '@astryxdesign/core/AppShell'
import { Selector } from '@astryxdesign/core/Selector'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { DEFAULT_RANGE, RANGES, isRange, rangeLabel } from '#/lib/range'
import type { RangeId } from '#/lib/range'
import type { ShellConfig } from '#/data/types'
import { usePreferences } from '#/lib/prefs'

// Phones get a second row for the page's views and the time range. Which
// row shows them is decided in CSS (styles.css, 640 px), so the server's
// render is already right before any script runs.

/** The app-wide time range; every page reads it from ?range=. Compact
 * shows the short names (24h, 7d). */
export function RangePicker({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate()
  const raw = useSearch({ strict: false, select: (search: Record<string, unknown>) => (typeof search.range === 'string' ? search.range : undefined) })
  const range: RangeId = isRange(raw) ? raw : DEFAULT_RANGE
  return (
    <Selector
      label={`Time range: ${compact ? range : rangeLabel(range)}`}
      isLabelHidden
      size={compact ? 'md' : 'sm'}
      value={range}
      onChange={(value) =>
        void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, range: value === DEFAULT_RANGE || !isRange(value) ? undefined : value }) })
      }
      options={RANGES.map((r) => ({ value: r.id, label: compact ? r.id : r.label }))}
    />
  )
}

/** The APIARY emblem, from the brand's own assets (APIARY branding/assets/
 * logo): the compact mark, as the brand asks below 64 px, in its light or
 * dark artwork. A chosen theme picks it on the server; the system theme lets
 * the browser pick before it paints. The heading beside it names the link. */
const MARK = { light: '/brand/apiary-compact-mark-for-light.png', dark: '/brand/apiary-compact-mark-for-dark.png' }

function BrandMark() {
  const theme = usePreferences()?.theme
  const mark = (src: string) => <img src={src} alt="" width={32} height={32} />
  if (theme === 'light' || theme === 'dark') return mark(MARK[theme])
  return (
    <picture>
      <source srcSet={MARK.dark} media="(prefers-color-scheme: dark)" />
      {mark(MARK.light)}
    </picture>
  )
}

export function ShellTopNav({ config, mockScenarios = false, onOpenPalette }: { config: ShellConfig; mockScenarios?: boolean; onOpenPalette: () => void }) {
  // A page with tabs gives the bar to them: the sidebar already says where
  // you are, and the tabs say which view.
  const hasTabs = useViewTabs() !== null
  // In the drawer layout the tabs become one Views menu and the controls
  // their icons; on a phone the views and range move to a row of their own.
  const { isMobile } = useAppShellMobile()
  return (
    <TopNav
      label="Page header"
      heading={
        <TopNavHeading
          logo={<BrandMark />}
          heading={config.presentation.appName}
          subheading={isMobile ? undefined : config.presentation.productLabel}
          headingHref="/"
        />
      }
      startContent={
        isMobile ? undefined : (
        <HStack gap={4} vAlign="center" className="apiary-desktop-start">
          {hasTabs && (
            // TopNav sizes its start slot to content, so the tabs get a fixed
            // budget: what the heading and end controls leave (the strip stops
            // at the end controls; tabs past them go into a More menu). Viewport
            // units are zoomed on large screens, so the zoom is divided out.
            // Where a page sits is its own header's trail (PageFrame).
            <StackItem size="fill" style={{ width: 'max(240px, calc(100vw / var(--ui-zoom, 1) - 730px))' }}>
              <ViewTabsBar />
            </StackItem>
          )}
        </HStack>
        )
      }
      endContent={
        // The tab strip measures up to here, so tabs never run under it.
        <HStack id={TOP_NAV_END_ID} gap={2} vAlign="center">
          {isMobile && (
            <span className="apiary-not-phone">
              <ViewTabsMenu />
            </span>
          )}
          {/* On a phone the range moves to a row of its own: the top bar has
              no room for it beside the controls. */}
          <span className="apiary-not-phone">
            <RangePicker compact={isMobile} />
          </span>
          {isMobile ? (
            <Button label="Search" variant="secondary" size="md" isIconOnly tooltip="Search" icon={<Icon icon={MagnifyingGlassIcon} size="sm" />} onClick={onOpenPalette} />
          ) : (
            <HStack gap={1.5} vAlign="center">
              <Button label="Search" variant="secondary" size="sm" icon={<Icon icon={MagnifyingGlassIcon} size="sm" />} onClick={onOpenPalette} />
              <Kbd keys="mod+k" />
            </HStack>
          )}
          {mockScenarios && <MockScenarioMenu compact={isMobile} />}
          <AlertBell compact={isMobile} />
          <LiveBadge compact={isMobile} />
        </HStack>
      }
    />
  )
}

/** A phone's second row: the page's views (when it has any) and the time
 * range, under the top bar where there is room for them. */
export function PhoneViewBar() {
  return (
    <VStack gap={0} className="apiary-phone-only">
      <HStack gap={2} vAlign="center" hAlign="between" paddingInline={4} paddingBlock={2}>
        <ViewTabsMenu />
        <StackItem size="fill" />
        <RangePicker compact />
      </HStack>
      <Divider />
    </VStack>
  )
}
