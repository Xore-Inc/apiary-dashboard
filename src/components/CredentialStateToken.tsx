import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { credentialStateOf } from '#/lib/credentialState'
import type { CredentialState } from '#/lib/credentialState'

const COLORS = {
  danger: 'red',
  warning: 'orange',
  muted: 'gray',
} as const satisfies Record<CredentialState['tone'], string>

/** The #3213 credential facts of one event as a single token (#271), or an
 * em dash for a sensor that does not carry them. */
export function CredentialStateToken({ event }: { event: { sensor: string; fields: Record<string, unknown> } }) {
  const state = credentialStateOf(event)
  if (!state) return <Text type="supporting">—</Text>
  return <Token label={state.label} size="sm" color={COLORS[state.tone]} />
}
