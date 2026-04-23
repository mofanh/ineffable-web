import { IneffableLogo } from "@/components/ineffable-logo"
import { Button } from "@/components/ui/button"
import { ArrowRightIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react"
import { Link, Outlet, useLocation } from "react-router-dom"

const authHighlights = [
  {
    title: "统一身份入口",
    description: "登录、注册与账号管理使用同一套品牌与表单体验。",
    icon: ShieldCheckIcon,
  },
  {
    title: "协作信息可见",
    description: "在进入工作台前先展示团队、权限和审计相关上下文。",
    icon: SparklesIcon,
  },
]

export function AuthLayout() {
  const { pathname } = useLocation()
  const isLogin = pathname === "/login"

  return (
    <div className="relative min-h-svh overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.08),_transparent_32%),linear-gradient(135deg,_hsl(var(--background))_0%,_hsl(var(--muted))_100%)]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent_0,transparent_calc(100%-1px),hsl(var(--border))_calc(100%-1px)),linear-gradient(to_bottom,transparent_0,transparent_calc(100%-1px),hsl(var(--border))_calc(100%-1px))] bg-[size:72px_72px] opacity-35" />
      <div className="relative mx-auto flex min-h-svh max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center">
            <IneffableLogo className="h-9" />
          </Link>
          <Button variant="ghost" asChild>
            <Link to={isLogin ? "/register" : "/login"}>
              {isLogin ? "创建账号" : "返回登录"}
              <ArrowRightIcon />
            </Link>
          </Button>
        </header>

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-12">
          <section className="hidden lg:flex lg:flex-col lg:justify-between">
            <div className="max-w-xl space-y-6">
              <p className="text-sm font-medium tracking-[0.22em] text-muted-foreground uppercase">
                Ineffable Identity
              </p>
              <div className="space-y-4">
                <h1 className="max-w-lg text-5xl leading-tight font-semibold tracking-tight">
                  把用户身份、访问控制和工作台体验放在同一条链路里。
                </h1>
                <p className="max-w-xl text-base leading-7 text-muted-foreground">
                  这套认证入口面向内部协作产品设计，保持信息密度、品牌一致性和移动端可访问性。
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {authHighlights.map((item) => (
                <div
                  key={item.title}
                  className="flex max-w-xl items-start gap-4 rounded-3xl border border-border/70 bg-background/85 p-5 backdrop-blur-sm"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                    <item.icon className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-medium">{item.title}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mx-auto w-full max-w-md">
            <Outlet />
          </section>
        </div>
      </div>
    </div>
  )
}
