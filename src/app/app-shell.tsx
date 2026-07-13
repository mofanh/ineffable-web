import { AppSidebar } from "@/features/workspace/app-sidebar"
import { RightSidebar } from "@/components/right-sidebar"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import {
  RIGHT_SIDEBAR_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  useRightSidebarResize,
} from "@/app/shell/use-right-sidebar-resize"
import { AppHeaderProvider, useAppHeader } from "@/app/shell/app-header-context"
import { useAppSession } from "@/features/auth/app-session"
import { cn } from "@/lib/utils"
import { defaultPath, getRouteMeta } from "@/routes/navigation"
import type { BreadcrumbEntry } from "@/routes/navigation"
import { Fragment, useCallback, useEffect, useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import type { CSSProperties, SetStateAction } from "react"
import { PanelRightIcon } from "lucide-react"

export function AppShell() {
  return (
    <AppHeaderProvider>
      <AppShellContent />
    </AppHeaderProvider>
  )
}

function AppShellContent() {
  const { pathname } = useLocation()
  const { currentWorkspace, workspaces } = useAppSession()
  const [leftSidebarRight, setLeftSidebarRight] = useState(0)
  const [isRightSidebarFullScreen, setIsRightSidebarFullScreen] = useState(false)
  const routeMeta = getRouteMeta(pathname) ?? getRouteMeta(defaultPath)
  const breadcrumbs =
    getWorkspaceBreadcrumbs(pathname, currentWorkspace, workspaces) ??
    routeMeta?.breadcrumbs ??
    [{ label: "自动任务" }]
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
  }, [])

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
              <SidebarTrigger className="-ml-1" />
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
                aria-label={isRightSidebarOpen ? "收起 AI 助手" : "打开 AI 助手"}
                title={isRightSidebarOpen ? "收起 AI 助手" : "打开 AI 助手"}
              >
                <PanelRightIcon />
              </Button>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 pt-0">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整 AI 助手宽度"
        tabIndex={isRightSidebarOpen && !isRightSidebarFullScreen ? 0 : -1}
        aria-valuemin={RIGHT_SIDEBAR_MIN_WIDTH}
        aria-valuemax={Math.round(rightSidebarMaxWidth)}
        aria-valuenow={Math.round(rightSidebarWidth)}
        onPointerDown={startRightSidebarResize}
        onKeyDown={handleRightSidebarResizeKeyDown}
        onDoubleClick={() => setRightSidebarWidth(RIGHT_SIDEBAR_DEFAULT_WIDTH)}
        style={{ right: `${rightSidebarWidth}px` }}
        className={cn(
          "fixed inset-y-0 z-20 hidden w-2 translate-x-1/2 touch-none cursor-col-resize bg-transparent focus-visible:outline-2 focus-visible:outline-ring md:block",
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
        className="w-auto"
        style={
          {
            "--sidebar-width": rightSidebarCssWidth,
            "--sidebar-width-gap": rightSidebarGapWidth,
            "--sidebar-width-icon": "0rem",
          } as CSSProperties
        }
      >
        <RightSidebar
          isFullScreen={isRightSidebarFullScreen}
          onFullScreenChange={setIsRightSidebarFullScreen}
        />
      </SidebarProvider>
    </div>
  )
}

export default AppShell

function getWorkspaceBreadcrumbs(
  pathname: string,
  currentWorkspace: ReturnType<typeof useAppSession>["currentWorkspace"],
  workspaces: ReturnType<typeof useAppSession>["workspaces"]
): BreadcrumbEntry[] | null {
  if (pathname === "/team-spaces/new") {
    return [{ label: "团队空间" }, { label: "创建空间" }]
  }

  if (pathname === "/notifications") {
    return [{ label: "邀请通知" }]
  }

  const membersMatch = pathname.match(/^\/team-spaces\/([^/]+)\/members$/)
  if (membersMatch) {
    const workspaceId = decodeURIComponent(membersMatch[1])
    const workspace =
      workspaces.find((candidate) => candidate.id === workspaceId) ??
      (currentWorkspace?.id === workspaceId ? currentWorkspace : null)
    return [
      { label: "团队空间" },
      {
        label: workspace?.name || "团队空间",
        path: `/team-spaces/${workspaceId}/members`,
      },
      { label: "成员管理" },
    ]
  }

  if (pathname.startsWith("/workspace-invitations/")) {
    return [{ label: "团队空间" }, { label: "邀请确认" }]
  }

  return null
}
