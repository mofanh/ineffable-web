import {
  BotIcon,
  FileTextIcon,
  FolderIcon,
  MessageSquareTextIcon,
} from "lucide-react"
import { Suspense } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"

import { RouteLoading } from "@/components/app/route-loading"
import { IneffableLogo } from "@/components/ineffable-logo"
import { Button } from "@/components/ui/button"

const productCapabilities = ["工作区协作", "持续 AI 会话", "安全身份访问"]

export function AuthLayout() {
  const { pathname } = useLocation()
  const isLogin = pathname === "/login"

  return (
    <div className="relative min-h-svh overflow-x-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,var(--muted),transparent_30%),radial-gradient(circle_at_88%_82%,var(--accent),transparent_26%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:64px_64px] opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]"
      />

      <div className="relative mx-auto flex min-h-svh w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10 lg:py-7">
        <header className="flex items-center justify-between gap-4">
          <Link
            to="/login"
            className="inline-flex rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="返回 Ineffable 登录页"
          >
            <IneffableLogo className="h-8" />
          </Link>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="hidden sm:inline">
              {isLogin ? "还没有账号？" : "已经有账号？"}
            </span>
            <Button variant="ghost" asChild>
              <Link to={isLogin ? "/register" : "/login"}>
                {isLogin ? "创建账号" : "返回登录"}
              </Link>
            </Button>
          </div>
        </header>

        <main className="grid flex-1 grid-cols-[minmax(0,1fr)] items-center gap-12 py-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.72fr)] lg:py-12">
          <section className="hidden min-w-0 lg:block">
            <div className="max-w-2xl space-y-5">
              <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
                Ineffable Identity
              </p>
              <h1 className="max-w-xl text-5xl leading-[1.08] font-semibold tracking-[-0.04em]">
                和 AI 在同一个工作区里，把对话变成真正的项目进展。
              </h1>
              <p className="max-w-xl text-base leading-7 text-muted-foreground">
                浏览和编辑文件，延续可恢复的 AI 会话；代理产生的修改会直接回到工作区，让上下文与成果始终同步。
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-sm text-muted-foreground">
                {productCapabilities.map((capability) => (
                  <span key={capability} className="inline-flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-foreground" />
                    {capability}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-9 max-w-2xl overflow-hidden rounded-3xl border border-border/80 bg-card/80 shadow-[0_30px_90px_-48px_rgba(0,0,0,0.45)] backdrop-blur-sm">
              <div className="flex h-11 items-center justify-between border-b px-4">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-border" />
                  <span className="size-2 rounded-full bg-border" />
                  <span className="size-2 rounded-full bg-border" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  Ineffable Workspace
                </span>
              </div>
              <div className="grid min-h-56 grid-cols-[172px_minmax(0,1fr)_180px]">
                <div className="space-y-2 border-r bg-muted/35 p-4 text-xs">
                  <p className="mb-3 font-medium text-muted-foreground">
                    PERSONAL SPACE
                  </p>
                  <div className="flex items-center gap-2 rounded-lg bg-accent px-2.5 py-2 font-medium">
                    <FolderIcon className="size-3.5" />
                    Product
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 text-muted-foreground">
                    <FileTextIcon className="size-3.5" />
                    roadmap.md
                  </div>
                  <div className="flex items-center gap-2 px-2.5 py-1.5 text-muted-foreground">
                    <FileTextIcon className="size-3.5" />
                    research.md
                  </div>
                </div>
                <div className="min-w-0 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileTextIcon className="size-4" />
                    product-brief.md
                  </div>
                  <div className="mt-5 space-y-3">
                    <div className="h-3 w-2/3 rounded-full bg-foreground/80" />
                    <div className="h-2 w-full rounded-full bg-muted" />
                    <div className="h-2 w-5/6 rounded-full bg-muted" />
                    <div className="h-2 w-11/12 rounded-full bg-muted" />
                    <div className="pt-3">
                      <div className="h-2 w-full rounded-full bg-muted" />
                      <div className="mt-3 h-2 w-4/5 rounded-full bg-muted" />
                    </div>
                  </div>
                </div>
                <div className="border-l bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <MessageSquareTextIcon className="size-3.5" />
                    AI 会话
                  </div>
                  <div className="mt-4 rounded-xl border bg-background p-3 text-xs leading-5 text-muted-foreground">
                    <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                      <BotIcon className="size-3.5" />
                      Ineffable
                    </div>
                    已结合当前文件上下文整理下一步任务。
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto w-full min-w-0 max-w-full sm:max-w-md">
            <Suspense fallback={<RouteLoading />}>
              <Outlet />
            </Suspense>
          </section>
        </main>

        <footer className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Ineffable</span>
          <span className="hidden sm:inline">Identity · Workspace · AI</span>
        </footer>
      </div>
    </div>
  )
}
