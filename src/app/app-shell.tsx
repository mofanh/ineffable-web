import { AppSidebar } from "@/features/workspace/app-sidebar"
import { RouteLoading } from "@/components/app/route-loading"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  useRightSidebarResize,
} from "@/app/shell/use-right-sidebar-resize"
import { AppHeaderProvider, useAppHeader } from "@/app/shell/app-header-context"
import { useWorkspaceSession } from "@/features/auth/app-session"
import { useIsCompactLayout } from "@/hooks/use-compact-layout"
import type { Workspace } from "@/features/workspace/api/workspace-api"
import { cn } from "@/lib/utils"
import { defaultPath, getRouteMeta } from "@/routes/navigation"
import type { BreadcrumbEntry } from "@/routes/navigation"
import { Fragment, Suspense, lazy, useCallback, useEffect, useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import type { CSSProperties, SetStateAction } from "react"
import { PanelRightIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

const RightSidebar = lazy(async () => ({
  default: (await import("@/components/right-sidebar")).RightSidebar,
}))

export function AppShell() {
  return (
    <AppHeaderProvider>
      <AppShellContent />
    </AppHeaderProvider>
  )
}

function AppShellContent() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { currentWorkspace, workspaces } = useWorkspaceSession()
  const isCompactLayout = useIsCompactLayout()
  const [leftSidebarRight, setLeftSidebarRight] = useState(0)
  const [isRightSidebarFullScreen, setIsRightSidebarFullScreen] = useState(false)
  const routeMeta = getRouteMeta(pathname) ?? getRouteMeta(defaultPath)
  const breadcrumbs =
    getWorkspaceBreadcrumbs(pathname, currentWorkspace, workspaces, t) ??
    routeMeta?.breadcrumbs ??
    [{ label: t("shell.routes.automation") }]
  const { headerContent } = useAppHeader()
  const {
    isRightSidebarOpen,
    rightSidebarWidth,
    rightSidebarMaxWidth,
    rightSidebarReservedWidth,
    setIsRightSidebarOpen,
    setRightSidebarWidth,
    startRightSidebarResize,
    handleRightSidebarResizeKeyDown,
  } = useRightSidebarResize(leftSidebarRight)

  const setRightSidebarOpen = useCallback(
    (value: SetStateAction<boolean>) => {
      setIsRightSidebarOpen((currentOpen) => {
        const nextOpen = typeof value === "function" ? value(currentOpen) : value
        if (!nextOpen) {
          setIsRightSidebarFullScreen(false)
        }
        return nextOpen
      })
    },
    [setIsRightSidebarOpen]
  )

  useEffect(() => {
    const leftSidebarGap = document.querySelector<HTMLElement>(
      '[data-slot="sidebar"][data-side="left"] [data-slot="sidebar-gap"]'
    )

    function updateLeftSidebarRight() {
      const nextRight = leftSidebarGap?.getBoundingClientRect().right ?? 0
      setLeftSidebarRight(Math.max(0, Math.round(nextRight)))
    }

    updateLeftSidebarRight()

    const resizeObserver =
      leftSidebarGap && "ResizeObserver" in window
        ? new ResizeObserver(updateLeftSidebarRight)
        : null
    if (leftSidebarGap) {
      resizeObserver?.observe(leftSidebarGap)
    }
    leftSidebarGap?.addEventListener("transitionend", updateLeftSidebarRight)
    window.addEventListener("resize", updateLeftSidebarRight)

    return () => {
      resizeObserver?.disconnect()
      leftSidebarGap?.removeEventListener("transitionend", updateLeftSidebarRight)
      window.removeEventListener("resize", updateLeftSidebarRight)
    }
  }, [isCompactLayout])

  useEffect(() => {
    function handleOpenRightSidebar() {
      setRightSidebarOpen(true)
    }

    window.addEventListener("ineffable:right-sidebar:open", handleOpenRightSidebar)
    return () => {
      window.removeEventListener("ineffable:right-sidebar:open", handleOpenRightSidebar)
    }
  }, [setRightSidebarOpen])

  const rightSidebarCssWidth = isRightSidebarFullScreen
    ? "100vw"
    : `${rightSidebarWidth}px`
  const rightSidebarGapWidth = isRightSidebarFullScreen
    ? "0px"
    : `${rightSidebarReservedWidth}px`

  return (
    <div className="relative flex min-h-svh w-full bg-sidebar">
      <SidebarProvider className="min-w-0">
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 bg-background px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger
                className="-ml-1"
                aria-label={t("shell.sidebar.toggle")}
                title={t("shell.sidebar.toggle")}
              />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              {headerContent?.leading ? (
                headerContent.leading
              ) : (
                <Breadcrumb>
                  <BreadcrumbList>
                    {breadcrumbs.map((crumb, index) => {
                      const isLast = index === breadcrumbs.length - 1

                      return (
                        <Fragment key={`${crumb.label}-${index}`}>
                          <BreadcrumbItem>
                            {isLast ? (
                              <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                            ) : crumb.path ? (
                              <BreadcrumbLink asChild>
                                <Link to={crumb.path}>{crumb.label}</Link>
                              </BreadcrumbLink>
                            ) : (
                              <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                            )}
                          </BreadcrumbItem>
                          {!isLast ? <BreadcrumbSeparator /> : null}
                        </Fragment>
                      )
                    })}
                  </BreadcrumbList>
                </Breadcrumb>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {headerContent?.trailing}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setRightSidebarOpen((open) => !open)}
                aria-label={
                  isRightSidebarOpen
                    ? t("shell.assistant.close")
                    : t("shell.assistant.open")
                }
                title={
                  isRightSidebarOpen
                    ? t("shell.assistant.close")
                    : t("shell.assistant.open")
                }
              >
                <PanelRightIcon />
              </Button>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 pt-0">
            <Suspense fallback={<RouteLoading className="pt-4" />}>
              <Outlet />
            </Suspense>
          </main>
        </SidebarInset>
      </SidebarProvider>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("shell.assistant.resize")}
        tabIndex={isRightSidebarOpen && !isRightSidebarFullScreen ? 0 : -1}
        aria-valuemin={RIGHT_SIDEBAR_MIN_WIDTH}
        aria-valuemax={Math.round(rightSidebarMaxWidth)}
        aria-valuenow={Math.round(rightSidebarWidth)}
        onPointerDown={startRightSidebarResize}
        onKeyDown={handleRightSidebarResizeKeyDown}
        onDoubleClick={() => setRightSidebarWidth(RIGHT_SIDEBAR_DEFAULT_WIDTH)}
        style={{ right: `${rightSidebarWidth}px` }}
        className={cn(
          "fixed inset-y-0 z-20 hidden w-2 translate-x-1/2 touch-none cursor-col-resize bg-transparent focus-visible:outline-2 focus-visible:outline-ring lg:block",
          isRightSidebarOpen && !isRightSidebarFullScreen
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        )}
      />

      <SidebarProvider
        defaultOpen
        open={isRightSidebarOpen}
        onOpenChange={setRightSidebarOpen}
        persistCookie={false}
        keyboardShortcut={false}
        className="w-auto"
        style={
          {
            "--sidebar-width": rightSidebarCssWidth,
            "--sidebar-width-gap": rightSidebarGapWidth,
            "--sidebar-width-icon": "0rem",
          } as CSSProperties
        }
      >
        <Suspense fallback={<RightSidebarLoading />}>
          <RightSidebar
            isFullScreen={isRightSidebarFullScreen}
            onFullScreenChange={setIsRightSidebarFullScreen}
          />
        </Suspense>
      </SidebarProvider>
    </div>
  )
}

export default AppShell

function RightSidebarLoading() {
  const { t } = useTranslation()

  return (
    <Sidebar side="right" variant="inset" compactMode="full" className="p-0">
      <div
        role="status"
        aria-label={t("shell.assistant.loading")}
        className="space-y-4 p-4"
      >
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <span className="sr-only">{t("shell.assistant.loading")}...</span>
      </div>
    </Sidebar>
  )
}

function getWorkspaceBreadcrumbs(
  pathname: string,
  currentWorkspace: Workspace | null,
  workspaces: Workspace[],
  t: TFunction
): BreadcrumbEntry[] | null {
  if (pathname === "/team-spaces/new") {
    return [
      { label: t("shell.breadcrumbs.teamSpaces") },
      { label: t("shell.breadcrumbs.createSpace") },
    ]
  }

  if (pathname === "/notifications") {
    return [{ label: t("shell.breadcrumbs.invitations") }]
  }

  const membersMatch = pathname.match(/^\/team-spaces\/([^/]+)\/members$/)
  if (membersMatch) {
    const workspaceId = decodeURIComponent(membersMatch[1])
    const workspace =
      workspaces.find((candidate) => candidate.id === workspaceId) ??
      (currentWorkspace?.id === workspaceId ? currentWorkspace : null)
    return [
      { label: t("shell.breadcrumbs.teamSpaces") },
      {
        label: workspace?.name || t("shell.breadcrumbs.teamSpaces"),
        path: `/team-spaces/${workspaceId}/members`,
      },
      { label: t("shell.breadcrumbs.members") },
    ]
  }

  if (pathname.startsWith("/workspace-invitations/")) {
    return [
      { label: t("shell.breadcrumbs.teamSpaces") },
      { label: t("shell.breadcrumbs.invitationConfirm") },
    ]
  }

  return null
}
