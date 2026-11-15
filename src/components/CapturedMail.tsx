// The message a mail sensor captured. Plain text only: an HTML body is
// decoded to text and never rendered, and attachments are listed as
// metadata, never offered as bytes, so this is neither a script sink nor a
// malware source.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { mailQuery } from '#/data/resources'
import type { CapturedMail, MailAddress } from '#/data/types'
import { formatNumber } from '#/lib/format'

export const formatAddress = (a: MailAddress) => (a.name ? `${a.name} <${a.address}>` : a.address || '—')

type Attachment = CapturedMail['attachments'][number] & { id: string }

/** A double extension or an executable type is worth a second look. */
const suspicious = (a: Attachment) => /\.(exe|scr|js|vbs|bat|cmd|hta|iso|lnk)$/i.test(a.filename) || a.contentType === 'application/octet-stream'

const attachmentColumns: TableColumn<Attachment>[] = [
  {
    key: 'filename',
    header: 'File',
    width: proportional(2),
    renderCell: (row) => (
      <VStack gap={0.5}>
        <Text type="code">{row.filename || '(unnamed)'}</Text>
        {suspicious(row) && <Token size="sm" color="red" label="executable disguised as a document" />}
      </VStack>
    ),
  },
  { key: 'contentType', header: 'Type', width: pixel(200), renderCell: (row) => <Text type="supporting">{row.contentType}</Text> },
  { key: 'sizeBytes', header: 'Size', width: pixel(96), align: 'end', renderCell: (row) => `${formatNumber(row.sizeBytes)} B` },
  { key: 'sha256', header: 'SHA-256', width: proportional(2), renderCell: (row) => <Text type="code">{row.sha256}</Text> },
]

/** Headers, body, attachment metadata. */
export function MailMessage({ mail }: { mail: CapturedMail }) {
  return (
    <VStack gap={4}>
      <MetadataList label={{ position: 'start', width: 104 }}>
        <MetadataListItem label="From">{mail.from ? formatAddress(mail.from) : '—'}</MetadataListItem>
        <MetadataListItem label="To">{mail.to.length ? mail.to.map(formatAddress).join(', ') : '—'}</MetadataListItem>
        <MetadataListItem label="Subject">{mail.subject || '—'}</MetadataListItem>
        <MetadataListItem label="Date">{mail.date || '—'}</MetadataListItem>
        <MetadataListItem label="Message-ID">
          <Text type="code">{mail.messageId || '—'}</Text>
        </MetadataListItem>
        <MetadataListItem label="Size">{`${formatNumber(mail.sizeBytes)} bytes`}</MetadataListItem>
      </MetadataList>
      {mail.fromHtml && <Banner status="info" title="HTML message, shown as text" description="The message had only an HTML part. It was decoded to text and is never rendered: links and scripts in it cannot run here." />}
      <CodeBlock isWrapped code={mail.bodyText || '(empty body)'} title="Body" language="text" maxHeight={360} />
      {mail.attachments.length > 0 && (
        <VStack gap={2}>
          <Text type="label">{`Attachments (${mail.attachments.length}): metadata only, the bytes are not offered`}</Text>
          <Table data={mail.attachments.map((a, i) => ({ ...a, id: `${a.sha256}-${i}` }))} columns={attachmentColumns} idKey="id" density="compact" />
        </VStack>
      )}
    </VStack>
  )
}

type Loaded = { state: 'mail'; mail: CapturedMail } | { state: 'missing' } | { state: 'failed' }

/** Fetched when asked for: the body lives behind a separate index, and a
 * list of sessions should not pay for every message nobody opens. Once
 * fetched it is kept with the session page's own read of it. */
export function CapturedMailInline({ sessionId, openInitially = false }: { sessionId: string; openInitially?: boolean }) {
  const [asked, setAsked] = useState(openInitially)
  const { data, isError, refetch } = useQuery({ ...mailQuery(sessionId), enabled: asked })
  const load = () => (asked ? void refetch() : setAsked(true))
  const loaded: Loaded | 'loading' | null = !asked ? null : isError ? { state: 'failed' } : data === undefined ? 'loading' : data ? { state: 'mail', mail: data } : { state: 'missing' }
  if (loaded === null) {
    return <Button label="Show captured message" size="sm" variant="secondary" icon={<Icon icon={EnvelopeIcon} size="sm" />} onClick={() => load()} />
  }
  if (loaded === 'loading') return <Skeleton height={160} />
  if (loaded.state === 'failed')
    return <EmptyState title="The captured message failed to load" description="The request failed. This says nothing either way about whether a body was captured." actions={<Button label="Try again" size="sm" onClick={() => load()} />} />
  if (loaded.state === 'missing') return <Text type="supporting">No message body was captured for this session: the client stopped after the envelope.</Text>
  return <MailMessage mail={loaded.mail} />
}
