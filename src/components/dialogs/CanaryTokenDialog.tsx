/**
 * Create a canarytoken: what kind, where it is planted, and a last look
 * before it is minted. The token's URL is only known once it exists, so the
 * page shows it after the dialog closes.
 */
import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { FileInput } from '@astryxdesign/core/FileInput'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { TextInput } from '@astryxdesign/core/TextInput'
import { canaryImageProblem } from '#/data/adapters/tools'
import { createCanarytokenWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { CanaryToken, CanaryTokenType } from '#/data/types'
import { WizardDialog, statusOf } from '../WizardDialog'

/** The picked file as the live adapter expects it: base64 of its bytes. The
 * chunked loop keeps the argument list of String.fromCharCode short. */
async function base64Of(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** A size for the operator: KiB under a MiB, MiB above. */
const sizeOf = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`)

export function CanaryTokenDialog({ types, isOpen, onOpenChange, onCreated }: { types: CanaryTokenType[]; isOpen: boolean; onOpenChange: (open: boolean) => void; onCreated: (token: CanaryToken) => void }) {
  // Minting invalidates the token and credential reads (data/writes.ts).
  const create = useDataMutation(createCanarytokenWrite())
  const [type, setType] = useState(types[0].type)
  const [memo, setMemo] = useState('')
  const [snippet, setSnippet] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const selected = types.find((t) => t.type === type) ?? types[0]
  const imageProblem = !image ? 'Choose the image the token serves.' : canaryImageProblem(image)

  const reset = (open: boolean) => {
    if (!open) {
      setType(types[0].type)
      setMemo('')
      setSnippet('')
      setImage(null)
    }
    onOpenChange(open)
  }

  return (
    <WizardDialog
      title="Create a canarytoken"
      isOpen={isOpen}
      onOpenChange={reset}
      finishLabel="Create token"
      onFinish={async () =>
        onCreated(
          await create.mutateAsync([{
            type,
            memo: memo.trim(),
            ...(selected.supportsSnippet && snippet.trim() ? { snippet: snippet.trim() } : {}),
            ...(selected.requiresUpload && image ? { image: { name: image.name, contentType: image.type, base64: await base64Of(image) } } : {}),
          }]),
        )
      }
      steps={[
        {
          label: 'Type',
          errors: {},
          render: () => (
            <RadioList label="What kind of token" description="Each phones home a different way; plant it where an intruder would touch it." value={type} onChange={setType}>
              {types.map((t) => (
                <RadioListItem key={t.type} value={t.type} label={t.label} description={t.description} />
              ))}
            </RadioList>
          ),
        },
        {
          label: 'Details',
          errors: {
            ...(memo.trim() ? {} : { memo: 'Say where you will plant it; the alert shows this.' }),
            ...(selected.requiresUpload && imageProblem ? { image: imageProblem } : {}),
          },
          render: (shown) => (
            <FormLayout defaultOptionality="optional">
              <TextInput label="Memo" isRequired value={memo} onChange={setMemo} placeholder="Salaries.docx on the SMB share of fileserver01" description="What the alert says when the token fires, so name the place and the host." status={statusOf(shown, 'memo')} />
              {selected.requiresUpload && (
                <FileInput label="Image" isRequired accept="image/png,image/jpeg,image/gif" value={image} onChange={(file) => setImage(Array.isArray(file) ? (file[0] ?? null) : file)} description="The picture the token serves; loading it fires the alert." status={statusOf(shown, 'image')} />
              )}
              {selected.supportsSnippet && (
                <TextInput label="Text snippet" value={snippet} onChange={setSnippet} placeholder="Q3 salary adjustments, final" description="A line of text inside the document, so it looks lived-in when opened." />
              )}
            </FormLayout>
          ),
        },
        {
          label: 'Review',
          errors: {},
          render: () => (
            <FormLayout>
              <Card variant="muted" padding={3}>
                <MetadataList orientation="vertical">
                  <MetadataListItem label="Type">{selected.label}</MetadataListItem>
                  <MetadataListItem label="Memo">{memo.trim()}</MetadataListItem>
                  {selected.requiresUpload && image && <MetadataListItem label="Image">{`${image.name} (${sizeOf(image.size)})`}</MetadataListItem>}
                  {selected.supportsSnippet && snippet.trim() && <MetadataListItem label="Text snippet">{snippet.trim()}</MetadataListItem>}
                </MetadataList>
              </Card>
              <Banner status="info" title="The token is live as soon as it is created" description="Its URL and any file to plant appear on the page once this closes." />
            </FormLayout>
          ),
        },
      ]}
    />
  )
}
