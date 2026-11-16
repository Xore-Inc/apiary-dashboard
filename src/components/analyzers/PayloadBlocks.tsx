import { useState } from 'react'
import { ConfirmDialog } from '#/components/AppDialog'
import { DropdownMenu, DropdownMenuItem } from '@astryxdesign/core/DropdownMenu'
import { Icon } from '@astryxdesign/core/Icon'
import { useToast } from '@astryxdesign/core/Toast'
import { ArrowDownTrayIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { PayloadAction } from '#/data/queries'
import { queuePayloadActionWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { Ioc } from '#/data/types'
import { AnalysisRunDialog } from '../dialogs/AnalysisRunDialog'
import { queuedMessage } from './WorkbenchRuns'
import { EntityLink } from '../EntityLink'
import { useIsAdmin } from '#/lib/session'
import { describeError } from '#/lib/actionError'
import { apiHref } from '#/lib/apiHref'

export const VERDICT_COLOR = { malicious: 'red', suspicious: 'orange', clean: 'green' } as const

export const iocColumns: TableColumn<Ioc>[] = [
  { key: 'kind', header: 'Kind', width: pixel(88), renderCell: (row) => <Token size="sm" label={row.kind} /> },
  {
    key: 'value',
    header: 'Indicator',
    width: proportional(1),
    renderCell: (row) =>
      row.kind === 'ip' ? <EntityLink kind="source" id={row.value} /> : <Text type="code">{row.value}</Text>,
  },
]

/** The operator's actions on one sample, as one menu in the payload's header
 * next to "Open in": queue more analysis, publish, take the bytes. Admins
 * only; nothing runs on this host, every job goes to an isolated worker. */
export function PayloadOperatorMenu({ hash }: { hash: string }) {
  const queue = useDataMutation(queuePayloadActionWrite())
  const isAdmin = useIsAdmin()
  const toast = useToast()
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  if (!isAdmin) return null
  const run = async (action: PayloadAction) => {
    try {
      toast({ body: await queue.mutateAsync([hash, action]) })
    } catch (e) {
      toast({ type: 'error', body: `Not queued: ${describeError(e)}` })
    }
  }
  return (
    <>
      <DropdownMenu
        placement="below"
        alignment="end"
        menuWidth={300}
        button={{ label: 'Operator actions', size: 'sm', variant: 'secondary', icon: <Icon icon={WrenchScrewdriverIcon} size="sm" /> }}
      >
        <DropdownMenuItem label="New analysis run…" description="Pick analyzers or a recipe for this sample" onClick={() => setAnalyzing(true)} />
        {/* No backend endpoint generates a payload's PDF yet (api.ts queuePayloadAction): shown, not offered. */}
        <DropdownMenuItem label="Generate PDF report" description="Not available yet: the backend has no PDF generation for a sample" isDisabled />
        <DropdownMenuItem label="Publish to GitHub…" description="Public, and sent to third-party scanners" onClick={() => setConfirmPublish(true)} />
        <DropdownMenuItem label="Download sample" description="Live malware: the captured bytes, unchanged" endContent={<Icon icon={ArrowDownTrayIcon} size="sm" />} onClick={() => void window.location.assign(apiHref(`/api/payload/${encodeURIComponent(hash)}/download`))} />
      </DropdownMenu>
      <AnalysisRunDialog isOpen={analyzing} onOpenChange={setAnalyzing} initialHash={hash} onQueued={(queued) => void toast({ body: queuedMessage(queued).title })} />
      <ConfirmDialog
        isOpen={confirmPublish}
        onOpenChange={setConfirmPublish}
        title="Publish to Xore/honeypot?"
        description="The sample and its analysis become public in the GitHub repository and are submitted to third-party scanners. This cannot be undone from the dashboard."
        actionLabel="Publish"
        onAction={async () => {
          setConfirmPublish(false)
          await run('github')
        }}
      />
    </>
  )
}
