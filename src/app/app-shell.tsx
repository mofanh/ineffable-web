import { Fragment, Suspense, memo, useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties, Dispatch, SetStateAction } from "react"
import type { TFunction } from "i18next"
import type { Workspace } from "@/features/workspace/api/workspace-api"
import type { BreadcrumbEntry } from "@/routes/navigation"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
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
import { defaultPath, getRouteKind, getRouteMeta } from "@/routes/navigation"

import { DRAWER_BREAKPOINT, CENTER_MIN, SIDEBAR_MIN, SIDEBAR_MAX, RIGHT_MIN, RIGHT_MAX_RATIO, computeWorkbenchColumns } from "@/app/shell/workbench-layout"
import { useWorkbenchLayout } from "@/app/shell/use-workbench-layout"
import { WorkbenchResizeHandle } from "@/app/shell/workbench-resize-handle"
import { SettingsOverlayProvider } from "@/app/shell/settings-overlay-context"

type WorkbenchView = { path: string; open: boolean; focused: boolean }

const NavigationSidebar = memo(AppSidebar)

export function AppShell() {
  const compact = useIsCompactLayout()
  const viewport = useVisualViewport(compact)
  const { pathname } = useLocation()
  const [view, setView] = useState<WorkbenchView>({ path: pathname, open: true, focused: false })
  const resourceOpen = getRouteKind(pathname) === "resource" && (view.path !== pathname || view.open)
  const layout = useWorkbenchLayout(resourceOpen ? pathname : null)
  const drawer = layout.width < DRAWER_BREAKPOINT
  const expanded = layout.open
  const columns = computeWorkbenchColumns(layout.width, expanded, layout.sidebar, layout.right, resourceOpen)
  return (
    <AppHeaderProvider>
      <SettingsOverlayProvider>
      <SidebarProvider compact={drawer} independentCompact open={expanded} onOpenChange={layout.setOpen} persistCookie={false} className="relative h-svh min-h-0 overflow-hidden" style={{ "--sidebar-width": `${drawer ? layout.sidebar : columns.sidebar}px`, "--sidebar-width-icon": "56px", "--sidebar-duration": "0ms", ...(compact && viewport ? { height: viewport.height, transform: `translateY(${viewport.offsetTop}px)` } : {}) } as CSSProperties}>
        <WorkbenchContent layout={layout} columns={columns} view={view} setView={setView} />
      </SidebarProvider>
      </SettingsOverlayProvider>
    </AppHeaderProvider>
  )
}

function WorkbenchContent({ layout, columns, view, setView }: { layout: ReturnType<typeof useWorkbenchLayout>; columns: ReturnType<typeof computeWorkbenchColumns>; view: WorkbenchView; setView: Dispatch<SetStateAction<WorkbenchView>> }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const kind = getRouteKind(pathname)
  const { setOpenCompact, open: navigationExpanded } = useSidebar()
  const drawer = layout.width < DRAWER_BREAKPOINT
  const { currentWorkspace, workspaces } = useWorkspaceSession()
  const { headerContent } = useAppHeader()
  const breadcrumbs = headerContent?.breadcrumbs
    ?? getWorkspaceBreadcrumbs(pathname, currentWorkspace, workspaces, t)
    ?? getRouteMeta(pathname)?.breadcrumbs
    ?? []
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null)
  const [navigationTarget, setNavigationTarget] = useState<HTMLDivElement | null>(null)
  const [navigationActionsTarget, setNavigationActionsTarget] = useState<HTMLDivElement | null>(null)
  const conversationSlot = useMemo(() => <div ref={setNavigationTarget} data-slot="conversation-navigation" />, [])
  const conversationActionsSlot = useMemo(() => <div ref={setNavigationActionsTarget} data-slot="conversation-navigation-actions" className="shrink-0 pb-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center" />, [])
  // Panel preferences are local view state, never conversation/run ownership.
  // A new deep link opens its resource; hiding/focusing keeps the Outlet mounted.
  const hasResource = kind === "resource"
  const global = kind === "global"
  const resourceOpen = hasResource && (view.path !== pathname || view.open)
  const compact = columns.right === 0
  const resourceFocused = resourceOpen && (compact || (view.path === pathname && view.focused))
  // Preserve the interacted surface and its portals when side-by-side space disappears.
  const [compactChat, setCompactChat] = useState<string | null>(null)
  const showResource = global || (resourceOpen && (!compact || compactChat !== pathname))
  const showChat = !global && (!showResource || !resourceFocused)

  const revealChat = useCallback(() => {
    if (global) navigate(defaultPath)
    else {
      setView({ path: pathname, open: true, focused: false })
      setCompactChat(pathname)
    }
    if (drawer) setOpenCompact(false)
  }, [pathname, global, navigate, drawer, setOpenCompact, setView])

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
      <NavigationSidebar collapsible="icon" actions={conversationActionsSlot}>{conversationSlot}</NavigationSidebar>
      {!drawer && navigationExpanded ? <WorkbenchResizeHandle label={t("workbench.resizeNavigation")} value={columns.sidebar} min={SIDEBAR_MIN} max={Math.min(SIDEBAR_MAX, layout.width - CENTER_MIN)} onPreview={sidebar => layout.updatePreview({ sidebar })} onChange={sidebar => layout.update({ sidebar })} className="left-(--sidebar-width) -translate-x-1/2" /> : null}
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1">
          {/* This position never changes across routes or panel/viewport changes. */}
          <section aria-label={t("workbench.conversations")} data-slot="chat-workbench" onPointerDownCapture={() => setCompactChat(pathname)} onFocusCapture={() => setCompactChat(pathname)} className={cn("min-h-0 min-w-0 flex-1 flex-col", showChat ? "flex" : "hidden")}>
            <header data-slot="workbench-conversation-header" className="flex h-12 shrink-0 items-center gap-1 border-b pr-3 pl-5">
              {drawer ? <SidebarTrigger aria-label={t("shell.sidebar.toggle")} title={t("shell.sidebar.toggle")} /> : null}
              <div ref={setHeaderTarget} data-slot="conversation-header-content" className="flex min-w-0 flex-1 items-center" />
              {hasResource ? (
                <Button variant="ghost" size="icon-sm" onClick={openResource} aria-label={t("workbench.resources")} title={t("workbench.resources")} aria-pressed={showResource}>
                  <FolderOpenIcon />
                </Button>
              ) : currentWorkspace ? (
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link to={`/workspace/${currentWorkspace.id}/objects`} aria-label={t("workbench.resources")} title={t("workbench.resources")}><FolderOpenIcon /></Link>
                </Button>
              ) : null}
            </header>
            <ChatWorkbench headerTarget={headerTarget} navigationActionsTarget={navigationActionsTarget} navigationTarget={navigationTarget} onReveal={revealChat} />
          </section>
          <section aria-label={t("workbench.resources")} data-slot="resource-workbench" onPointerDownCapture={() => setCompactChat(null)} onFocusCapture={() => setCompactChat(null)} className={cn(
            "relative min-h-0 min-w-0 flex-col overflow-hidden bg-background",
            showResource ? "flex" : "hidden",
            showChat ? "shrink-0 border-l" : "flex-1",
          )} style={showChat && showResource ? { width: columns.right } : undefined}>
            {showChat && showResource ? <WorkbenchResizeHandle label={t("workbench.resizeResource")} value={columns.right} min={RIGHT_MIN} max={Math.min(layout.width * RIGHT_MAX_RATIO, layout.width - columns.sidebar - CENTER_MIN)} direction={-1} onPreview={right => layout.updatePreview({ right })} onChange={right => layout.update({ right })} className="left-0" /> : null}
            <header data-slot="workbench-resource-header" className="flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b px-3 py-1">
              {!showChat && drawer ? <SidebarTrigger aria-label={t("shell.sidebar.toggle")} title={t("shell.sidebar.toggle")} /> : null}
              {!showChat ? <Button variant="ghost" size="icon-sm" onClick={revealChat} aria-label={t("workbench.conversations")} title={t("workbench.conversations")}><MessageSquareTextIcon /></Button> : null}
              <div className="min-w-0 flex-1 basis-48 truncate text-sm font-medium">
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
              {hasResource && !compact ? <Button variant="ghost" size="icon-sm" onClick={() => setView({ path: pathname, open: true, focused: !resourceFocused })} aria-label={t(resourceFocused ? "workbench.split" : "workbench.focus")} title={t(resourceFocused ? "workbench.split" : "workbench.focus")}>
                {resourceFocused ? <Minimize2Icon /> : <Maximize2Icon />}
              </Button> : null}
              {hasResource ? <Button variant="ghost" size="icon-sm" onClick={() => setView({ path: pathname, open: false, focused: false })} aria-label={t("workbench.closeResource")} title={t("workbench.closeResource")}><XIcon /></Button> : null}
            </header>
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              <Suspense fallback={<RouteLoading />}><Outlet /></Suspense>
            </div>
          </section>
        </div>
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
