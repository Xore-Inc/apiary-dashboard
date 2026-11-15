// Building blocks of the settings dialog, after the Astryx settings-dialog
// template. The template styles with StyleX; this project does not compile
// StyleX, so the few layout rules it needs ride on component props or inline
// styles, and the one container query (rows stacking together) is a
// ResizeObserver on the panel column instead.
import { Children, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { AspectRatio } from '@astryxdesign/core/AspectRatio'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid, GridSpan } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { ListItem } from '@astryxdesign/core/List'
import { SelectableCard } from '@astryxdesign/core/SelectableCard'
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { Theme } from '@astryxdesign/core/theme'
import { ChevronRightIcon, ComputerDesktopIcon, MagnifyingGlassIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { neutralTheme } from '#/themes/neutral/neutral-family'
import { PANELS, PANEL_GROUPS, SETTINGS, isAdminPanel, matchesSearch, panelOf, settingOf } from './registry'
import type { IconComponent, PaneId, Setting } from './registry'

/** The one width at which every row on a panel goes from two columns to one. */
const ROW_STACK_WIDTH = 480
/** The one width every selector and text input in a row takes. */
export const CONTROL_WIDTH = 192

// ---- Panel column: rows stack together on its width --------------------------

const StackedContext = createContext(false)

/** The column rows measure themselves against (the template's @container). */
export function PanelColumn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [stacked, setStacked] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setStacked(el.clientWidth > 0 && el.clientWidth < ROW_STACK_WIDTH)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref}>
      <StackedContext.Provider value={stacked}>
        <VStack gap={4}>{children}</VStack>
      </StackedContext.Provider>
    </div>
  )
}

// ---- Groups side by side: the administration page on a wide screen -----------

const GridContext = createContext(false)

/** A panel's groups side by side, each kept to a form's width so every label
 * stays next to its control; as many columns as fit, one on a narrow screen. */
export function SettingsGrid({ children }: { children: ReactNode }) {
  return (
    <GridContext.Provider value>
      <Grid columns={{ minWidth: 520, max: 3 }} gap={6} align="start">
        {children}
      </Grid>
    </GridContext.Provider>
  )
}

/** A panel's own line (its save bar, a note): the full width, under the
 * groups when they sit side by side. */
export function PanelRow({ children }: { children: ReactNode }) {
  return useContext(GridContext) ? <GridSpan columns="full">{children}</GridSpan> : children
}

/** One subject: a supporting heading over a muted card of rows. */
export function SettingsCard({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children)
  return (
    <VStack gap={1.5}>
      {title && (
        <Text type="supporting" weight="semibold" color="secondary">
          {title}
        </Text>
      )}
      <Card padding={0} width="100%" variant="muted">
        <VStack as="ul" role="list" gap={0}>
          {rows.map((row, index) => (
            <VStack key={index} as="li" gap={0}>
              {index > 0 && <Divider variant="subtle" />}
              {row}
            </VStack>
          ))}
        </VStack>
      </Card>
    </VStack>
  )
}

/** One setting: icon, name and explanation on the left, the control on the
 * right, or under it once the panel is narrow. Controls pass isLabelHidden;
 * the row is their visible label. Title, description and icon come from the
 * registry, so the row and its search result cannot disagree. */
export function SettingsRow({ setting, control, detail, accessory }: { setting: string; control?: ReactNode; detail?: ReactNode; accessory?: ReactNode }) {
  const stacked = useContext(StackedContext)
  const s = settingOf(setting)
  return (
    <VStack padding={4} gap={2} data-setting={s.id}>
      <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', gap: stacked ? 8 : 12 }}>
        <StackItem size="fill">
          <HStack gap={2} vAlign="start">
            <VStack paddingBlockStart={0.5}>
              <Icon icon={s.icon} size="sm" color="secondary" />
            </VStack>
            <VStack gap={0.5} style={{ maxWidth: stacked ? 'none' : 420 }}>
              <HStack gap={1.5} vAlign="center">
                <Text type="label">{s.title}</Text>
                {accessory}
              </HStack>
              <Text type="supporting" color="secondary">
                {s.description}
              </Text>
            </VStack>
          </HStack>
        </StackItem>
        {control !== undefined && <div style={{ flexShrink: 0 }}>{control}</div>}
      </div>
      {detail}
    </VStack>
  )
}

// ---- Theme choice, shown as what it does ---------------------------------------

function ThemePreviewCanvas({ mode }: { mode: 'light' | 'dark' }) {
  const bar = (width: string) => <div style={{ height: 4, width, borderRadius: 999, backgroundColor: 'var(--color-border-emphasized)' }} />
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <div style={{ height: '100%', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, backgroundColor: 'var(--color-background-muted)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {bar('66%')}
          {bar('50%')}
        </div>
        <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, backgroundColor: 'var(--color-background-surface)' }}>
          {bar('50%')}
          {bar('50%')}
          {bar('50%')}
        </div>
      </div>
    </Theme>
  )
}

const THEME_CHOICES: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: IconComponent }> = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: ComputerDesktopIcon },
]

/** Comparing the pictures is how people pick a theme, so the choice is cards. */
export function ThemeChoiceCards({ value, onChange, isDisabled = false }: { value: string; onChange: (value: 'light' | 'dark' | 'system') => void; isDisabled?: boolean }) {
  return (
    <Grid role="radiogroup" aria-label="Color theme" columns={{ minWidth: 96, max: 3 }} gap={2} maxWidth={480}>
      {THEME_CHOICES.map((choice) => {
        const isSelected = choice.value === value
        return (
          <SelectableCard key={choice.value} label={choice.label} isSelected={isSelected} isDisabled={isDisabled} padding={2} onChange={() => !isSelected && onChange(choice.value)}>
            <VStack gap={1.5}>
              <AspectRatio ratio={3 / 2}>
                <div aria-hidden style={{ height: '100%', overflow: 'hidden', borderRadius: 'var(--radius-element)', pointerEvents: 'none', display: 'flex' }}>
                  {choice.value === 'system' ? (
                    <>
                      <div style={{ flex: 1 }}>
                        <ThemePreviewCanvas mode="light" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <ThemePreviewCanvas mode="dark" />
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1 }}>
                      <ThemePreviewCanvas mode={choice.value} />
                    </div>
                  )}
                </div>
              </AspectRatio>
              <HStack gap={1} vAlign="center" hAlign="center">
                <Icon icon={choice.icon} size="sm" color="secondary" />
                <Text type="supporting" weight={isSelected ? 'semibold' : undefined}>
                  {choice.label}
                </Text>
              </HStack>
            </VStack>
          </SelectableCard>
        )
      })}
    </Grid>
  )
}

// ---- Search over single settings ----------------------------------------------

export function useSettingsSearch(onSelectPanel: (panel: PaneId) => void) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const needle = query.trim().toLowerCase()
  const isActive = needle.length > 0
  // Administration has its own page (/admin): the dialog searches only
  // what is personal.
  const results = useMemo(() => (isActive ? SETTINGS.filter((s) => !isAdminPanel(s.panel) && matchesSearch(s, needle)) : []), [isActive, needle])
  useEffect(() => setActiveIndex(0), [needle])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // The first Escape empties the box; only the second closes the dialog.
    if (event.key === 'Escape' && query) {
      event.preventDefault()
      event.stopPropagation()
      setQuery('')
      return
    }
    if (!isActive || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      onSelectPanel(results[activeIndex].panel)
    }
  }
  return { query, setQuery, isActive, results, activeIndex, setActiveIndex, onKeyDown, activeResultId: isActive && results.length ? `settings-search-result-${activeIndex}` : undefined }
}
export type SettingsSearch = ReturnType<typeof useSettingsSearch>

export function SettingsSearchInput({ search }: { search: SettingsSearch }) {
  return (
    <TextInput
      label="Search settings"
      isLabelHidden
      placeholder="Search settings"
      size="sm"
      width="100%"
      hasClear
      startIcon={MagnifyingGlassIcon}
      role="combobox"
      aria-autocomplete="list"
      aria-controls="settings-search-results"
      aria-expanded={search.isActive ? search.results.length > 0 : false}
      aria-activedescendant={search.activeResultId}
      value={search.query}
      onChange={search.setQuery}
      onKeyDown={search.onKeyDown}
    />
  )
}

export function SettingsSearchResults({ search, onSelect }: { search: SettingsSearch; onSelect: (setting: Setting) => void }) {
  if (search.results.length === 0) {
    return (
      <VStack id="settings-search-results" gap={0.5} padding={2}>
        <Text type="label">No settings found</Text>
        <Text type="supporting" color="secondary">
          Try theme, timezone, services or rollback.
        </Text>
      </VStack>
    )
  }
  return (
    <VStack as="ul" gap={0} id="settings-search-results" role="listbox" aria-label="Search results">
      {search.results.map((setting, index) => (
        <ListItem
          key={setting.id}
          id={`settings-search-result-${index}`}
          role="option"
          aria-selected={index === search.activeIndex}
          label={setting.title}
          description={`${panelOf(setting.panel).label} · ${setting.description}`}
          startContent={<Icon icon={setting.icon} size="sm" color="secondary" />}
          endContent={<Icon icon={ChevronRightIcon} size="sm" color="secondary" />}
          isSelected={index === search.activeIndex}
          onMouseEnter={() => search.setActiveIndex(index)}
          onClick={() => onSelect(setting)}
        />
      ))}
    </VStack>
  )
}

// ---- Shells --------------------------------------------------------------------

/** Title, search, and either the results or the grouped navigation. */
export function SettingsSideNav({ titleId, search, active, onSelect }: { titleId: string; search: SettingsSearch; active: PaneId; onSelect: (panel: PaneId) => void }) {
  return (
    <SideNav
      aria-label="Settings sections"
      style={{ flexShrink: 0 }}
      header={
        <HStack gap={2} vAlign="center" paddingInline={2} style={{ minHeight: 32 }}>
          <Heading level={4} id={titleId}>
            Settings
          </Heading>
        </HStack>
      }
      topContent={<SettingsSearchInput search={search} />}
    >
      {search.isActive ? (
        <SettingsSearchResults search={search} onSelect={(setting) => onSelect(setting.panel)} />
      ) : (
        PANEL_GROUPS.filter((group) => !group.panels.some((panel) => isAdminPanel(panel.id))).map((group) => (
          <SideNavSection key={group.label} title={`${group.label} · ${group.scope}`} style={{ paddingBlock: 'var(--spacing-2)' }}>
            {group.panels.map((panel) => (
              <SideNavItem key={panel.id} label={panel.label} icon={<Icon icon={panel.icon} size="sm" color="primary" />} isSelected={panel.id === active} onClick={() => onSelect(panel.id)} />
            ))}
          </SideNavSection>
        ))
      )}
    </SideNav>
  )
}

/** The panel's own heading; admin panels say who a change reaches. */
export function SettingsPanelHeading({ panel, status }: { panel: PaneId; status?: ReactNode }) {
  const p = panelOf(panel)
  return (
    <VStack gap={0.5}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Heading level={2}>{p.label}</Heading>
        {isAdminPanel(panel) ? <Token size="sm" color="orange" label="Affects everyone" /> : <Token size="sm" label="Only you" />}
        {status}
      </HStack>
      <Text type="supporting" color="secondary">
        {p.description}
      </Text>
    </VStack>
  )
}

/** The close control, pinned to the pane's top corner while the panel scrolls. */
export function PinnedClose({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 1, height: 0, display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
      <div style={{ display: 'flex', backgroundColor: 'var(--color-background-surface)', borderRadius: 'var(--radius-element)' }}>
        <IconButton label="Close" variant="ghost" size="sm" icon={<Icon icon="close" size="sm" />} onClick={onClose} />
      </div>
    </div>
  )
}

/** Phone width: the same navigation laid on its side as a strip of buttons. */
export function SettingsPanelTabs({ active, onSelect }: { active: PaneId; onSelect: (panel: PaneId) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the current section in view in the scrolling strip.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [active])
  return (
    <div ref={ref}>
      <HStack as="nav" aria-label="Settings sections" gap={1} wrap="nowrap" isScrollable paddingInline={3} paddingBlock={2}>
        {PANELS.filter((panel) => !isAdminPanel(panel.id)).map((panel) => (
          <Button key={panel.id} label={panel.label} icon={<Icon icon={panel.icon} size="sm" />} variant={panel.id === active ? 'secondary' : 'ghost'} size="sm" aria-current={panel.id === active ? 'page' : undefined} onClick={() => onSelect(panel.id)} />
        ))}
      </HStack>
    </div>
  )
}
