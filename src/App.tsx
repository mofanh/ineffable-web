import { AppSidebar } from "@/components/app-sidebar"
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
import { cn } from "@/lib/utils"
import { defaultPath, getRouteMeta } from "@/routes/navigation"
import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import type { CSSProperties } from "react"
import { PanelRightIcon } from "lucide-react"

const RIGHT_SIDEBAR_DEFAULT_WIDTH = 384
const RIGHT_SIDEBAR_MIN_WIDTH = 300
const RIGHT_SIDEBAR_MAX_WIDTH = 640

export function App() {
  const { pathname } = useLocation()
  const routeMeta = getRouteMeta(pathname) ?? getRouteMeta(defaultPath)
  const breadcrumbs = routeMeta?.breadcrumbs ?? [{ label: "World 控制台" }]
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true
    }

    return window.innerWidth >= 768
  })
  const [rightSidebarWidth, setRightSidebarWidth] = useState(
    RIGHT_SIDEBAR_DEFAULT_WIDTH
  )
  const isResizingRightSidebarRef = useRef(false)

  const clampRightSidebarWidth = useCallback((rawWidth: number) => {
    const dynamicMax = Math.max(
      RIGHT_SIDEBAR_MIN_WIDTH,
      Math.min(RIGHT_SIDEBAR_MAX_WIDTH, window.innerWidth - 320)
    )
    return Math.min(dynamicMax, Math.max(RIGHT_SIDEBAR_MIN_WIDTH, rawWidth))
  }, [])

  const startRightSidebarResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isRightSidebarOpen) {
        return
      }

      isResizingRightSidebarRef.current = true
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      event.preventDefault()
    },
    [isRightSidebarOpen]
  )

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRightSidebarRef.current) {
        return
      }

      const nextWidth = clampRightSidebarWidth(window.innerWidth - event.clientX)
      setRightSidebarWidth(nextWidth)
    }

    const stopResize = () => {
      if (!isResizingRightSidebarRef.current) {
        return
      }

      isResizingRightSidebarRef.current = false
      document.body.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", stopResize)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", stopResize)
      stopResize()
    }
  }, [clampRightSidebarWidth])

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
            </div>

            <div className="flex">
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

export default App
