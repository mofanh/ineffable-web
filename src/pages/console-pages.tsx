import { ModuleDashboardPage } from "@/pages/shared/module-dashboard-page"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
export { SandboxConsolePage } from "@/pages/sandbox-console-page"

function createStaticMetrics(context: string) {
  return [
    {
      label: "状态",
      value: "静态页",
      detail: `${context} 已移除旧后端依赖`,
    },
    {
      label: "右侧栏",
      value: "Chat",
      detail: "默认由 RightSidebar 承载",
    },
    {
      label: "数据源",
      value: "Gateway",
      detail: "仅保留 chat 请求",
    },
  ] as const
}

function DeprecatedBackendNotice({
  title,
  subtitle,
  context,
}: {
  title: string
  subtitle: string
  context: string
}) {
  return (
    <ModuleDashboardPage
      title={title}
      subtitle={subtitle}
      metrics={[...createStaticMetrics(context)]}
      highlights={[
        "旧的 world / cli / runtime 后端调用已从前端移除。",
        "当前项目只保留 RightSidebar chat 使用的 gateway 请求。",
        "如果后续有新的页面数据源，建议按页面功能重新建立 feature API，而不是恢复平铺旧接口。",
      ]}
    >
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">当前状态</CardTitle>
          <CardDescription>{context}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm leading-6">
          页面保留路由入口和说明文案，避免继续引用已废弃的后端接口。
        </CardContent>
      </Card>
    </ModuleDashboardPage>
  )
}

export function ConsoleWorldHomePage() {
  return (
    <DeprecatedBackendNotice
      title="World 控制台"
      subtitle="控制台首页已切到静态说明，右侧栏继续承载常驻 chat。"
      context="原世界状态总览、事件流和消息列表依赖的接口已经废弃。"
    />
  )
}

export function CollaborationOverviewPage() {
  return (
    <DeprecatedBackendNotice
      title="协作总览"
      subtitle="协作页暂时只保留入口说明。"
      context="原协作总览依赖的 world 数据聚合接口已经下线。"
    />
  )
}

export function RealtimeTasksPage() {
  return (
    <DeprecatedBackendNotice
      title="实时任务"
      subtitle="实时任务页已去掉旧线程和回复逻辑。"
      context="原消息线程、待处理消息与回复接口已经废弃。"
    />
  )
}

export function ResourceBoardPage() {
  return (
    <DeprecatedBackendNotice
      title="资源看板"
      subtitle="资源看板页暂时不再请求后端。"
      context="原 Agent 运行状态与事件统计接口已经废弃。"
    />
  )
}

export function CliDirectPage({ chatOnly = false }: { chatOnly?: boolean }) {
  const content = (
    <Card className="bg-muted/50">
      <CardHeader>
        <CardTitle className="text-base">CLI Runtime 已移除</CardTitle>
        <CardDescription>旧的 CLI 直连和 SSE 事件渲染已下线。</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm leading-6">
        当前保留的对话入口只有右侧栏 chat。后续如果需要新的 CLI 能力，建议基于现存路由重新设计接口和前端状态，而不是恢复旧实现。
      </CardContent>
    </Card>
  )

  if (chatOnly) {
    return content
  }

  return (
    <ModuleDashboardPage
      title="CLI 直连"
      subtitle="旧 CLI runtime 调试页已退场。"
      metrics={[...createStaticMetrics("CLI runtime 相关后端已废弃")]}
      highlights={[
        "CLI health、runtime input、runtime events 已从前端删除。",
        "默认对话入口迁回 RightSidebar。",
        "后续如需恢复 CLI 能力，建议独立成新 feature。",
      ]}
    >
      {content}
    </ModuleDashboardPage>
  )
}

export function CliChatPage() {
  return <CliDirectPage chatOnly />
}

export function ApiDebugPage() {
  return (
    <DeprecatedBackendNotice
      title="接口调试"
      subtitle="旧的 world 调试接口已移除。"
      context="outputs/batch、heartbeat 和 agent 列表接口已经废弃。"
    />
  )
}
