import { ModuleDashboardPage } from "@/components/app"

export function SupportPage() {
  return (
    <ModuleDashboardPage
      title="Support"
      subtitle="支持中心，统一处理问题响应与升级流程。"
      metrics={[
        { label: "待处理工单", value: "23", detail: "当前积压" },
        { label: "SLA 达标率", value: "97%", detail: "近 7 天" },
        { label: "升级工单", value: "4", detail: "需跨团队" },
      ]}
      highlights={[
        "支持请求可按路由分发到对应责任模块。",
        "高优先级问题会自动同步到协作总览。",
        "处理记录沉淀后可反哺文档与教程内容。",
      ]}
    />
  )
}

export function FeedbackPage() {
  return (
    <ModuleDashboardPage
      title="Feedback"
      subtitle="反馈中心，汇总用户建议与内部改进事项。"
      metrics={[
        { label: "本周反馈", value: "68", detail: "新增条目" },
        { label: "已归档", value: "44", detail: "完成处理" },
        { label: "高价值建议", value: "9", detail: "进入规划" },
      ]}
      highlights={[
        "反馈已按主题标签与业务路由自动聚类。",
        "重点建议可直接关联到项目或任务页面。",
        "处理进展在该页与协作总览双向同步。",
      ]}
    />
  )
}
