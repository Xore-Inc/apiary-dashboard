import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ComputerDesktopIcon } from '@heroicons/react/24/outline'
import { createFileRoute } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { PageFrame } from '#/components/PageFrame'
import { SkeletonLines } from '#/components/EntityBlocks'
import { orPending } from '#/lib/pending'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { getSandboxLiveStatus, getSandboxVncBridge } from '#/data/queries'
import { formatDateTime } from '#/lib/format'
import { analysisTabs } from '#/lib/navFamilies'
import { useIsAdmin } from '#/lib/session'
import { useEffect, useState } from 'react'
import { VncViewer } from '#/components/VncViewer'

export const Route = createFileRoute('/_layout/sandbox/vnc')({
  ssr: pageSsr,
  staticData: { viewTabs: analysisTabs() },
  loader: () => getSandboxLiveStatus(),
  component: SandboxLivePage,
  pendingComponent: SandboxLivePage,
})

/** The bridge to watch, asked for only by an admin's page (the query is
 * admin-only), once a detonation is known to be running. */
function useVncBridge(running: boolean) {
  const isAdmin = useIsAdmin()
  const [bridge, setBridge] = useState<{ job: string; bridge: string } | null | 'failed'>(null)
  useEffect(() => {
    if (!running || !isAdmin) return
    let cancelled = false
    getSandboxVncBridge().then(
      (answer) => !cancelled && setBridge(answer),
      () => !cancelled && setBridge('failed'),
    )
    return () => {
      cancelled = true
    }
  }, [running, isAdmin])
  return { isAdmin, bridge }
}

function SandboxLivePage() {
  const status = orPending(Route.useLoaderData())
  const { isAdmin, bridge } = useVncBridge(!!status?.running)
  return (
    <PageFrame title="Sandbox live view" description="A read-only view of the isolated Windows guest while a captured sample detonates. Admin only.">
      <VStack gap={4}>
        {!status ? (
          <Panel title={<Skeleton width={200} height={18} />}>
            <SkeletonLines count={2} />
          </Panel>
        ) : status.running ? (
          <Panel title={`Detonating ${status.job ?? ''}`}>
            <VStack gap={3}>
              <Text>Started {status.since ? formatDateTime(status.since) : 'just now'}. The guest display appears here, view only.</Text>
              {!isAdmin ? (
                <Text type="supporting">Watching a live detonation needs the admin role.</Text>
              ) : bridge === 'failed' ? (
                <Text type="supporting">The bridge address could not be read from the backend.</Text>
              ) : bridge ? (
                <VncViewer bridge={bridge.bridge} label={`Screen of the sandbox guest detonating ${bridge.job}, view only`} />
              ) : (
                <SkeletonLines count={1} />
              )}
            </VStack>
          </Panel>
        ) : (
          <EmptyState
            icon={<Icon icon={ComputerDesktopIcon} size="lg" />}
            title="No detonation is running"
            description="The view opens automatically when the Windows sandbox starts a sample."
            actions={<ActionLink href="/payload-workbench/results?tab=sandbox">Sandbox results</ActionLink>}
          />
        )}
        <Text type="supporting">This page never controls the guest. Keyboard and mouse input are not forwarded.</Text>
      </VStack>
    </PageFrame>
  )
}
