import { ModuleStatusPage } from "@/components/app"

export function SupportPage() {
  return (
    <ModuleStatusPage
      title="帮助支持"
      description="查看产品支持能力和问题反馈边界。"
      statusTitle="在线支持尚未接入"
      statusDescription="当前没有工单、SLA 或升级流程接口，本页面仅保留旧 URL 兼容，不展示虚构的服务状态。"
      links={[
        {
          label: "账号与登录设备",
          description: "先检查当前账号和登录会话是否正常。",
          path: "/account",
        },
      ]}
      notes={[
        "工单创建、状态跟踪和支持消息通知尚未开放。",
        "应用内错误会继续通过页面错误态和通知反馈。",
      ]}
    />
  )
}

export function FeedbackPage() {
  return (
    <ModuleStatusPage
      title="提交反馈"
      description="产品建议与问题反馈入口。"
      statusTitle="反馈渠道尚未接入"
      statusDescription="当前没有反馈提交与跟踪 API，本页面不会提供无法保存的输入框或虚假的提交成功状态。"
      notes={[
        "反馈表单、附件上传和处理进度查询尚未开放。",
        "该路由暂时仅用于兼容已有链接。",
      ]}
    />
  )
}
