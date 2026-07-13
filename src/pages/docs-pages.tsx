import { ModuleStatusPage } from "@/components/app"

export function DocsCenterPage() {
  return (
    <ModuleStatusPage
      title="产品文档"
      description="Ineffable 的工作区、自动任务与 AI 协作使用说明。"
      statusTitle="内置文档尚未开放"
      statusDescription="当前版本尚未接入独立的文档内容服务，因此这里不展示阅读量、更新数或完成率等虚构数据。"
      links={[
        {
          label: "自动任务",
          description: "创建并运行可重复执行的 AI 任务。",
          path: "/automation",
        },
        {
          label: "模型中心",
          description: "查看当前套餐真正可用的模型与能力限制。",
          path: "/models",
        },
        {
          label: "账号与登录设备",
          description: "查看账号资料和当前登录会话。",
          path: "/account",
        },
      ]}
      notes={[
        "文档搜索、阅读进度、收藏和版本时间线尚未接入。",
        "工作区文件仍可用于沉淀项目文档，并通过右侧 AI 助手继续处理。",
      ]}
    />
  )
}
