import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { BaitCredentialDialog } from '#/components/dialogs/BaitCredentialDialog'
import { RecordList } from '#/components/RecordList'
import type { BaitCredential } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { useIsAdmin } from '#/lib/session'
import { ensure, usePageQuery } from '#/lib/query'
import { credentialsQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/credentials/')({
  ssr: pageSsr,
  loader: ({ context }) => ensure(context, credentialsQuery()),
  component: CredentialsPage,
  pendingComponent: CredentialsPage,
})

function CredentialsPage() {
  const isAdmin = useIsAdmin()
  const data = usePageQuery(credentialsQuery())
  const tokenLabel = (id?: string) => data?.tokens.find((t) => t.id === id)?.memo
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  const columns: TableColumn<BaitCredential>[] = [
    { key: 'createdAt', header: 'Created', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.createdAt)}</Text> },
    { key: 'path', header: 'Path', width: proportional(3), renderCell: (row) => <Text type="code">{row.path}</Text> },
    { key: 'username', header: 'Username', width: pixel(168), renderCell: (row) => <Text type="code" maxLines={1}>{row.username}</Text> },
    { key: 'memo', header: 'Memo', width: proportional(2) },
    {
      key: 'linkedTokenId',
      header: 'Linked token',
      width: pixel(128),
      renderCell: (row) => (row.linkedTokenId ? <Token size="sm" color="blue" label="linked" description={tokenLabel(row.linkedTokenId)} /> : <Text type="supporting">—</Text>),
    },
  ]

  return (
    <RecordList
      title="Credentials"
      description="Bait usernames and passwords planted live into honeypot filesystems. Provision, rotate, and optionally link one to a canarytoken."
      actions={
        <>
          <Text type="supporting"><Pending>{data && `${data.credentials.length} planted`}</Pending></Text>
          {isAdmin && <Button label="Plant bait credential" size="sm" onClick={() => setCreating(true)} />}
          <BaitCredentialDialog
            targets={data?.targets ?? []}
            isOpen={creating}
            onOpenChange={(open) => {
              setCreating(open)
              if (!open) void router.invalidate()
            }}
          />
        </>
      }
      rows={data?.credentials}
      columns={columns}
      getId={(row) => row.id}
      getHref={(row) => `/credentials/${encodeURIComponent(row.id)}`}
      emptyState={{ title: 'No bait credentials yet', description: 'Use Plant bait credential to put one into a honeypot.' }}
    />
  )
}
