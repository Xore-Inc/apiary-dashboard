import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/Stack'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FilterSelect, listParam, toParam } from '#/components/FilterSelect'
import { AnalysisRunDialog } from '#/components/dialogs/AnalysisRunDialog'
import { RecordList } from '#/components/RecordList'
import type { CapturedPayload, WorkbenchRun } from '#/data/types'
import { queuedMessage } from '#/components/analyzers/WorkbenchRuns'
import { entityHref } from '#/lib/entities'
import { formatTime } from '#/lib/format'
import { useIsAdmin } from '#/lib/session'
import { ensure, usePageQuery } from '#/lib/query'
import { payloadsQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/payloads/')({
  ssr: pageSsr,
  validateSearch: (search: Record<string, unknown>): { source?: string } => ({
    source: toParam(listParam(search.source)),
  }),
  loader: ({ context }) => ensure(context, payloadsQuery()),
  component: PayloadsPage,
  pendingComponent: PayloadsPage,
})

const VERDICT_COLOR = { malicious: 'red', suspicious: 'orange', clean: 'green' } as const

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

// A row opens the payload; what can be done with one is on its page.
const columns: TableColumn<CapturedPayload>[] = [
  { key: 'hash', header: 'SHA-256', width: proportional(2), renderCell: (row) => <Text type="code" maxLines={1}>{`${row.hash.slice(0, 24)}…`}</Text> },
  {
    key: 'verdict',
    header: 'Verdict',
    width: pixel(176),
    renderCell: (row) =>
      row.verdict ? (
        <HStack gap={1}>
          <Token size="sm" color={VERDICT_COLOR[row.verdict.label]} label={row.verdict.label} />
          {row.verdict.family && <Token size="sm" color="purple" label={row.verdict.family} />}
        </HStack>
      ) : (
        <Text type="supporting">not analyzed</Text>
      ),
  },
  { key: 'kind', header: 'Kind', width: pixel(104) },
  { key: 'platform', header: 'Platform', width: pixel(120) },
  { key: 'sizeBytes', header: 'Size', width: pixel(88), align: 'end', renderCell: (row) => formatSize(row.sizeBytes) },
  { key: 'sources', header: 'Captured by', width: pixel(144), renderCell: (row) => row.sources.join(' ') },
  { key: 'copies', header: 'Copies', width: pixel(72), align: 'end' },
  { key: 'capturedAt', header: 'Captured', width: pixel(104), renderCell: (row) => <Text type="supporting">{formatTime(row.capturedAt)}</Text> },
]

/** Every captured file as one row; its bytes, verdicts and analyses live on
 * the payload's own page. */
function PayloadsPage() {
  const isAdmin = useIsAdmin()
  const data = usePageQuery(payloadsQuery())
  const payloads = data?.payloads
  const sources = data?.sources ?? []
  const { source } = Route.useSearch()
  // undefined: closed; '' opens with no sample picked; a hash opens with it.
  const [analyzing, setAnalyzing] = useState<string | undefined>(undefined)
  const [queued, setQueued] = useState<{ run: WorkbenchRun; reused: boolean } | null>(null)
  const navigate = useNavigate()
  const picked = listParam(source)
  const visible = picked.length ? payloads?.filter((p) => p.sources.some((s) => picked.includes(s))) : payloads

  return (
    <>
      <RecordList
        title="Captured payloads"
        description="Every file attackers dropped or downloaded, with its verdict and where it was captured. Open one for its bytes and every analysis."
        actions={isAdmin ? <Button label="New analysis run" size="sm" onClick={() => setAnalyzing('')} /> : undefined}
        summary={
          queued && <Banner status={queued.reused ? 'info' : 'success'} {...queuedMessage(queued)} isDismissable onDismiss={() => setQueued(null)} endContent={<ActionLink href="/payload-workbench/results">Analysis results</ActionLink>} />
        }
        toolbar={
          <FilterSelect
            label="Captured by"
            isLabelHidden
            size="sm"
            width={220}
            placeholder="Captured by any sensor"
            options={sources.map((row) => ({ value: row.label, count: row.count }))}
            value={picked}
            onChange={(values) => void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, source: toParam(values) }) })}
          />
        }
        rows={visible}
        columns={columns}
        getId={(row) => row.hash}
        getHref={(row) => entityHref('payload', row.hash)!}
        emptyState={{ title: 'No payloads from this sensor', description: 'Pick another source, or All.' }}
      />
      <AnalysisRunDialog isOpen={analyzing !== undefined} onOpenChange={(open) => !open && setAnalyzing(undefined)} initialHash={analyzing || undefined} onQueued={setQueued} />
    </>
  )
}
