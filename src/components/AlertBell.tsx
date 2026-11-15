import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/Stack'
import { BellIcon } from '@heroicons/react/24/outline'
import { useLocation } from '@tanstack/react-router'
import { openAlertCountQuery } from '#/data/resources'
import { useLiveInterval } from '#/lib/live'

/** Open alerts, as the canonical bell counts them: every minute while live
 * is on, and on a navigation once the count is older than its freshness
 * window (lib/query.ts). Acknowledging invalidates it, so it drops at once. */
function useOpenAlertCount(pathname: string): number | null {
  const queryClient = useQueryClient()
  const { data, isError } = useQuery(openAlertCountQuery())
  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: openAlertCountQuery().queryKey }, { cancelRefetch: false }), [queryClient])
  useLiveInterval(refresh, 60_000)
  // query() is a no-op while the count is fresh.
  useEffect(() => void queryClient.query(openAlertCountQuery()).catch(() => {}), [queryClient, pathname])
  return isError || data === undefined ? null : data
}

/** The top bar's bell: the open-alert count, and the way to Alerts. */
/** Compact: the drawer layout, sized for touch. */
export function AlertBell({ compact = false }: { compact?: boolean }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const open = useOpenAlertCount(pathname)
  const label = open ? `Alerts, ${open} open` : 'Alerts'
  return (
    <Button label={label} tooltip={label} variant="secondary" size={compact ? 'md' : 'sm'} href="/alerts" isIconOnly={!open} icon={open ? undefined : <Icon icon={BellIcon} size="sm" />}>
      {open ? (
        <HStack gap={1.5} vAlign="center">
          <Icon icon={BellIcon} size="sm" />
          <Badge variant="warning" label={open > 99 ? '99+' : open} />
        </HStack>
      ) : undefined}
    </Button>
  )
}
