import { DropdownMenu, DropdownMenuItem } from '@astryxdesign/core/DropdownMenu'
import { Icon } from '@astryxdesign/core/Icon'
import {
  SideNav,
  SideNavItem,
  SideNavSection,
  useSideNavCollapse,
} from '@astryxdesign/core/SideNav'
import {
  AdjustmentsHorizontalIcon,
  ArrowRightStartOnRectangleIcon,
  ClockIcon,
  Cog6ToothIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import type { SessionUser, ShellConfig } from '#/data/types'
import { NAV_SECTIONS, navHrefFor } from '#/lib/nav'
import { usePreferences } from '#/lib/prefs'
import { useQueryClient } from '@tanstack/react-query'
import { preferencesQuery } from '#/data/resources'
import { savePreferencesWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import { hrefForRecent, labelForRecent, useRecentInvestigations } from '#/lib/recent'

function AccountMenu({ user, onOpenSettings }: { user: SessionUser; onOpenSettings: () => void }) {
  // A collapsed sidebar has room for the icon only; the name stays the label.
  const { isCollapsed } = useSideNavCollapse()

  return (
    <DropdownMenu
      placement="above"
      button={{
        label: user.name,
        icon: <Icon icon={UserCircleIcon} size="sm" />,
        variant: 'ghost',
        ...(isCollapsed ? { isIconOnly: true } : { width: '100%' }),
      }}
    >
      <DropdownMenuItem
        label="Settings"
        icon={Cog6ToothIcon}
        onClick={onOpenSettings}
      />
      <DropdownMenuItem label="Sign out" icon={ArrowRightStartOnRectangleIcon} onClick={() => window.location.assign('/auth/logout')} />
    </DropdownMenu>
  )
}

export function ShellSideNav({ user, config, onOpenSettings, actions }: { user: SessionUser; config: ShellConfig; onOpenSettings: () => void; actions?: ReactNode }) {
  const prefs = usePreferences()
  const queryClient = useQueryClient()
  const savePrefs = useDataMutation(savePreferencesWrite())
  // The stored preferences, not usePreferences' resolved view (its "browser"
  // time zone is already a zone): saving that would pin the zone.
  const collapse = (collapsedSidebar: boolean) => {
    const stored = queryClient.getQueryData(preferencesQuery().queryKey)
    if (stored) savePrefs.mutate({ ...stored, collapsedSidebar })
  }
  const pathname = useLocation({ select: (location) => location.pathname })
  const activeHref = navHrefFor(pathname)
  const recent = useRecentInvestigations()
  const isAdmin = user.roles.includes('admin')

  return (
    <SideNav
      // Collapsing is remembered: it is the same preference as Settings'
      // "Start with the sidebar collapsed".
      collapsible={{ defaultIsCollapsed: prefs?.collapsedSidebar ?? false, onCollapsedChange: collapse }}
      resizable={{ defaultWidth: 260, minWidth: 220, maxWidth: 360 }}
      footer={
        <SideNavSection title="Account" isHeaderHidden>
          {/* What affects everyone: admins only, beside the account. */}
          {isAdmin && <SideNavItem label="Administration" icon={AdjustmentsHorizontalIcon} href="/admin" isSelected={pathname === '/admin'} />}
          <AccountMenu user={user} onOpenSettings={onOpenSettings} />
        </SideNavSection>
      }
      footerIcons={actions}
    >
      {NAV_SECTIONS.map((section) => (
        <SideNavSection key={section.label} title={section.label}>
          {/* ML pages hide with the ML panels switch. */}
          {section.items.filter((item) => config.behavior.showMlPanels || item.to !== '/ml-anomalies').map((item) => (
            <SideNavItem
              key={item.to}
              label={item.label}
              icon={item.icon}
              href={item.to}
              isSelected={item.to === activeHref}
            />
          ))}
        </SideNavSection>
      ))}
      {recent.length > 0 && (
        <SideNavSection title="Recent">
          {recent.map((entry) => (
            <SideNavItem key={`${entry.kind}:${entry.value}`} label={labelForRecent(entry)} icon={ClockIcon} href={hrefForRecent(entry)!} />
          ))}
        </SideNavSection>
      )}
    </SideNav>
  )
}
