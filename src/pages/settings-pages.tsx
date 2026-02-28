import { ModuleDashboardPage } from "@/pages/shared/module-dashboard-page"

export function SettingsCenterPage() {
  return (
    <ModuleDashboardPage
      title="系统设置"
      subtitle="统一管理平台级配置、权限与策略。"
      metrics={[
        { label: "配置项", value: "96", detail: "当前可管理" },
        { label: "变更审批", value: "7", detail: "待处理" },
        { label: "合规通过率", value: "100%", detail: "最近审计" },
      ]}
      highlights={[
        "设置项按模块聚合，减少跨页跳转成本。",
        "关键策略变更默认走审批流并记录审计日志。",
        "统一路由后可通过链接精确定位设置上下文。",
      ]}
    />
  )
}

export function SettingsGeneralPage() {
  return (
    <ModuleDashboardPage
      title="General"
      subtitle="平台通用参数与默认行为策略。"
      metrics={[
        { label: "基础参数", value: "32", detail: "已生效" },
        { label: "待确认修改", value: "5", detail: "草稿状态" },
        { label: "上次更新时间", value: "2h", detail: "最近提交" },
      ]}
      highlights={[
        "通用配置影响全局行为，变更需跨团队同步。",
        "默认参数模板已支持按环境快速切换。",
        "历史版本可追溯，支持精确回滚。",
      ]}
    />
  )
}

export function SettingsTeamPage() {
  return (
    <ModuleDashboardPage
      title="Team"
      subtitle="团队成员、角色与访问边界管理。"
      metrics={[
        { label: "成员总数", value: "87", detail: "有效账号" },
        { label: "角色模板", value: "9", detail: "权限组合" },
        { label: "待审批邀请", value: "6", detail: "最近 48h" },
      ]}
      highlights={[
        "权限模型采用角色模板 + 细粒度覆盖策略。",
        "关键权限提升需双人审批并自动通知。",
        "团队变化会同步到协作总览风险看板。",
      ]}
    />
  )
}

export function SettingsBillingPage() {
  return (
    <ModuleDashboardPage
      title="Billing"
      subtitle="账单、额度与成本控制策略。"
      metrics={[
        { label: "本月支出", value: "¥128,400", detail: "含预估项" },
        { label: "预算剩余", value: "42%", detail: "月度上限" },
        { label: "异常账单", value: "2", detail: "待确认" },
      ]}
      highlights={[
        "费用趋势按业务线拆分，便于责任归因。",
        "超预算阈值可触发自动限流策略。",
        "账单页面支持按路由参数分享查询视图。",
      ]}
    />
  )
}

export function SettingsLimitsPage() {
  return (
    <ModuleDashboardPage
      title="Limits"
      subtitle="配额、速率限制与保护阈值。"
      metrics={[
        { label: "启用限额", value: "21", detail: "策略条目" },
        { label: "触发次数", value: "34", detail: "近 24h" },
        { label: "误触发率", value: "1.7%", detail: "策略评估" },
      ]}
      highlights={[
        "限额策略分层管理，兼顾保护与可用性。",
        "策略命中日志支持按路径快速定位来源。",
        "触发频次过高会自动生成优化建议。",
      ]}
    />
  )
}
