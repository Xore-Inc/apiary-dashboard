import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { Pagination } from '@astryxdesign/core/Pagination'
import { SkeletonTable } from './SkeletonTable'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Link } from '@astryxdesign/core/Link'
import { InboxIcon } from '@heroicons/react/24/outline'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { formatNumber } from '#/lib/format'
import { saveListContext } from '#/lib/listContext'
import { useRowActivation } from './useRowActivation'
import { PageFrame } from './PageFrame'
import { tableDensity, usePreferences } from '#/lib/prefs'

/** Loading rows: a screenful, not the whole page size (the page-weight gate). */
const SKELETON_ROWS = 15

type RecordListProps<T extends Record<string, unknown>> = {
  title: string
  description?: string
  /** Header chips/actions to the right of the title. */
  actions?: ReactNode
  /** KPI tiles, notes, aggregation cards: everything above the table. */
  summary?: ReactNode
  /** Filter row directly above the table. */
  toolbar?: ReactNode
  /** Undefined while the page's data loads: the table keeps its columns
   * and shows a full page of skeleton rows. */
  rows: T[] | undefined
  columns: TableColumn<T>[]
  getId: (row: T) => string
  /** The row's entity page: a row opens it (epic #25). */
  getHref: (row: T) => string
  /** The column whose cell is the row's link (the first by default); false
   * where that cell already holds links of its own. */
  linkColumn?: string | false
  emptyState: { title: string; description: string }
  pageSize?: number
  /** Server-paged: `rows` is one page of `total` matches, starting at
   * `offset`. The page lives in `?page=`, so the loader fetches only it;
   * without this, `rows` is the whole list and pages are cut here. */
  paging?: { total: number; offset: number }
}

/** A store-backed record page: summary band, filter row, and a paged
 * full-width table whose rows open their entity page. */
export function RecordList<T extends Record<string, unknown>>({
  title,
  description,
  actions,
  summary,
  toolbar,
  rows,
  columns,
  getId,
  getHref,
  linkColumn,
  emptyState,
  pageSize: pageSizeProp,
  paging,
}: RecordListProps<T>) {
  const prefs = usePreferences()
  const pageSize = pageSizeProp ?? prefs?.rowsPerPage ?? 25
  const navigate = useNavigate()
  const location = useLocation({ select: (l) => ({ href: l.href, searchStr: l.searchStr }) })
  const listHref = location.href
  // The page number is remembered per list address, so Back from an entity
  // page lands on the same page of the same filtered list.
  const pageKey = `apiary.page:${listHref}`
  const [page, setPageState] = useState(1)
  useEffect(() => {
    const saved = Number(sessionStorage.getItem(pageKey))
    setPageState(Number.isInteger(saved) && saved > 0 ? saved : 1)
  }, [pageKey])
  const setPage = (next: number) => {
    setPageState(next)
    try {
      sessionStorage.setItem(pageKey, String(next))
    } catch {
      // Unavailable storage only costs the remembered page.
    }
  }

  const total = paging ? paging.total : (rows?.length ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  // A page past the end (the filters now match fewer rows): go to the last.
  const pastTheEnd = rows !== undefined && paging !== undefined && rows.length === 0 && total > 0
  useEffect(() => {
    if (pastTheEnd) void navigate({ to: '.', search: ((prev: Record<string, unknown>) => ({ ...prev, page: pageCount > 1 ? pageCount : undefined })) as never, replace: true })
  }, [pastTheEnd, pageCount, navigate])
  // A new tab (or a copied link) starts without router state, so a row's
  // address carries the app-wide range.
  const range = new URLSearchParams(location.searchStr).get('range')
  const addressOf = (row: T) => {
    const href = getHref(row)
    return range ? `${href}${href.includes('?') ? '&' : '?'}range=${range}` : href
  }
  const openRow = (row: T, { newTab: modified }: { newTab: boolean }) => {
    const href = getHref(row)
    // With "open detail pages in a new tab", a plain click opens one and a
    // modified click stays here: the modifier always means "the other way".
    const newTab = prefs?.openDetailsInNewTab ? !modified : modified
    if (newTab) {
      window.open(addressOf(row), '_blank', 'noopener')
      return
    }
    // Prev/next steps through the rows at hand: the whole list, or this page.
    saveListContext({ listHref, listTitle: title, hrefs: (rows ?? []).map(getHref) })
    void navigate({ href })
  }
  // The link cell is the row's real link: the keyboard, a screen reader,
  // middle-click and "copy link" all reach the entity through it. A plain
  // click on it, or anywhere on the row, still opens the row the app's way.
  const linkKey = linkColumn === false ? undefined : (linkColumn ?? columns[0]?.key)
  // Rows preload on hover or focus (the router's intent default), not as
  // they scroll into view: on production a list render then fired five
  // entity reads at once, and the backend's limiter shed some (503,
  // #309 v0.1.19).
  const linkedColumns = columns.map((column) =>
    column.key !== linkKey
      ? column
      : {
          ...column,
          renderCell: (row: T) => (
            <Link
              href={addressOf(row)}
              onClick={(event) => {
                if (event.button !== 0 || event.shiftKey || event.altKey) return
                event.preventDefault()
                openRow(row, { newTab: event.metaKey || event.ctrlKey })
              }}
            >
              {column.renderCell ? column.renderCell(row) : String(row[column.key] ?? '')}
            </Link>
          ),
        },
  )
  const activation = useRowActivation<T>({ onActivate: openRow, focusable: linkKey === undefined })

  // Every hook runs before this: the same list goes from skeleton to rows
  // (after hydration).
  if (!rows) return <ListFrame title={title} description={description} actions={actions} summary={summary} toolbar={toolbar} body={<SkeletonTable columns={columns} rows={Math.min(pageSize, SKELETON_ROWS)} density={tableDensity(prefs)} withCount />} />
  const currentPage = paging ? Math.floor(paging.offset / pageSize) + 1 : Math.min(page, pageCount)
  const visible = paging ? rows : rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const goToPage = (next: number) => {
    if (!paging) return setPage(next)
    // Any list route may be paged, so the typed routes do not all know ?page=.
    void navigate({ to: '.', search: ((prev: Record<string, unknown>) => ({ ...prev, page: next > 1 ? next : undefined })) as never })
  }

  return (
    <ListFrame
      title={title}
      description={description}
      actions={actions}
      summary={summary}
      toolbar={toolbar}
      body={
        <>
            {total === 0 ? (
              <EmptyState icon={<Icon icon={InboxIcon} size="lg" />} {...emptyState} />
            ) : (
              <VStack gap={3}>
                {/* Also keeps the table from being the content's first child,
                    which Astryx bleeds up under the page header. */}
                <Text type="supporting">
                  {formatNumber(total)} {total === 1 ? 'record' : 'records'}
                  {pageCount > 1 ? ` · page ${currentPage} of ${pageCount}` : ''}
                </Text>
                <Table
                  data={visible}
                  columns={linkedColumns}
                  idKey={getId}
                  density={tableDensity(prefs)}
                  textOverflow={prefs?.wrapLongValues ? 'wrap' : 'truncate'}
                  hasHover
                  plugins={{ activation }}
                />
                {pageCount > 1 && (
                  <HStack hAlign="end">
                    <Pagination
                      page={currentPage}
                      onChange={goToPage}
                      totalItems={total}
                      pageSize={pageSize}
                      variant="count"
                    />
                  </HStack>
                )}
              </VStack>
            )}
        </>
      }
    />
  )
}

/** The page around the table: the one page frame, filters pinned in it,
 * then the summary band and the table. */
function ListFrame({ title, description, actions, summary, toolbar, body }: { title: string; description?: string; actions?: ReactNode; summary?: ReactNode; toolbar?: ReactNode; body: ReactNode }) {
  return (
    <PageFrame title={title} description={description} actions={actions} toolbar={toolbar}>
      <VStack gap={5}>
        {summary}
        {body}
      </VStack>
    </PageFrame>
  )
}
