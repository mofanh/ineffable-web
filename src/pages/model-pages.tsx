import { ModuleDashboardPage } from "@/components/app"

export function ModelCenterPage() {
  return (
    <ModuleDashboardPage
      title="模型中心"
      subtitle="管理模型生命周期、评测结果和服务状态。"
      metrics={[
        { label: "已部署模型", value: "17", detail: "生产环境" },
        { label: "评测任务", value: "29", detail: "待执行" },
        { label: "服务可用性", value: "99.93%", detail: "最近 7 天" },
      ]}
      highlights={[
        "模型版本、评测与发布记录已形成统一追踪链。",
        "通过路由可直接定位到具体模型页面，便于排障。",
        "核心评测指标支持与业务目标做一对一映射。",
      ]}
    />
  )
}

export function GenesisPage() {
  return (
    <ModuleDashboardPage
      title="Genesis"
      subtitle="基础模型线，重点关注稳定性与通用任务表现。"
      metrics={[
        { label: "推理 QPS", value: "312", detail: "当前峰值" },
        { label: "平均延迟", value: "228ms", detail: "P50" },
        { label: "错误率", value: "0.18%", detail: "近 24 小时" },
      ]}
      highlights={[
        "推理链路稳定，适合作为默认基线模型。",
        "高频场景已完成 Prompt 模板固化。",
        "版本回滚策略在本页面可直接触发。",
      ]}
    />
  )
}

export function ExplorerPage() {
  return (
    <ModuleDashboardPage
      title="Explorer"
      subtitle="探索模型线，服务新场景验证与快速迭代。"
      metrics={[
        { label: "实验版本", value: "6", detail: "进行中" },
        { label: "A/B 测试", value: "4", detail: "活跃实验" },
        { label: "正向反馈", value: "78%", detail: "用户样本" },
      ]}
      highlights={[
        "实验策略以小流量灰度为主，降低发布风险。",
        "每个实验都有可回溯 URL，便于复盘讨论。",
        "探索结果自动汇总到模型中心主视图。",
      ]}
    />
  )
}

export function QuantumPage() {
  return (
    <ModuleDashboardPage
      title="Quantum"
      subtitle="高性能模型线，关注复杂任务与高并发场景。"
      metrics={[
        { label: "复杂任务通过率", value: "91%", detail: "最新评测" },
        { label: "GPU 占用", value: "82%", detail: "实时平均" },
        { label: "单位成本", value: "¥0.38", detail: "每千 token" },
      ]}
      highlights={[
        "高并发场景下仍保持稳定响应，适配关键业务。",
        "成本监控与性能数据在同页并行展示。",
        "异常波动会回传到控制台风险中心。",
      ]}
    />
  )
}
