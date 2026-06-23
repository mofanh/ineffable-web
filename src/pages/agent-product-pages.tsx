import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ModuleDashboardPage } from "@/pages/shared/module-dashboard-page"

type ProductMetric = {
  label: string
  value: string
  detail: string
}

function productMetrics(primary: ProductMetric): [
  ProductMetric,
  ProductMetric,
  ProductMetric,
] {
  return [
    primary,
    {
      label: "链路",
      value: "Gateway",
      detail: "复用 agent 主运行链路",
    },
    {
      label: "状态",
      value: "MVP",
      detail: "当前阶段先接入路由",
    },
  ]
}

export function AiTeammatesPage() {
  return (
    <ModuleDashboardPage
      title="AI Teammates"
      subtitle="配置可运行的 Agent Profile，并绑定 Skills / Rules / Memory。"
      metrics={productMetrics({
        label: "定位",
        value: "Agent Profile",
        detail: "把用户资产编译为运行上下文",
      })}
      highlights={[
        "AI Teammate 是运行配置，不是独立 runtime。",
        "后续会在这里创建、编辑 teammate，并绑定 rules、skills 和 memory scope。",
      ]}
    >
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">第一阶段入口</CardTitle>
          <CardDescription>页面路由已就绪，管理 UI 在后续阶段实现。</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm leading-6">
          当前后端已支持 teammate/profile 与 rules 持久化；下一步会接入列表、创建和编辑体验。
        </CardContent>
      </Card>
    </ModuleDashboardPage>
  )
}

export function AiTeammateDetailPage() {
  return (
    <ModuleDashboardPage
      title="AI Teammate Detail"
      subtitle="查看和编辑单个 Agent Profile。"
      metrics={productMetrics({
        label: "状态",
        value: "Placeholder",
        detail: "详情 UI 后续实现",
      })}
      highlights={[
        "详情页会承载基础 prompt、rules、skills、memory bindings。",
      ]}
    />
  )
}

export function AgentResourcesPage() {
  return (
    <ModuleDashboardPage
      title="Skills, Rules, Memory"
      subtitle="用户个人智能体资产库。"
      metrics={productMetrics({
        label: "当前优先级",
        value: "Rules",
        detail: "先打通 rules 资产管理与 teammate 绑定",
      })}
      highlights={[
        "Skills / Rules / Memory 是个人资产库。",
        "AI Teammate 从这里选择资产并编译进运行上下文。",
        "第一版先落地 Rules，Skills 和 Memory 后续补齐。",
      ]}
    >
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Rules tab 即将接入</CardTitle>
          <CardDescription>当前为路由占位，后续阶段添加 CRUD UI。</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm leading-6">
          后端已经提供 agent-rules API；前端管理页面会在后续阶段接入。
        </CardContent>
      </Card>
    </ModuleDashboardPage>
  )
}

export function AutomationPage() {
  return (
    <ModuleDashboardPage
      title="Automation"
      subtitle="主动触发某个 AI Teammate 执行任务。"
      metrics={productMetrics({
        label: "定位",
        value: "主动触发",
        detail: "trigger + target Agent Profile + task",
      })}
      highlights={[
        "Automation 不绕过 agent 主链路。",
        "后续会绑定 target AI Teammate，并复用 gateway run。",
      ]}
    >
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">Automation placeholder</CardTitle>
          <CardDescription>主动触发能力在 teammate 主链路稳定后实现。</CardDescription>
        </CardHeader>
      </Card>
    </ModuleDashboardPage>
  )
}
