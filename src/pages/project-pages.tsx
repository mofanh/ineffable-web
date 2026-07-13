import { ModuleStatusPage } from "@/components/app"

export function ProjectsHomePage() {
  return (
    <ModuleStatusPage
      title="项目"
      description="按目标组织任务、文件和协作上下文的项目视图。"
      statusTitle="项目实体尚未开放"
      statusDescription="后端当前没有项目、里程碑、任务统计或 CRM 数据接口，因此这里不展示项目数量、风险和转化率等示例指标。"
      links={[
        {
          label: "自动任务",
          description: "用真实任务记录组织可重复执行的工作流。",
          path: "/automation",
        },
        {
          label: "模型中心",
          description: "选择适合任务的真实可用模型。",
          path: "/models",
        },
      ]}
      notes={[
        "工作区目前承担文件和团队协作边界，不等同于独立项目实体。",
        "项目进度、风险、交付和业务指标需等待后端领域模型后再接入。",
      ]}
    />
  )
}
