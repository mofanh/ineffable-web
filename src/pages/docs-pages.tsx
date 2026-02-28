import { ModuleDashboardPage } from "@/pages/shared/module-dashboard-page"

export function DocsCenterPage() {
  return (
    <ModuleDashboardPage
      title="文档中心"
      subtitle="集中管理产品、工程和运维文档资产。"
      metrics={[
        { label: "文档总量", value: "438", detail: "已收录" },
        { label: "本周更新", value: "57", detail: "增量变更" },
        { label: "阅读完成率", value: "86%", detail: "关键文档" },
      ]}
      highlights={[
        "文档目录结构与业务路由保持一致，便于检索。",
        "变更摘要自动推送到协作总览，减少信息漏读。",
        "页面级 URL 可作为规范文档的稳定引用。",
      ]}
    />
  )
}

export function DocsIntroductionPage() {
  return (
    <ModuleDashboardPage
      title="Introduction"
      subtitle="新成员与跨团队协作者的统一入口说明。"
      metrics={[
        { label: "新成员完成率", value: "94%", detail: "入职首周" },
        { label: "平均阅读时长", value: "12m", detail: "章节完整度" },
        { label: "FAQ 命中率", value: "71%", detail: "常见问题" },
      ]}
      highlights={[
        "介绍页覆盖平台概念、导航规则与协作流程。",
        "从该页可直接跳转到任务、资源和模型入口。",
        "版本更新记录确保培训材料与系统一致。",
      ]}
    />
  )
}

export function DocsGetStartedPage() {
  return (
    <ModuleDashboardPage
      title="Get Started"
      subtitle="提供快速上手流程与基础操作清单。"
      metrics={[
        { label: "标准步骤", value: "8", detail: "完整上手链路" },
        { label: "自动检查项", value: "14", detail: "环境与权限" },
        { label: "首次成功率", value: "89%", detail: "新用户样本" },
      ]}
      highlights={[
        "上手步骤按角色分流，减少无关信息干扰。",
        "每一步均带可分享 URL，方便导师远程协助。",
        "常见失败场景附带排查路径与处理建议。",
      ]}
    />
  )
}

export function DocsTutorialsPage() {
  return (
    <ModuleDashboardPage
      title="Tutorials"
      subtitle="按真实业务场景组织的进阶实操教程。"
      metrics={[
        { label: "教程数量", value: "24", detail: "可执行案例" },
        { label: "场景覆盖", value: "11", detail: "业务域" },
        { label: "完课率", value: "76%", detail: "近 30 天" },
      ]}
      highlights={[
        "每个教程都绑定对应功能路由，学习与实操联动。",
        "教程更新与版本发布同频，避免文档过期。",
        "常用教程支持一键收藏并在侧栏快速进入。",
      ]}
    />
  )
}

export function DocsChangelogPage() {
  return (
    <ModuleDashboardPage
      title="Changelog"
      subtitle="按时间线管理版本改动与影响范围。"
      metrics={[
        { label: "本月发布", value: "15", detail: "包含热修复" },
        { label: "重大变更", value: "4", detail: "需关注迁移" },
        { label: "回滚次数", value: "1", detail: "近 30 天" },
      ]}
      highlights={[
        "变更日志与页面路由绑定，定位上下文更直接。",
        "重大改动同步影响组件、接口和文档状态。",
        "每条变更都可关联到对应 issue 与评审记录。",
      ]}
    />
  )
}
