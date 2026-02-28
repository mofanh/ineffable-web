import { ModuleDashboardPage } from "@/pages/shared/module-dashboard-page"

export function ConsoleWorldHomePage() {
  return (
    <ModuleDashboardPage
      title="World 控制台"
      subtitle="控制台总览页，聚焦全域运行状态与跨团队协同。"
      metrics={[
        { label: "在线协作者", value: "26", detail: "当前同时在线" },
        { label: "活跃任务", value: "84", detail: "进行中的任务卡片" },
        { label: "资源利用率", value: "73%", detail: "计算与人力综合" },
      ]}
      highlights={[
        "跨团队看板已按业务域分组，支持按路径追踪任务上下文。",
        "今日优先事项与阻塞项同步到协作总览，避免多入口信息分裂。",
        "URL 与导航联动后，分享链接可直接定位到当前业务视图。",
      ]}
    />
  )
}

export function CollaborationOverviewPage() {
  return (
    <ModuleDashboardPage
      title="协作总览"
      subtitle="聚焦协作链路、跨角色任务推进和同步节奏。"
      metrics={[
        { label: "待同步议题", value: "12", detail: "需在今日会确认" },
        { label: "已完成里程碑", value: "9", detail: "本迭代累计" },
        { label: "风险项", value: "3", detail: "已触发预警阈值" },
      ]}
      highlights={[
        "协作节点以周为单位生成追踪记录，便于复盘。",
        "风险项已绑定责任人和截止日期，可直接跳转处理。",
        "同步模板统一后，项目状态描述保持一致口径。",
      ]}
    />
  )
}

export function RealtimeTasksPage() {
  return (
    <ModuleDashboardPage
      title="实时任务"
      subtitle="观察任务流转速度、阻塞点与处理时效。"
      metrics={[
        { label: "新入队任务", value: "18", detail: "近 2 小时" },
        { label: "处理中", value: "41", detail: "当前活跃处理" },
        { label: "平均响应", value: "11m", detail: "首次响应耗时" },
      ]}
      highlights={[
        "任务来源已按产品线归类，可快速识别高压区域。",
        "超时任务自动标红并进入升级队列。",
        "关键任务支持按 URL 直达详情，提高协作效率。",
      ]}
    />
  )
}

export function ResourceBoardPage() {
  return (
    <ModuleDashboardPage
      title="资源看板"
      subtitle="查看人力、预算与算力资源的当前分配状态。"
      metrics={[
        { label: "人力投入", value: "142 人日", detail: "本周累计" },
        { label: "预算使用", value: "58%", detail: "月度预算执行" },
        { label: "算力占用", value: "69%", detail: "峰值窗口均值" },
      ]}
      highlights={[
        "资源冲突项已提前 48 小时预警，避免排期挤压。",
        "算力配额按业务优先级自动调整，保障关键任务。",
        "统一路由后资源链接可用于周报直接引用。",
      ]}
    />
  )
}
