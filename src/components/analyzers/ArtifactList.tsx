// The files one analysis run left behind, each a download. Fetched when the
// section opens; a run with no files shows nothing, a failed fetch says so.
import { useQuery } from '@tanstack/react-query'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Panel } from '#/components/DashboardBlocks'
import type { ArtifactRow } from '#/data/queries'
import { artifactsQuery } from '#/data/resources'
import { describeError } from '#/lib/actionError'
import { apiHref } from '#/lib/apiHref'
import { formatNumber } from '#/lib/format'

type Load = { state: 'loading' } | { state: 'failed'; error: string } | { state: 'ready'; rows: ArtifactRow[] }

export function ArtifactList({ kind, artifactKey }: { kind: 'ghidra' | 'sandbox'; artifactKey: string }) {
  // Through the cache: reopening the tab shows the list at once.
  const { data, error, refetch } = useQuery(artifactsQuery(kind, artifactKey))
  const load: Load = error ? { state: 'failed', error: describeError(error) } : data === undefined ? { state: 'loading' } : { state: 'ready', rows: data ?? [] }
  if (load.state === 'ready' && load.rows.length === 0) return null
  const href = (filename: string) => apiHref(`/api/artifact/${kind}/${encodeURIComponent(artifactKey)}/${encodeURIComponent(filename)}`)
  const columns: TableColumn<ArtifactRow>[] = [
    { key: 'filename', header: 'File', width: proportional(2), renderCell: (row) => <Link href={href(row.filename)}>{row.filename}</Link> },
    { key: 'kind', header: 'Kind', width: pixel(160), renderCell: (row) => <Token size="sm" label={row.kind} /> },
    { key: 'sizeBytes', header: 'Size', width: pixel(112), align: 'end', renderCell: (row) => <Text type="supporting">{row.sizeBytes < 1024 ? `${formatNumber(row.sizeBytes)} B` : `${(row.sizeBytes / 1024).toFixed(1)} KB`}</Text> },
  ]
  return (
    <Panel title="Artifacts">
      {load.state === 'loading' && <Skeleton height={96} />}
      {load.state === 'failed' && <Banner status="error" title="Artifacts failed to load" description={load.error} endContent={<Button label="Try again" size="sm" variant="secondary" onClick={() => void refetch()} />} />}
      {load.state === 'ready' && <Table data={load.rows} columns={columns} idKey="filename" density="compact" />}
    </Panel>
  )
}
