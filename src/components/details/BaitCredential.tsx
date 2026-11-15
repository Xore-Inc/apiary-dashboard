import { ActionLink } from '#/components/ActionLink'
import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Divider } from '@astryxdesign/core/Divider'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { linkCredentialTokenWrite, rotateCredentialWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import { describeError } from '#/lib/actionError'
import { useIsAdmin } from '#/lib/session'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import type { BaitCredential, CanaryToken } from '#/data/types'
import { formatDateTime } from '#/lib/format'

export function CredentialInspector({
  credential,
  tokens,
}: {
  credential: BaitCredential
  tokens: CanaryToken[]
}) {
  const rotate = useDataMutation(rotateCredentialWrite())
  const link = useDataMutation(linkCredentialTokenWrite())
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState<'rotate' | 'link' | null>(null)
  const [error, setError] = useState<{ kind: 'rotate' | 'link'; message: string }>()
  const isAdmin = useIsAdmin()
  const linked = tokens.find((t) => t.id === credential.linkedTokenId)
  const run = async (
    kind: 'rotate' | 'link',
    write: () => Promise<unknown>,
  ) => {
    setBusy(kind)
    setError(undefined)
    try {
      // Each write invalidates the credential and token reads (data/writes.ts).
      await write()
    } catch (e) {
      setError({ kind, message: describeError(e) })
    } finally {
      setBusy(null)
    }
  }
  const rendered = credential.template
    .replaceAll('{{username}}', credential.username)
    .replaceAll('{{password}}', credential.password)

  return (
    <VStack gap={4}>
      <Text type="code">{credential.path}</Text>
      <MetadataList label={{ position: 'start', width: 96 }}>
        <MetadataListItem label="Honeypot">
          {credential.target}
        </MetadataListItem>
        <MetadataListItem label="Username">
          <Text type="code">{credential.username}</Text>
        </MetadataListItem>
        <MetadataListItem label="Password">
          <Text type="code">{credential.password}</Text>
        </MetadataListItem>
        <MetadataListItem label="Memo">
          {credential.memo || '—'}
        </MetadataListItem>
        <MetadataListItem label="Created">{`${formatDateTime(credential.createdAt)} by ${credential.createdBy}`}</MetadataListItem>
        {credential.rotatedAt && (
          <MetadataListItem label="Rotated">{`${formatDateTime(credential.rotatedAt)} by ${credential.rotatedBy}`}</MetadataListItem>
        )}
      </MetadataList>
      <VStack gap={2}>
        <Heading level={3}>File as planted</Heading>
        <CodeBlock isWrapped
          code={rendered}
          title={credential.path.split('/').at(-1)}
          hasCopyButton={false}
        />
      </VStack>
      <Divider />
      {isAdmin && (
      <VStack gap={2}>
        <Heading level={3}>Rotate</Heading>
        <Text type="supporting">
          Re-implants the file at the same path with a new password.
        </Text>
        <HStack gap={2} vAlign="end">
          <StackItem size="fill">
            <TextInput
              label="New password"
              isLabelHidden
              placeholder="Blank = auto-generate"
              value={newPassword}
              onChange={setNewPassword}
            />
          </StackItem>
          <Button
            label="Rotate"
            variant="secondary"
            isLoading={busy === 'rotate'}
            onClick={() =>
              run('rotate', async () => {
                await rotate.mutateAsync([credential.id, newPassword || undefined])
                setNewPassword('')
              })
            }
          />
        </HStack>
        {error?.kind === 'rotate' && <FieldStatus type="error" variant="detached" message={error.message} />}
      </VStack>
      )}
      <VStack gap={2}>
        <Heading level={3}>Linked canarytoken</Heading>
        {isAdmin ? (
        <Selector
          label="Linked canarytoken"
          isLabelHidden
          hasClear
          placeholder="No linked token"
          status={error?.kind === 'link' ? { type: 'error', message: error.message } : undefined}
          value={credential.linkedTokenId ?? null}
          onChange={(tokenId) =>
            void run('link', () =>
              link.mutateAsync([credential.id, tokenId ?? undefined]),
            )
          }
          options={tokens.map((t) => ({
            value: t.id,
            label: t.memo,
            description: t.type,
          }))}
        />
        ) : (
          <Text>{linked ? linked.memo : 'No linked token'}</Text>
        )}
        {linked && <ActionLink href="/canarytokens">Open canarytokens</ActionLink>}
      </VStack>
    </VStack>
  )
}
