import { useState } from 'react'
import { Heading, Text } from '@astryxdesign/core/Text'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Selector } from '@astryxdesign/core/Selector'
import { VStack } from '@astryxdesign/core/Stack'
import { setProblemStatusWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import { describeError } from '#/lib/actionError'
import { useIsAdmin } from '#/lib/session'
import type { ProblemReport, ProblemStatus } from '#/data/types'

export function ReportInspector({ report }: { report: ProblemReport }) {
  const setStatus = useDataMutation(setProblemStatusWrite())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const isAdmin = useIsAdmin()
  return (
    <VStack gap={4}>
      {isAdmin ? (
      <Selector
        label="Status"
        value={report.status}
        isDisabled={busy}
        status={error ? { type: 'error', message: error } : undefined}
        onChange={async (status) => {
          setBusy(true)
          setError(undefined)
          try {
            await setStatus.mutateAsync([report.id, status as ProblemStatus])
          } catch (e) {
            setError(describeError(e))
          } finally {
            setBusy(false)
          }
        }}
        options={['open', 'triaged', 'fixed', 'wontfix']}
      />
      ) : (
        <MetadataList label={{ position: 'start', width: 96 }}>
          <MetadataListItem label="Status">{report.status}</MetadataListItem>
        </MetadataList>
      )}
      <MetadataList label={{ position: 'start', width: 96 }}>
        <MetadataListItem label="Page">
          <Text type="code">{report.page}</Text>
        </MetadataListItem>
        <MetadataListItem label="Expected">{report.expected}</MetadataListItem>
        <MetadataListItem label="Actual">{report.actual}</MetadataListItem>
        <MetadataListItem label="By">{report.submittedBy}</MetadataListItem>
        <MetadataListItem label="Browser">{report.userAgent}</MetadataListItem>
        <MetadataListItem label="Snapshot">
          {report.hasSnapshot ? 'DOM snapshot attached' : 'none'}
        </MetadataListItem>
      </MetadataList>
      <VStack gap={2}>
        <Heading level={3}>Action trail</Heading>
        <List density="compact" hasDividers>
          {report.actionTrail.map((step, i) => (
            <ListItem key={i} label={`${i + 1}. ${step}`} />
          ))}
        </List>
      </VStack>
      {[...report.consoleErrors, ...report.networkFailures].length > 0 && (
        <VStack gap={2}>
          <Heading level={3}>Errors</Heading>
          {[...report.consoleErrors, ...report.networkFailures].map((line) => (
            <Text key={line} type="code">
              {line}
            </Text>
          ))}
        </VStack>
      )}
      <VStack gap={2}>
        <Heading level={3}>API calls</Heading>
        {report.apiCalls.map((call) => (
          <Text
            key={`${call.method}${call.path}`}
            type="code"
          >{`${call.status} ${call.method} ${call.path}`}</Text>
        ))}
      </VStack>
    </VStack>
  )
}
