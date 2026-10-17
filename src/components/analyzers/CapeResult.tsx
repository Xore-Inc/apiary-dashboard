import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { apiHref } from '#/lib/apiHref'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Grid } from '@astryxdesign/core/Grid'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Panel, StatTile } from '../DashboardBlocks'
import type { CapeRun } from '#/data/types'
import { AnalyzerSection } from './AnalyzerSection'

import { formatDateTime } from '#/lib/format'
import { EntityLink } from '../EntityLink'

export function CapeResult({ run }: { run: CapeRun }) {
  return (
    <AnalyzerSection
      title="CAPE result"
      description="Detonation in an isolated, debugger-instrumented Windows guest, built to defeat debugger-class time evasion."
      actions={<Button label="Raw report" size="sm" variant="secondary" href={apiHref(`/api/raw-report/cape/${run.sha}`)} />}
    >
      <VStack gap={5}>
        <HStack gap={3} wrap="wrap">
          <EntityLink kind="payload" id={run.sha}><Text type="code">{`${run.sha.slice(0, 24)}…`}</Text></EntityLink>
          <Text type="supporting">
            {run.taskId === null
              ? `not submitted to CAPE · ${formatDateTime(run.at)}`
              : `task ${run.taskId} · ${formatDateTime(run.at)} · CAPE status ${run.capeStatus ?? 'unknown'}`}
          </Text>
        </HStack>
        {run.package && (
          <MetadataList label={{ position: 'start', width: 80 }}>
            <MetadataListItem label="Package">
              <Text type="code">{run.package}</Text>
            </MetadataListItem>
          </MetadataList>
        )}
        {run.status === 'failed_analysis' ? (
          <Banner status="error" title="This run did not complete" description={run.log} />
        ) : (
          <>
            <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={4}>
              <StatTile label="Malscore" value={run.malscore} caption={`out of 10 · ${run.malstatus}`} />
              <StatTile label="API calls" value={run.totalCalls} />
              <StatTile label="Signatures" value={run.signatures.length} />
              <StatTile label="Processes traced" value={run.processes.length} />
              <StatTile label="Dumps" value={run.dumps.length} />
            </Grid>
            <Panel title="Signatures">
              <Table
                data={run.signatures.map((s) => ({ ...s, id: s.name }))}
                columns={[
                  { key: 'severity', header: 'Severity', width: pixel(88), renderCell: (row) => <Token size="sm" color={row.severity >= 3 ? 'red' : 'orange'} label={String(row.severity)} /> },
                  { key: 'name', header: 'Signature', width: pixel(200), renderCell: (row) => <Text type="code">{row.name}</Text> },
                  { key: 'description', header: 'Description', width: proportional(2) },
                ]}
                idKey="id"
                density="compact"
              />
            </Panel>
            <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
              <Panel title="Process activity">
                <VStack gap={2}>
                  {run.processes.map((p) => (
                    <VStack key={p.pid} gap={0.5}>
                      <Text weight="semibold">{`${p.name} (pid ${p.pid})`}</Text>
                      <Text type="code">{p.commandLine}</Text>
                    </VStack>
                  ))}
                </VStack>
              </Panel>
              <Panel title="Extracted configuration">
                <MetadataList label={{ position: 'start', width: 80 }}>
                  {Object.entries(run.config).map(([k, v]) => (
                    <MetadataListItem key={k} label={k}>
                      <Text type="code">{v}</Text>
                    </MetadataListItem>
                  ))}
                </MetadataList>
                {run.dumps.map((d) => <Text key={d} type="code">{d}</Text>)}
              </Panel>
            </Grid>
          </>
        )}
        <Panel title="Analyzer log">
          <VStack gap={3}>
            <HStack gap={1} wrap="wrap" vAlign="center">
              <Text type="supporting">Report sections:</Text>
              {run.sections.map((section) => <Token key={section} size="sm" label={section} />)}
            </HStack>
            {run.debugErrors.length > 0 && (
              <Banner status="warning" title={`${run.debugErrors.length} ${run.debugErrors.length === 1 ? 'error' : 'errors'} in CAPE's log`} description={run.debugErrors.join(' · ')} />
            )}
            <CodeBlock isWrapped code={run.log} hasCopyButton={false} />
          </VStack>
        </Panel>
      </VStack>
    </AnalyzerSection>
  )
}
