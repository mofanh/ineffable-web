import { ModuleDashboardPage } from "@/pages/shared/module-dashboard-page"
import { useWorldDashboardSummary } from "@/hooks/use-world-dashboard"
import type { Message } from "@/lib/world-api"
import { getMessageThread, replyToMessage } from "@/lib/world-api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useCallback, useEffect, useMemo, useState } from "react"

function formatMetricValue(value: number, suffix = "") {
  return `${value}${suffix}`
}

function useWorldCommonHighlights() {
  const {
    isLoading,
    error,
    streamConnected,
    summary,
    pendingHumanMessages,
  } = useWorldDashboardSummary()

  const statusText = isLoading
    ? "World API 数据加载中..."
    : error
      ? "World API 部分接口异常，请检查服务状态或跨域配置。"
      : "World API 数据已接入并可用于页面决策。"

  const streamText = streamConnected
    ? `SSE 已连接，最新事件：${summary.latestStream?.event ?? "暂无"}`
    : "SSE 未连接，页面当前展示最近一次拉取的数据快照。"

  return {
    isLoading,
    error,
    summary,
    statusText,
    streamText,
    pendingHumanMessages,
  }
}

function getMessageKind(message: Message) {
  return message.message_type ?? message.msg_type ?? "system"
}

function formatDate(isoDate?: string | null) {
  if (!isoDate) {
    return "--"
  }

  const date = new Date(isoDate)

  if (Number.isNaN(date.getTime())) {
    return "--"
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ConsoleWorldHomePage() {
  const { summary, statusText, streamText } = useWorldCommonHighlights()

  return (
    <ModuleDashboardPage
      title="World 控制台"
      subtitle="控制台总览页（实时对接 world REST + SSE）。"
      metrics={[
        {
          label: "Agent 总数",
          value: formatMetricValue(summary.totalAgents),
          detail: "来自 GET /api/agents",
        },
        {
          label: "运行中 Agent",
          value: formatMetricValue(summary.runningAgents),
          detail: "状态为 running",
        },
        {
          label: "待处理消息",
          value: formatMetricValue(summary.pendingHumanMessages),
          detail: "来自 GET /api/messages/human/pending",
        },
      ]}
      highlights={[
        statusText,
        streamText,
        `今日事件数：${summary.todayEvents}（GET /api/events）`,
      ]}
    />
  )
}

export function CollaborationOverviewPage() {
  const { summary, statusText, streamText } = useWorldCommonHighlights()

  return (
    <ModuleDashboardPage
      title="协作总览"
      subtitle="聚焦协作链路与人机消息处理节奏。"
      metrics={[
        {
          label: "待处理人类消息",
          value: formatMetricValue(summary.pendingHumanMessages),
          detail: "协作待办入口",
        },
        {
          label: "Busy Agent",
          value: formatMetricValue(summary.busyAgents),
          detail: "状态为 busy",
        },
        {
          label: "Idle Agent",
          value: formatMetricValue(summary.idleAgents),
          detail: "状态为 idle",
        },
      ]}
      highlights={[
        statusText,
        streamText,
        `最近事件：${summary.latestEvent?.event_type ?? "暂无"} ${summary.latestEvent?.message ?? ""}`,
      ]}
    />
  )
}

export function RealtimeTasksPage() {
  const { summary, statusText, streamText, pendingHumanMessages } = useWorldCommonHighlights()
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [sendingReply, setSendingReply] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const recentMessages = useMemo(
    () => pendingHumanMessages.slice(0, 6),
    [pendingHumanMessages]
  )

  const activeMessageId = selectedMessageId ?? recentMessages[0]?.id ?? null

  const loadThread = useCallback(async (messageId: string) => {
    setThreadLoading(true)
    setThreadError(null)

    try {
      const messages = await getMessageThread(messageId)
      setThreadMessages(messages)
    } catch {
      setThreadError("线程加载失败，请稍后重试。")
      setThreadMessages([])
    } finally {
      setThreadLoading(false)
    }
  }, [])

  const handleSendReply = useCallback(async () => {
    if (!activeMessageId || !replyText.trim() || sendingReply) {
      return
    }

    setSendingReply(true)
    setSendError(null)

    try {
      const newMessage = await replyToMessage(activeMessageId, replyText.trim())
      setThreadMessages((prev) => [...prev, newMessage])
      setReplyText("")
    } catch {
      setSendError("回复发送失败，请稍后重试。")
    } finally {
      setSendingReply(false)
    }
  }, [activeMessageId, replyText, sendingReply])

  useEffect(() => {
    if (!activeMessageId) {
      return
    }

    void loadThread(activeMessageId)
  }, [activeMessageId, loadThread])

  return (
    <ModuleDashboardPage
      title="实时任务"
      subtitle="以消息流与状态变更观察实时任务推进。"
      metrics={[
        {
          label: "NewMessage 事件",
          value: formatMetricValue(
            summary.latestStream?.event === "NewMessage" ? 1 : 0
          ),
          detail: "最近一条 SSE 是否为新消息",
        },
        {
          label: "Busy Agent",
          value: formatMetricValue(summary.busyAgents),
          detail: "可近似视为处理中任务",
        },
        {
          label: "总事件量",
          value: formatMetricValue(summary.totalEvents),
          detail: "来自 GET /api/events",
        },
      ]}
      highlights={[
        statusText,
        streamText,
        "已支持点击待处理消息并加载 /api/messages/{id}/thread 线程详情。",
      ]}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">待处理消息</CardTitle>
            <CardDescription>来源：GET /api/messages/human/pending（最多展示 6 条）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentMessages.length === 0 ? (
              <p className="text-muted-foreground text-sm">当前没有待处理消息。</p>
            ) : (
              recentMessages.map((message) => {
                const isActive = activeMessageId === message.id

                return (
                  <Button
                    key={message.id}
                    variant={isActive ? "secondary" : "outline"}
                    className="h-auto w-full justify-start px-3 py-2"
                    onClick={() => setSelectedMessageId(message.id)}
                  >
                    <div className="flex w-full flex-col items-start gap-1 text-left">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {getMessageKind(message)} · {formatDate(message.created_at)}
                      </span>
                      <span className="line-clamp-1 w-full text-sm font-medium">{message.subject}</span>
                    </div>
                  </Button>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-base">线程详情</CardTitle>
            <CardDescription>来源：GET /api/messages/{'{id}'}/thread</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {threadLoading ? (
              <p className="text-muted-foreground text-sm">正在加载线程...</p>
            ) : threadError ? (
              <p className="text-destructive text-sm">{threadError}</p>
            ) : threadMessages.length === 0 ? (
              <p className="text-muted-foreground text-sm">请选择一条消息查看线程。</p>
            ) : (
              <ul className="space-y-3 max-h-75 overflow-y-auto">
                {threadMessages.map((message) => (
                  <li key={message.id} className="rounded-md border p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {getMessageKind(message)} · {message.from_type} → {message.to_type}
                    </p>
                    <p className="mt-1 text-sm font-medium">{message.subject}</p>
                    <p className="text-muted-foreground mt-1 text-sm leading-6">{message.body}</p>
                    <p className="text-muted-foreground mt-2 text-xs">{formatDate(message.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
            {activeMessageId && (
              <div className="flex flex-col gap-2 border-t pt-4">
                <Textarea
                  placeholder="输入回复内容..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  disabled={sendingReply}
                />
                {sendError && <p className="text-destructive text-xs">{sendError}</p>}
                <Button
                  size="sm"
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sendingReply}
                >
                  {sendingReply ? "发送中..." : "发送回复"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ModuleDashboardPage>
  )
}

export function ResourceBoardPage() {
  const { summary, statusText, streamText } = useWorldCommonHighlights()

  return (
    <ModuleDashboardPage
      title="资源看板"
      subtitle="从 Agent 运行模式与稳定性观察资源分配。"
      metrics={[
        {
          label: "Persistent Agent",
          value: formatMetricValue(summary.persistentAgents),
          detail: "run_mode = persistent",
        },
        {
          label: "On-demand Agent",
          value: formatMetricValue(summary.onDemandAgents),
          detail: "run_mode = on_demand",
        },
        {
          label: "异常 Agent",
          value: formatMetricValue(summary.errorAgents),
          detail: "status = error",
        },
      ]}
      highlights={[
        statusText,
        streamText,
        `Planner / Worker 分布：${summary.plannerAgents} / ${summary.workerAgents}`,
      ]}
    />
  )
}
