/**
 * Plant a bait credential: which honeypot and file, the username and
 * password it holds, and a last look. Creating it writes the file into the
 * honeypot straight away, so the review says so.
 */
import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { generatePassword } from '#/data/queries'
import { provisionCredentialWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import { WizardDialog, statusOf } from '../WizardDialog'

const DEFAULT_TEMPLATE = 'username={{username}}\npassword={{password}}'

export function BaitCredentialDialog({ targets, isOpen, onOpenChange }: { targets: string[]; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  // Planting invalidates the credential and token reads (data/writes.ts).
  const provision = useDataMutation(provisionCredentialWrite())
  const blank = () => ({ target: targets[0] ?? '', path: '', username: '', password: generatePassword(), memo: '', template: '' })
  const [form, setForm] = useState(blank)
  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm((f) => ({ ...f, ...patch }))
  const reset = (open: boolean) => {
    if (!open) setForm(blank())
    onOpenChange(open)
  }
  const preview = (form.template || DEFAULT_TEMPLATE).replaceAll('{{username}}', form.username || '…').replaceAll('{{password}}', form.password || '…')

  return (
    <WizardDialog
      title="Plant a bait credential"
      isOpen={isOpen}
      onOpenChange={reset}
      finishLabel="Plant credential"
      onFinish={async () => {
        await provision.mutateAsync([form])
      }}
      steps={[
        {
          label: 'Placement',
          errors: form.path.trim() ? {} : { path: 'Say which file to write, relative to the honeypot root.' },
          render: (shown) => (
            <FormLayout defaultOptionality="optional">
              <Selector label="Honeypot" options={targets} value={form.target} onChange={(target) => set({ target })} description="The filesystem the file is written into." />
              <TextInput label="Path" isRequired value={form.path} onChange={(path) => set({ path })} placeholder="home/mwagner/.aws/credentials" status={statusOf(shown, 'path')} />
            </FormLayout>
          ),
        },
        {
          label: 'Credential',
          errors: { ...(form.username.trim() ? {} : { username: 'Pick a username an intruder would try.' }), ...(form.password ? {} : { password: 'Set or generate a password.' }) },
          render: (shown) => (
            <FormLayout defaultOptionality="optional">
              <TextInput label="Username" isRequired value={form.username} onChange={(username) => set({ username })} placeholder="deploy" status={statusOf(shown, 'username')} />
              <HStack gap={2} vAlign="end">
                <StackItem size="fill">
                  <TextInput label="Password" isRequired value={form.password} onChange={(password) => set({ password })} status={statusOf(shown, 'password')} />
                </StackItem>
                <Button label="Generate" variant="secondary" onClick={() => set({ password: generatePassword() })} />
              </HStack>
              <TextArea label="Content template" rows={3} value={form.template} onChange={(template) => set({ template })} placeholder={DEFAULT_TEMPLATE} description="Use {{username}} and {{password}} as placeholders." />
            </FormLayout>
          ),
        },
        {
          label: 'Review',
          errors: {},
          render: () => (
            <FormLayout defaultOptionality="optional">
              <TextInput label="Memo" value={form.memo} onChange={(memo) => set({ memo })} placeholder="Why this bait exists" />
              <Card variant="muted" padding={3}>
                <MetadataList orientation="vertical">
                  <MetadataListItem label="Written to">{`${form.target}:/${form.path.replace(/^\//, '')}`}</MetadataListItem>
                  <MetadataListItem label="File content">
                    <Text type="code">{preview}</Text>
                  </MetadataListItem>
                </MetadataList>
              </Card>
              <Banner status="warning" title="This writes the file into the honeypot immediately" description="It is not a draft; rotate or remove it from the credential's page." />
            </FormLayout>
          ),
        },
      ]}
    />
  )
}
