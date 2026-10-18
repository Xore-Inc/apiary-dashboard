import { useState } from 'react'
import { ConfirmDialog } from '#/components/AppDialog'
import { Button } from '@astryxdesign/core/Button'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useRouter } from '@tanstack/react-router'
import { setIpBlocked } from '#/data/queries'
import { describeError } from '#/lib/actionError'
import { useIsAdmin } from '#/lib/session'

/** How long a block lasts, as the `expires_days` the endpoint takes
 * (0 = permanent). A block always names one: the backend refuses without. */
export const BLOCK_DURATIONS = [
  { value: '1', days: 1, label: '1 day' },
  { value: '7', days: 7, label: '7 days' },
  { value: '30', days: 30, label: '30 days' },
  { value: '0', days: 0, label: 'Permanent' },
] as const

export const DEFAULT_BLOCK_DAYS = 7

/** Add or remove an address on the portbridge manual blackhole list. */
export function BlockControl({ ip, blocked }: { ip: string; blocked: boolean }) {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [days, setDays] = useState<number>(DEFAULT_BLOCK_DAYS)
  // Viewers cannot block, so they are not offered to.
  if (!isAdmin) return null
  return (
    <HStack gap={2} vAlign="center">
      <Button
        label={blocked ? 'Unblock' : 'Block at portbridge'}
        size="sm"
        variant={blocked ? 'secondary' : 'destructive'}
        onClick={() => setConfirmOpen(true)}
      />
      {error && <FieldStatus type="error" variant="detached" message={error} />}
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (open) setDays(DEFAULT_BLOCK_DAYS)
        }}
        title={blocked ? `Unblock ${ip}?` : `Block ${ip}?`}
        description={
          blocked ? (
            'Removes the address from the manual blackhole list. New connections reach the sensors again.'
          ) : (
            <VStack gap={3}>
              <Text>Drops new connections from this address at portbridge. Nothing already logged is affected.</Text>
              <SegmentedControl label="Block duration" value={String(days)} onChange={(value) => setDays(Number(value))}>
                {BLOCK_DURATIONS.map((d) => (
                  <SegmentedControlItem key={d.value} value={d.value} label={d.label} />
                ))}
              </SegmentedControl>
            </VStack>
          )
        }
        actionLabel={blocked ? 'Unblock' : 'Block'}
        actionVariant={blocked ? 'primary' : 'destructive'}
        isActionLoading={busy}
        onAction={async () => {
          setBusy(true)
          setError(undefined)
          try {
            await setIpBlocked(ip, !blocked, blocked ? undefined : days)
            await router.invalidate()
          } catch (e) {
            setError(describeError(e))
          } finally {
            setBusy(false)
            setConfirmOpen(false)
          }
        }}
      />
    </HStack>
  )
}
