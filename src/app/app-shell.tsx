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
  useRightSidebarResize,
} from "@/app/shell/use-right-sidebar-resize"
import { AppHeaderProvider, useAppHeader } from "@/app/shell/app-header-context"
import { cn } from "@/lib/utils"
import { defaultPath, getRouteMeta } from "@/routes/navigation"
import { Fragment } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import type { CSSProperties } from "react"
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
  const routeMeta = getRouteMeta(pathname) ?? getRouteMeta(defaultPath)
  const breadcrumbs = routeMeta?.breadcrumbs ?? [{ label: "World 控制台" }]
  const { headerContent } = useAppHeader()
  const {
    isRightSidebarOpen,
    rightSidebarWidth,
    setIsRightSidebarOpen,
    setRightSidebarWidth,
    startRightSidebarResize,
  } = useRightSidebarResize()

  return (
    <div className="flex min-h-svh w-full bg-sidebar">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-4">
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
                onClick={() => setIsRightSidebarOpen((open) => !open)}
                aria-label="Toggle right sidebar"
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
        aria-label="Resize right sidebar"
        onMouseDown={startRightSidebarResize}
        onDoubleClick={() => setRightSidebarWidth(RIGHT_SIDEBAR_DEFAULT_WIDTH)}
        className={cn(
          "relative hidden w-1 shrink-0 cursor-col-resize bg-sidebar md:flex",
          isRightSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <SidebarProvider
        defaultOpen
        open={isRightSidebarOpen}
        onOpenChange={setIsRightSidebarOpen}
        className="w-auto"
        style={
          {
            "--sidebar-width": `${rightSidebarWidth}px`,
            "--sidebar-width-icon": "0rem",
          } as CSSProperties
        }
      >
        <RightSidebar />
      </SidebarProvider>
    </div>
  )
}

export default AppShell
