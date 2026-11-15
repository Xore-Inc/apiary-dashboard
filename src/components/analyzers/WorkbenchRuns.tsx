import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { List, ListItem } from '@astryxdesign/core/List'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { setRunChildWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { RunState, WorkbenchRun, WorkbenchRunChild } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { useIsAdmin } from '#/lib/session'
import { ActionLink } from '../ActionLink'
import { EntityLink } from '../EntityLink'

export const RUN_STATE_COLOR = { queued: 'default', running: 'blue', succeeded: 'green', failed: 'red', cancelled: 'default', skipped: 'default' } as const satisfies Record<RunState, string>

/** What a run's banner says once queued: a new run, or the identical one
 * already in flight that the backend reused. */
export function queuedMessage({ run, reused }: { run: WorkbenchRun; reused: boolean }): { title: string; description: string } {
  const what = `${run.recipeName ?? run.children.map((c) => c.label).join(', ')} on ${run.hash.slice(0, 12)}…`
  return reused ? { title: `An identical run is already in flight (${run.id})`, description: `Nothing new was queued; follow that one. ${what}` } : { title: `Run ${run.id} queued`, description: what }
}

function ChildRow({ run, child }: { run: WorkbenchRun; child: WorkbenchRunChild }) {
  const setChild = useDataMutation(setRunChildWrite())
  const { error, guard, clearError } = useGuardedAction()
  const [busy, setBusy] = useState(false)
  const act = async (action: 'retry' | 'cancel') => {
    setBusy(true)
    try {
      await guard(() => setChild.mutateAsync([run.id, child.analyzerId, action]))
    } finally {
      setBusy(false)
    }
  }
  return (
    <ListItem
      label={
        <HStack gap={2} vAlign="center">
          <Token size="sm" color={RUN_STATE_COLOR[child.state]} label={child.state} />
          <Text>{child.label}</Text>
        </HStack>
      }
      description={
        <VStack gap={0.5}>
          <Text type="supporting">{[child.summary ?? child.reason, `${child.attempts} ${child.attempts === 1 ? 'attempt' : 'attempts'}`, `updated ${formatDateTime(child.updatedAt)}`].filter(Boolean).join(' · ')}</Text>
          {error && <Banner status="error" title="Not changed" description={error} isDismissable onDismiss={clearError} />}
        </VStack>
      }
      endContent={
        <HStack gap={1}>
          {child.resultHref && (
            <ActionLink href={child.resultHref} label={`${child.label} result for ${run.hash.slice(0, 12)}`}>
              Result
            </ActionLink>
          )}
          {child.retryable && (
            <Button label={`Retry ${child.label} on ${run.hash.slice(0, 12)}`} size="sm" variant="secondary" isLoading={busy} onClick={() => void act('retry')}>
              Retry
            </Button>
          )}
          {child.cancelable && (
            <Button label={`Cancel ${child.label} on ${run.hash.slice(0, 12)}`} size="sm" variant="secondary" isLoading={busy} onClick={() => void act('cancel')}>
              Cancel
            </Button>
          )}
        </HStack>
      }
    />
  )
}

/** The operator's own runs, each with its analyzers' progress: results to
 * open, failures to retry, work still queued to cancel. */
export function WorkbenchRuns({ runs }: { runs: WorkbenchRun[] | undefined }) {
  const isAdmin = useIsAdmin()
  if (!runs)
    return (
      <VStack gap={3} aria-busy>
        {[0, 1, 2].map((i) => (
          <VStack key={i} gap={1.5}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="100%" height={48} />
          </VStack>
        ))}
      </VStack>
    )
  if (!runs.length) return <Text type="supporting">{isAdmin ? 'No runs yet. Start one with New analysis run.' : 'No runs of yours yet. An operator starts analysis runs; their results appear in the analyzer tabs.'}</Text>
  return (
    <VStack gap={4}>
      {runs.map((run) => (
        <VStack key={run.id} gap={1.5}>
          <HStack gap={2} wrap="wrap" vAlign="center">
            <Token size="sm" color={RUN_STATE_COLOR[run.state]} label={run.state} />
            <Text weight="semibold">{run.label}</Text>
            {run.recipeName && <Token size="sm" color="purple" label={run.recipeName} />}
          </HStack>
          <HStack gap={2} wrap="wrap" vAlign="center">
            <EntityLink kind="payload" id={run.hash}>
              <Text type="code">{`${run.hash.slice(0, 16)}…`}</Text>
            </EntityLink>
            <Text type="supporting">{`${run.payloadKind} · started ${formatDateTime(run.createdAt)}`}</Text>
          </HStack>
          <List density="compact" hasDividers>
            {run.children.map((child) => (
              <ChildRow key={child.analyzerId} run={run} child={child} />
            ))}
          </List>
        </VStack>
      ))}
    </VStack>
  )
}
