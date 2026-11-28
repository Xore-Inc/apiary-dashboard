/**
 * The app's one control for filtering by known values (Astryx ComplexSelector,
 * after its Tree Search block, flattened to a list). The popup opens under the
 * field with a search bar on top and every possible value below it, each with
 * how often it occurs; typing narrows the list. Several values can be picked
 * (`mode="multiple"`, the default) or exactly one (`mode="single"`, closes on
 * pick).
 *
 * Typing while the closed field has focus opens it with those characters
 * already in the search, so the field behaves like one you can type into.
 * With `allowCustom`, text that matches no value can be added as-is, for
 * filters that also take free text such as a signature substring.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { ComplexSelector } from '@astryxdesign/core/ComplexSelector'
import type { ComplexSelectorHandle } from '@astryxdesign/core/ComplexSelector'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { formatNumber } from '#/lib/format'

export type FilterOption = {
  value: string
  /** Shown instead of the value, e.g. a sensor's display name. */
  label?: string
  /** How many records carry the value, shown at the row's end. */
  count?: number
}

type FilterSelectProps = {
  label: string
  options: FilterOption[]
  value: string[]
  onChange: (value: string[]) => void
  mode?: 'multiple' | 'single'
  placeholder?: string
  description?: string
  isLabelHidden?: boolean
  size?: 'sm' | 'md' | 'lg'
  width?: number | string
  /** Lets typed text that matches no value be added as a value of its own. */
  allowCustom?: boolean
  status?: { type: 'error' | 'warning' | 'success'; message?: string }
  /** Search on the server: `options` are the matches for the text last given
   * to `onSearch`, and the list does not narrow them again in the browser. */
  onSearch?: (text: string) => void
  searchHint?: string
}

// Long lists stay responsive; the search narrows past this.
const MAX_ROWS = 200

const labelOf = (options: FilterOption[], value: string) => options.find((o) => o.value === value)?.label ?? value

/** "cowrie, dionaea" or "cowrie, +2". */
function summary(options: FilterOption[], value: string[]): string | undefined {
  if (value.length === 0) return undefined
  const labels = value.map((v) => labelOf(options, v))
  return labels.length <= 2 ? labels.join(', ') : `${labels[0]}, +${labels.length - 1}`
}

type FilterListProps = { options: FilterOption[]; value: string[]; onChange: (value: string[]) => void; close: () => void; mode: 'multiple' | 'single'; allowCustom: boolean; initialQuery: string; label: string; onSearch?: (text: string) => void; searchHint?: string }

function FilterList({ options, value, onChange, close, mode, allowCustom, initialQuery, label, onSearch, searchHint }: FilterListProps) {
  const [query, setQuery] = useState(initialQuery)
  const serverSearch = Boolean(onSearch)
  const needle = query.trim().toLowerCase()
  // The parent learns the text as the list opens, and forgets it as the list
  // closes. Refs keep this to mount and unmount; later keystrokes reach the
  // parent from the input's onChange.
  const searchRef = useRef(onSearch)
  searchRef.current = onSearch
  const openedWith = useRef(initialQuery)
  useEffect(() => {
    searchRef.current?.(openedWith.current)
    return () => searchRef.current?.('')
  }, [])
  // Selected values first, so what is on stays in view while narrowing.
  const matches = useMemo(() => {
    const hits = serverSearch ? options : options.filter((o) => !needle || o.value.toLowerCase().includes(needle) || (o.label ?? '').toLowerCase().includes(needle))
    return [...hits.filter((o) => value.includes(o.value)), ...hits.filter((o) => !value.includes(o.value))]
  }, [options, needle, value, serverSearch])
  const custom = allowCustom && !serverSearch && needle && !options.some((o) => o.value.toLowerCase() === needle) && !value.includes(query.trim()) ? query.trim() : undefined
  const extra = value.filter((v) => !options.some((o) => o.value === v))

  const toggle = (v: string) => {
    if (mode === 'single') {
      onChange(value[0] === v ? [] : [v])
      close()
      return
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
    <VStack gap={2} style={{ width: '100%', minWidth: 320 }}>
      <TextInput
        label={`Search ${label.toLowerCase()}`}
        isLabelHidden
        size="sm"
        hasAutoFocus
        hasClear
        placeholder={searchHint ?? `Search ${formatNumber(options.length)} values`}
        value={query}
        onChange={(text) => {
          setQuery(text)
          onSearch?.(text)
        }}
        onEnter={() => {
          if (custom) toggle(custom)
          else if (matches.length === 1) toggle(matches[0].value)
        }}
      />
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Text type="supporting">{serverSearch ? (needle ? `${formatNumber(matches.length)} found` : 'Type to search the whole inventory') : needle ? `${formatNumber(matches.length)} of ${formatNumber(options.length)} match` : `${formatNumber(options.length)} values`}</Text>
        </StackItem>
        {mode === 'multiple' && needle && matches.length > 0 && <Button label="Select matches" size="sm" variant="ghost" onClick={() => onChange([...new Set([...value, ...matches.map((m) => m.value)])])} />}
        {value.length > 0 && <Button label="Clear" size="sm" variant="ghost" onClick={() => onChange([])} />}
      </HStack>
      {custom && <Button label={`Add “${custom}”`} size="sm" variant="secondary" onClick={() => toggle(custom)} />}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {matches.length + extra.length > 0 && (
          <CheckboxList
            label={`${label} values`}
            isLabelHidden
            density="compact"
            value={value}
            onChange={(next) => {
              // One row changes per click: find it and toggle, so single mode
              // can replace instead of add.
              const changed = next.find((v) => !value.includes(v)) ?? value.find((v) => !next.includes(v))
              if (changed) toggle(changed)
            }}
          >
            {extra.map((v) => (
              <CheckboxListItem key={v} value={v} label={v} endContent={<Text type="supporting">typed</Text>} />
            ))}
            {matches.slice(0, MAX_ROWS).map((o) => (
              <CheckboxListItem key={o.value} value={o.value} label={o.label ?? o.value} endContent={o.count === undefined ? undefined : <Text type="supporting">{formatNumber(o.count)}</Text>} />
            ))}
          </CheckboxList>
        )}
        {matches.length === 0 && !custom && <Text type="supporting">No value matches “{query}”.</Text>}
        {matches.length > MAX_ROWS && <Text type="supporting">{`Showing ${MAX_ROWS} of ${formatNumber(matches.length)}; type to narrow.`}</Text>}
      </div>
    </VStack>
  )
}


export function FilterSelect({ label, options, value, onChange, mode = 'multiple', placeholder, description, isLabelHidden, size = 'md', width, allowCustom = false, status, onSearch, searchHint }: FilterSelectProps) {
  const handle = useRef<ComplexSelectorHandle>(null)
  const triggerLabel = summary(options, value)
  const triggerText = triggerLabel ?? placeholder ?? (mode === 'single' ? 'Pick one' : 'Any')
  // A ref, not state: the popup mounts in the same tick as the key press and
  // must read the key then, not after a re-render.
  const seed = useRef('')

  // A printable key on the closed trigger opens it with that key searched.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (handle.current?.isOpen() || event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey || event.key === ' ') return
    event.preventDefault()
    seed.current = event.key
    handle.current?.open()
  }

  return (
    <div onKeyDown={onKeyDown} style={{ width }}>
      <ComplexSelector
        label={isLabelHidden ? `${label}: ${triggerText}` : label}
        isLabelHidden={isLabelHidden}
        description={description}
        value={value}
        onChange={onChange}
        size={size}
        width={width}
        status={status}
        placement="below"
        alignment="start"
        handleRef={handle}
        onOpenChange={(open) => {
          if (!open) seed.current = ''
        }}
        triggerLabel={triggerLabel}
        placeholder={triggerText}
      >
        {(current, commit, close, state) =>
          // Only while open: the list can be long, and each opening starts a
          // fresh search from whatever key opened it.
          state.isOpen ? <FilterList options={options} value={current} onChange={commit} close={close} mode={mode} allowCustom={allowCustom} initialQuery={seed.current} label={label} onSearch={onSearch} searchHint={searchHint} /> : null
        }
      </ComplexSelector>
    </div>
  )
}

/** Values kept in one search param as a comma list (?sensor=a,b), so single
 * deep links like ?sensor=a keep working. */
export const listParam = (raw: unknown): string[] => (typeof raw === 'string' && raw ? raw.split(',').filter(Boolean) : typeof raw === 'number' ? [String(raw)] : [])
export const toParam = (values: string[]): string | undefined => (values.length ? values.join(',') : undefined)
/** Like toParam, but a single number stays a number, so the URL reads
 * ?port=22 rather than the router's quoted ?port="22". */
export const toNumericParam = (values: string[]): string | number | undefined => (values.length === 1 && /^\d+$/.test(values[0]) ? Number(values[0]) : toParam(values))
