import { Fragment, Suspense, memo, useCallback, useEffect, useMemo, useState } from "react"
import type { TFunction } from "i18next"
import type { Workspace } from "@/features/workspace/api/workspace-api"
import type { BreadcrumbEntry } from "@/routes/navigation"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Link, Outlet, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { FolderOpenIcon, Maximize2Icon, Minimize2Icon, MessageSquareTextIcon, XIcon } from "lucide-react"

import { AppSidebar } from "@/features/workspace/app-sidebar"
import { ChatWorkbench } from "@/components/chat-workbench"
import { RouteLoading } from "@/components/app/route-loading"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { AppHeaderProvider, useAppHeader } from "@/app/shell/app-header-context"
import { useWorkspaceSession } from "@/features/auth/app-session"
import { useIsCompactLayout } from "@/hooks/use-compact-layout"
import { useVisualViewport } from "@/hooks/use-visual-viewport"
import { cn } from "@/lib/utils"
import { defaultPath, getRouteMeta } from "@/routes/navigation"

const NavigationSidebar = memo(AppSidebar)

export function AppShell() {
  const compact = useIsCompactLayout()
  const viewport = useVisualViewport(compact)
  return (
    <AppHeaderProvider>
      <SidebarProvider defaultOpen className="h-svh min-h-0 overflow-hidden" style={compact && viewport ? { height: viewport.height, transform: `translateY(${viewport.offsetTop}px)` } : undefined}>
        <WorkbenchContent />
      </SidebarProvider>
    </AppHeaderProvider>
  )
}

function WorkbenchContent() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const compact = useIsCompactLayout()
  const { setOpenCompact } = useSidebar()
  const { currentWorkspace, workspaces } = useWorkspaceSession()
  const { headerContent } = useAppHeader()
  const breadcrumbs = headerContent?.breadcrumbs
    ?? getWorkspaceBreadcrumbs(pathname, currentWorkspace, workspaces, t)
    ?? getRouteMeta(pathname)?.breadcrumbs
    ?? []
  const [navigationTarget, setNavigationTarget] = useState<HTMLDivElement | null>(null)
  const conversationSlot = useMemo(() => <div ref={setNavigationTarget} data-slot="conversation-navigation" className="flex max-h-1/2 min-h-0 shrink-0 flex-col" />, [])
  // Panel preferences are local view state, never conversation/run ownership.
  // A new deep link opens its resource; hiding/focusing keeps the Outlet mounted.
  const [view, setView] = useState({ path: pathname, open: true, focused: !pathname.startsWith("/workspace/") })
  const hasResource = pathname !== defaultPath
  const resourceOpen = hasResource && (view.path !== pathname || view.open)
  const resourceFocused = resourceOpen && (view.path !== pathname
    ? compact || !pathname.startsWith("/workspace/")
    : view.focused || compact)
  // Preserve the interacted surface across the breakpoint, including its portals.
  // A different resource route still opens that resource before any interaction.
  const [compactChat, setCompactChat] = useState<string | null>(null)
  const showResource = resourceOpen && (!compact || compactChat !== pathname)
  const showChat = !showResource || !resourceFocused

  const revealChat = useCallback(() => {
    setView({ path: pathname, open: true, focused: false })
    setCompactChat(pathname)
    if (compact) setOpenCompact(false)
  }, [pathname, compact, setOpenCompact])

  useEffect(() => {
    window.addEventListener("ineffable:right-sidebar:open", revealChat)
    return () => window.removeEventListener("ineffable:right-sidebar:open", revealChat)
  }, [revealChat])

  function openResource() {
    setCompactChat(null)
    setView({ path: pathname, open: true, focused: false })
  }

  return (
    <>
      <NavigationSidebar>{conversationSlot}</NavigationSidebar>
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger aria-label={t("shell.sidebar.toggle")} title={t("shell.sidebar.toggle")} />
          <Button variant="ghost" size="sm" onClick={revealChat} aria-pressed={showChat}>
            <MessageSquareTextIcon />{t("workbench.conversations")}
          </Button>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {hasResource ? (
              <Button variant="ghost" size="sm" onClick={openResource} aria-pressed={showResource} className="min-w-0">
                <FolderOpenIcon /><span className="truncate">{t("workbench.resources")}</span>
              </Button>
            ) : currentWorkspace ? (
              <Button variant="ghost" size="sm" asChild className="min-w-0">
                <Link to={`/workspace/${currentWorkspace.id}/objects`}><FolderOpenIcon /><span className="truncate">{t("workbench.resources")}</span></Link>
              </Button>
            ) : null}
          </div>
        </header>
        <main className="flex min-h-0 min-w-0 flex-1">
          {/* This position never changes across routes or panel/viewport changes. */}
          <section aria-label={t("workbench.conversations")} data-slot="chat-workbench" onPointerDownCapture={() => setCompactChat(pathname)} onFocusCapture={() => setCompactChat(pathname)} className={cn("min-h-0 min-w-0 flex-1 flex-col", showChat ? "flex" : "hidden")}>
            <ChatWorkbench navigationTarget={navigationTarget} onReveal={revealChat} />
          </section>
          <section aria-label={t("workbench.resources")} data-slot="resource-workbench" onPointerDownCapture={() => setCompactChat(null)} onFocusCapture={() => setCompactChat(null)} className={cn(
            "min-h-0 min-w-0 flex-col overflow-hidden bg-background",
            showResource ? "flex" : "hidden",
            showChat ? "w-[44%] min-w-96 border-l" : "flex-1",
          )}>
            <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b px-3 py-1">
              <div className="min-w-0 flex-1 truncate text-sm font-medium">
                {headerContent?.leading ?? (
                  <Breadcrumb className="min-w-0 overflow-hidden">
                    <BreadcrumbList className="flex-nowrap">
                      {breadcrumbs.map((crumb, index) => (
                        <Fragment key={`${crumb.label}-${index}`}>
                          <BreadcrumbItem className="min-w-0 shrink">
                            {index < breadcrumbs.length - 1 && crumb.path ? (
                              <BreadcrumbLink asChild><Link className="truncate" title={crumb.label} to={crumb.path}>{crumb.label}</Link></BreadcrumbLink>
                            ) : <BreadcrumbPage className="truncate" title={crumb.label}>{crumb.label}</BreadcrumbPage>}
                          </BreadcrumbItem>
                          {index < breadcrumbs.length - 1 ? <BreadcrumbSeparator /> : null}
                        </Fragment>
                      ))}
                    </BreadcrumbList>
                  </Breadcrumb>
                )}
              </div>
              {headerContent?.trailing}
              {!compact ? <Button variant="ghost" size="icon-sm" onClick={() => setView({ path: pathname, open: true, focused: !resourceFocused })} aria-label={t(resourceFocused ? "workbench.split" : "workbench.focus")} title={t(resourceFocused ? "workbench.split" : "workbench.focus")}>
                {resourceFocused ? <Minimize2Icon /> : <Maximize2Icon />}
              </Button> : null}
              <Button variant="ghost" size="icon-sm" onClick={() => setView({ path: pathname, open: false, focused: false })} aria-label={t("workbench.closeResource")} title={t("workbench.closeResource")}><XIcon /></Button>
            </header>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
              <Suspense fallback={<RouteLoading />}><Outlet /></Suspense>
            </div>
          </section>
        </main>
      </SidebarInset>
    </>
  )
}

// Retain workspace-specific context when a page does not supply its own crumbs.
function getWorkspaceBreadcrumbs(
  pathname: string,
  currentWorkspace: Workspace | null,
  workspaces: Workspace[],
  t: TFunction,
): BreadcrumbEntry[] | null {
  if (pathname === "/team-spaces/archived") {
    return [{ label: t("shell.breadcrumbs.teamSpaces") }, { label: t("workspaceLifecycle.archived") }]
  }
  if (pathname === "/team-spaces/new") {
    return [{ label: t("shell.breadcrumbs.teamSpaces") }, { label: t("shell.breadcrumbs.createSpace") }]
  }
  if (pathname === "/notifications") return [{ label: t("shell.breadcrumbs.invitations") }]
  const membersMatch = pathname.match(/^\/team-spaces\/([^/]+)\/members$/)
  if (membersMatch) {
    const workspaceId = decodeURIComponent(membersMatch[1])
    const workspace = workspaces.find(candidate => candidate.id === workspaceId)
      ?? (currentWorkspace?.id === workspaceId ? currentWorkspace : null)
    return [
      { label: t("shell.breadcrumbs.teamSpaces") },
      { label: workspace?.name || t("shell.breadcrumbs.teamSpaces"), path: `/team-spaces/${workspaceId}/members` },
      { label: t("shell.breadcrumbs.members") },
    ]
  }
  if (pathname.startsWith("/workspace-invitations/")) {
    return [{ label: t("shell.breadcrumbs.teamSpaces") }, { label: t("shell.breadcrumbs.invitationConfirm") }]
  }
  return null
}
