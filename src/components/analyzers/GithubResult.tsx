import { ActionLink } from '#/components/ActionLink'
import { useState } from 'react'
import { Link } from '@astryxdesign/core/Link'
import { apiHref } from '#/lib/apiHref'
import { ConfirmDialog } from '#/components/AppDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Panel, StatTile } from '../DashboardBlocks'
import { AnalyzerSection } from './AnalyzerSection'
import { queuePayloadActionWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { GithubStatus, GithubAnalysis } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { EntityLink } from '../EntityLink'
import { useIsAdmin } from '#/lib/session'
import { useGuardedAction } from '#/lib/useGuardedAction'

const STATUS_BANNER: Record<Exclude<GithubStatus, 'published'>, { title: string; description: string }> = {
  dry_run: { title: 'Dry run', description: 'The pipeline ran without publishing; no scanner results were collected.' },
  denylist_blocked: { title: 'Blocked by the denylist', description: 'This sample matched the publication denylist and was not published.' },
  quota_exceeded: { title: 'Daily publish quota exceeded', description: 'This sample was not published; resubmit tomorrow or raise the daily cap.' },
}

const VERDICT_COLOR = { malicious: 'red', suspicious: 'orange', undetected: 'gray' } as const

export function GithubResult({ g }: { g: GithubAnalysis }) {
  // Queuing invalidates the payload's analysis reads (data/writes.ts).
  const queue = useDataMutation(queuePayloadActionWrite())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isAdmin = useIsAdmin()
  const { error, guard, clearError } = useGuardedAction()
  const [queued, setQueued] = useState<string | null>(null)
  return (
    <AnalyzerSection
      title="GitHub analysis"
      description="A published sample's multi-engine scanner verdict from the public analysis repository."
      actions={
        <>
          <Button label="Raw report" size="sm" variant="secondary" href={apiHref(`/api/raw-report/github-analysis/${g.sha}`)} />
          {isAdmin && <Button label="Resubmit" size="sm" variant="secondary" onClick={() => setConfirmOpen(true)} />}
        </>
      }
    >
      <VStack gap={5}>
        <HStack gap={3} wrap="wrap">
          <EntityLink kind="payload" id={g.sha}><Text type="code">{`${g.sha.slice(0, 24)}…`}</Text></EntityLink>
          <Text type="supporting">{formatDateTime(g.at)}</Text>
        </HStack>
        {g.status !== 'published' && <Banner status="warning" title={STATUS_BANNER[g.status].title} description={g.dailyCap ? `The cap is ${g.dailyCap} publications per day. ${STATUS_BANNER[g.status].description}` : STATUS_BANNER[g.status].description} />}
        {queued && <Banner status="success" title={queued} isDismissable onDismiss={() => setQueued(null)} />}
        <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={4}>
          <StatTile label="Detections" value={g.detections} caption={`of ${g.engines} engines`} />
          <Panel title="Risk level">
            <Token size="sm" color={g.risk === 'high' ? 'red' : g.risk === 'medium' ? 'orange' : 'green'} label={g.risk} />
          </Panel>
          <Panel title="Family">
            <Text>{g.family ?? '—'}</Text>
          </Panel>
          <StatTile label="Auto YARA rules" value={g.yaraRules.length} />
        </Grid>
        <Panel title="Scanner results">
          <Table
            data={g.results.map((r) => ({ ...r, id: r.engine }))}
            columns={[
              { key: 'engine', header: 'Engine', width: pixel(160) },
              { key: 'verdict', header: 'Verdict', width: pixel(120), renderCell: (row) => <Token size="sm" color={VERDICT_COLOR[row.verdict]} label={row.verdict} /> },
              { key: 'label', header: 'Label', width: proportional(2), renderCell: (row) => (row.label ? <Text type="code">{row.label}</Text> : '—') },
              { key: 'permalink', header: '', width: pixel(96), renderCell: (row) => (row.permalink ? <Link href={row.permalink} target="_blank" rel="noopener noreferrer">Report</Link> : null) },
            ]}
            idKey="id"
            density="compact"
          />
        </Panel>
        <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
          <Panel title="Publication record">
            <MetadataList label={{ position: 'start', width: 96 }}>
              <MetadataListItem label="Status">{g.status}</MetadataListItem>
              <MetadataListItem label="Requested by">{g.requestedBy}</MetadataListItem>
              <MetadataListItem label="Repository">
                <Text type="code">{g.repoPath}</Text>
              </MetadataListItem>
              {g.commit && (
                <MetadataListItem label="Commit">
                  <Link href={g.commit.url} target="_blank" rel="noopener noreferrer">
                    <Text type="code">{g.commit.sha.slice(0, 12)}</Text>
                  </Link>
                </MetadataListItem>
              )}
              {g.runUrl && (
                <MetadataListItem label="Scan">
                  <ActionLink href={g.runUrl} external>Actions run</ActionLink>
                </MetadataListItem>
              )}
              {g.reportPdf && (
                <MetadataListItem label="Report">
                  <Text type="code">{g.reportPdf}</Text>
                </MetadataListItem>
              )}
              {g.viewUrl && (
                <MetadataListItem label="Published">
                  <ActionLink href={g.viewUrl} external>Read the report</ActionLink>
                </MetadataListItem>
              )}
            </MetadataList>
          </Panel>
          <Panel title="Auto-generated YARA rules">
            {g.yaraRules.length ? g.yaraRules.map((r) => <Text key={r} type="code">{r}</Text>) : <Text type="supporting">None generated.</Text>}
          </Panel>
        </Grid>
      </VStack>
      {error && <Banner status="error" title="Not queued" description={error} isDismissable onDismiss={clearError} />}
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Resubmit for publication?"
        description="Publishes the sample again and requests a fresh scan from third-party engines. The sample becomes public."
        actionLabel="Resubmit"
        onAction={async () => {
          setConfirmOpen(false)
          setQueued((await guard(() => queue.mutateAsync([g.sha, 'github']))) ?? null)
        }}
      />
    </AnalyzerSection>
  )
}
