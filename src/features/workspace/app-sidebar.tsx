import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { BellIcon, ChevronDownIcon, FolderOpenIcon, LogOutIcon, MoreHorizontalIcon, PlusIcon, UsersIcon, ZapIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { IneffableLogo } from "@/components/ineffable-logo"
import { useAuthSession, useWorkspaceSession } from "@/features/auth/app-session"
import { listIncomingWorkspaceInvitations } from "@/features/workspace/api/workspace-api"
import { useApiResource } from "@/lib/app/use-api-resource"
import { getLogoName, useLogoVariant } from "@/hooks/use-logo"
import { SidebarSettingsButton } from "./components/sidebar-settings-button"
import { SidebarNavigationScroll } from "./components/sidebar-navigation-scroll"

function WorkspaceAccountSwitcher({
  user,
  pendingInvitationCount,
  onLogout,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  pendingInvitationCount: number
  onLogout?: () => void
}) {
  const { t } = useTranslation()
  const { isCompact, setOpenCompact } = useSidebar()
  const fallback = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs">{user.email}</span>
          </div>
          <ChevronDownIcon className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 min-w-64"
        side={isCompact ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/notifications" onClick={() => { if (isCompact) setOpenCompact(false) }}>
              <BellIcon />
              <span>{t("sidebar.account.invitations")}</span>
              {pendingInvitationCount > 0 ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {pendingInvitationCount > 99 ? "99+" : pendingInvitationCount}
                </span>
              ) : null}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/login"
            onClick={(event) => {
              if (!onLogout) {
                return
              }

              event.preventDefault()
              onLogout()
            }}
          >
            <LogOutIcon />
            <span>{t("sidebar.account.logout")}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarBrand() {
  const { t } = useTranslation()
  const logoVariant = useLogoVariant({ mode: "rotate" })
  const { isCompact, setOpenCompact } = useSidebar()
  return <div className="flex h-[60px] shrink-0 items-center gap-1 px-2 group-data-[collapsible=icon]:px-0">
    <Link to="/chat" onClick={() => { if (isCompact) setOpenCompact(false) }} aria-label="Ineffable" title={`Ineffable · ${getLogoName(logoVariant)}`} className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
      <IneffableLogo variant={logoVariant} className="h-8 w-auto max-w-[132px]" />
    </Link>
    <SidebarTrigger aria-label={t("shell.sidebar.toggle")} title={t("shell.sidebar.toggle")} className="ml-auto group-data-[collapsible=icon]:mx-auto" />
  </div>
}

function SidebarWorkspaceRoots() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { workspaces } = useWorkspaceSession()
  const { isCompact, setOpenCompact } = useSidebar()
  return <section data-slot="workspace-navigation" className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
    <div className="flex h-9 items-center gap-1 px-2">
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{t("workbench.resources")}</span>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t("interaction.spaceMenu")}><MoreHorizontalIcon /></Button></DropdownMenuTrigger><DropdownMenuContent>
        <DropdownMenuItem asChild><Link to="/team-spaces" onClick={() => { if (isCompact) setOpenCompact(false) }}>{t("interaction.manageSpaces")}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/team-spaces?status=archived" onClick={() => { if (isCompact) setOpenCompact(false) }}>{t("workspaceLifecycle.archived")}</Link></DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
      <Button variant="ghost" size="icon-sm" asChild><Link to="/team-spaces/new" onClick={() => { if (isCompact) setOpenCompact(false) }} aria-label={t("shell.breadcrumbs.createSpace")}><PlusIcon /></Link></Button>
    </div>
    {workspaces.map(workspace => <Link key={workspace.id} to={`/workspace/${workspace.id}/objects`} aria-current={pathname.startsWith(`/workspace/${workspace.id}/objects`) ? "page" : undefined} onClick={() => { if (isCompact) setOpenCompact(false) }} className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent focus-visible:outline-ring">
      {workspace.workspace_type === "team" ? <UsersIcon className="size-4 shrink-0 text-muted-foreground" /> : <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />}
      <span className="truncate" title={workspace.name}>{workspace.name}</span>
      <span className="sr-only">{t(workspace.workspace_type === "team" ? "sidebar.sections.team" : "sidebar.sections.personal")}</span>
    </Link>)}
  </section>
}

function SidebarGlobalNavigation() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { isCompact, setOpenCompact } = useSidebar()
  return <SidebarMenu className="px-2 py-1"><SidebarMenuItem>
    <SidebarMenuButton asChild isActive={pathname.startsWith("/automation")} tooltip={t("sidebar.navigation.automation")}>
      <Link to="/automation" aria-current={pathname.startsWith("/automation") ? "page" : undefined} onClick={() => { if (isCompact) setOpenCompact(false) }}><ZapIcon /><span>{t("sidebar.navigation.automation")}</span></Link>
    </SidebarMenuButton>
  </SidebarMenuItem></SidebarMenu>
}

export function AppSidebar({ children, actions, ...props }: React.ComponentProps<typeof Sidebar> & { actions?: React.ReactNode }) {
  const { t } = useTranslation()
  const { accessToken, currentSessionId, currentUser, logout } = useAuthSession()
  const invitations = useApiResource({ enabled: Boolean(accessToken), cacheKey: ["workspace-invitations", currentSessionId], load: React.useCallback(() => listIncomingWorkspaceInvitations(accessToken!), [accessToken]) })
  return <Sidebar variant="sidebar" {...props}>
    <SidebarHeader className="gap-0 px-2 py-0"><SidebarBrand />{actions}</SidebarHeader>
    <SidebarContent className="gap-0 overflow-hidden px-0 [container-type:size]">
      <SidebarNavigationScroll global={<SidebarGlobalNavigation />}>
        <SidebarWorkspaceRoots />{children}
      </SidebarNavigationScroll>
    </SidebarContent>
    <SidebarFooter className="gap-1 px-2 pb-2 pt-1">
      <SidebarSettingsButton />
      <SidebarMenu><SidebarMenuItem><WorkspaceAccountSwitcher user={{ name: currentUser?.display_name || currentUser?.email || t("sidebar.account.fallbackUser"), email: currentUser?.email || t("sidebar.account.signedOut"), avatar: currentUser?.avatar_url || "" }} pendingInvitationCount={invitations.data?.invitations.filter(item => item.invitation.status === "pending").length ?? 0} onLogout={() => { void logout() }} /></SidebarMenuItem></SidebarMenu>
    </SidebarFooter>
  </Sidebar>
}
