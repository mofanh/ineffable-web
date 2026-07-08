import { ModuleDashboardPage } from "@/components/app"

export function ProjectsHomePage() {
  return (
    <ModuleDashboardPage
      title="项目"
      subtitle="项目集合视图，按业务目标组织执行节奏。"
      metrics={[
        { label: "进行中项目", value: "14", detail: "当前周期" },
        { label: "按期推进", value: "11", detail: "健康状态" },
        { label: "阻塞项目", value: "3", detail: "需升级处理" },
      ]}
      highlights={[
        "项目页作为目录入口，支持快速跳转到具体项目。",
        "路径结构已统一，可作为会议材料引用。",
        "阻塞信息与协作总览保持同步。",
      ]}
    />
  )
}

export function DesignEngineeringPage() {
  return (
    <ModuleDashboardPage
      title="Design Engineering"
      subtitle="设计与工程协同项目，关注交付质量与节奏。"
      metrics={[
        { label: "迭代任务", value: "36", detail: "本期范围" },
        { label: "设计验收", value: "92%", detail: "一次通过" },
        { label: "交付风险", value: "2", detail: "高优先级" },
      ]}
      highlights={[
        "设计稿、组件和实现进度已按模块对齐。",
        "变更影响会自动同步到关联任务链路。",
        "关键交付项可通过路由直达讨论页。",
      ]}
    />
  )
}

export function SalesMarketingPage() {
  return (
    <ModuleDashboardPage
      title="Sales & Marketing"
      subtitle="销售与市场项目，聚焦线索转化与传播效率。"
      metrics={[
        { label: "线索池", value: "1,284", detail: "本月累计" },
        { label: "转化率", value: "14.2%", detail: "阶段目标" },
        { label: "活动进行中", value: "8", detail: "跨渠道" },
      ]}
      highlights={[
        "线索流转已打通 CRM 与投放看板数据。",
        "营销活动效果按路由页沉淀复盘结论。",
        "风险预警规则与预算页面联动。",
      ]}
    />
  )
}

export function TravelProjectPage() {
  return (
    <ModuleDashboardPage
      title="Travel"
      subtitle="出行相关项目，关注服务稳定性与体验指标。"
      metrics={[
        { label: "上线功能", value: "7", detail: "当前版本" },
        { label: "用户满意度", value: "4.6/5", detail: "近 30 天" },
        { label: "事故数", value: "0", detail: "本周" },
      ]}
      highlights={[
        "核心链路已完成压测并建立容量阈值。",
        "体验问题统一进入任务系统闭环处理。",
        "版本更新会自动关联到 Changelog 页面。",
      ]}
    />
  )
}
