import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  admitAgentDefinition,
  evaluateAgentDefinition,
  getAgentEvolutionReviewQueue,
  runRuntimeLabCommand,
  updateAgentDefinitionDefault,
  updateAgentDefinitionTrial,
  type AgentEvolutionProjection,
  type AgentEvolutionReviewQueueProjection,
} from "@/features/chat/api/chat-api"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import { cn } from "@/lib/utils"
import { publishAgentEvolutionChanged } from "@/features/chat/model/agent-evolution-invalidation"

type AgentNodeManagementViewProps = {
  accessToken: string | null
  projection: AgentEvolutionProjection
  onRefresh: () => Promise<void>
  onMutationBusyChange: (busy: boolean) => void
  targetLabel: string
}

function shortFingerprint(value: string) {
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value
}

function actionFor(
  projection: AgentEvolutionProjection | null,
  action: string,
  targetId?: string
) {
  return projection?.actions.find(
    (item) => item.action === action && (targetId === undefined || item.target_id === targetId)
  )
}

export function AgentNodeManagementView({
  accessToken,
  projection,
  onRefresh,
  onMutationBusyChange,
  targetLabel,
}: AgentNodeManagementViewProps) {
  const [busyKey, setBusyKey] = React.useState<string | null>(null)
  const [candidate, setCandidate] = React.useState<string | null>(null)
  const [fixture, setFixture] = React.useState("")
  const [expected, setExpected] = React.useState("")
  const [result, setResult] = React.useState<string | null>(null)
  const [componentName, setComponentName] = React.useState("")
  const [componentDigest, setComponentDigest] = React.useState("")
  const [componentConfig, setComponentConfig] = React.useState("{}")
  const [reviewQueue, setReviewQueue] =
    React.useState<AgentEvolutionReviewQueueProjection | null>(null)

  const refreshReviewQueue = React.useCallback(async () => {
    if (!accessToken) {
      setReviewQueue(null)
      return
    }
    setReviewQueue(
      await getAgentEvolutionReviewQueue(
        accessToken,
        projection.workspace_id ?? undefined
      )
    )
  }, [accessToken, projection.workspace_id])

  React.useEffect(() => {
    void refreshReviewQueue().catch(() => setReviewQueue(null))
  }, [refreshReviewQueue])

  const run = React.useCallback(
    async (key: string, operation: () => Promise<unknown>) => {
      setBusyKey(key)
      onMutationBusyChange(true)
      try {
        const value = await operation()
        setResult(JSON.stringify(value, null, 2))
        publishAgentEvolutionChanged({
          conversationId: projection.conversation_id,
          workspaceId: projection.workspace_id ?? null,
        })
        await Promise.all([onRefresh(), refreshReviewQueue()])
      } catch (caught) {
        const error = normalizeAppError(caught, { fallbackMessage: "Agent 迭代操作失败" })
        notify.error({ title: "Agent 迭代操作失败", description: error.message })
      } finally {
        setBusyKey(null)
        onMutationBusyChange(false)
      }
    },
    [onMutationBusyChange, onRefresh, projection, refreshReviewQueue]
  )

  const runConfirmed = React.useCallback(
    async (
      key: string,
      title: string,
      operation: () => Promise<unknown>,
      variant: "default" | "destructive" = "default"
    ) => {
      const confirmed = await confirm({ title, variant })
      if (confirmed) await run(key, operation)
    },
    [run]
  )

  const definition = projection?.definitions.find((item) => item.fingerprint === candidate)
  const definitions = React.useMemo(
    () =>
      [...(projection?.definitions ?? [])].sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      ),
    [projection?.definitions]
  )

  return (
    <div className="space-y-5">
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">
              已使用 {projection.definition_usage} 个 Agent Node 版本
            </div>
          </div>

          <section className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">
                  {projection?.trial_binding?.mode === "trial" ? "正在试用新 Agent Node" : "当前 Agent Node"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {projection?.effective_selection.fingerprint
                    ? shortFingerprint(projection.effective_selection.fingerprint)
                    : "系统 Agent"}
                  {projection?.trial_binding
                    ? ` · v${projection.trial_binding.version}`
                    : projection?.effective_selection.source === "default"
                      ? " · 跟随默认"
                      : " · 系统基线"}
                </p>
              </div>
              <Badge variant={projection?.trial_binding?.mode === "trial" ? "default" : "secondary"}>
                {projection?.trial_binding?.mode === "trial" ? "正在试用" : "稳定"}
              </Badge>
            </div>
            {projection?.trial_binding?.mode === "trial" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  回退目标：{projection.trial_binding.fallback_fingerprint
                    ? shortFingerprint(projection.trial_binding.fallback_fingerprint)
                    : "系统 Agent"}。候选产出回答后可直接在回答下方保留或恢复；当前正在运行的任务不会被热切换。
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={!accessToken || !actionFor(projection, "rollback_definition_trial")?.enabled || busyKey !== null}
                  onClick={() => accessToken && void runConfirmed(
                    "trial:rollback-fallback",
                    `确认在「${targetLabel}」恢复试用前的 Agent Node？外部工具产生的副作用不会回滚。`,
                    () => updateAgentDefinitionTrial(accessToken, {
                      action: "rollback",
                      conversation_id: projection.conversation_id,
                      workspace_id: projection.workspace_id ?? undefined,
                      expected_version: projection.trial_binding!.version,
                    }),
                    "destructive"
                  )}
                >
                  恢复试用前版本
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                从下方选择候选开始单活试用；不会并行运行旧版，也不会替换当前任务。
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Agent Node 版本链</h3>
            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              当前默认：{projection?.default_binding?.fingerprint
                ? shortFingerprint(projection.default_binding.fingerprint)
                : "系统 Agent"}
              {projection?.default_binding ? ` · v${projection.default_binding.version}` : ""}
            </div>
            {definitions.length ? definitions.map((item) => {
              const action = actionFor(projection, "evaluate_definition", item.fingerprint)
              const defaultAction = actionFor(projection, "set_default_definition", item.fingerprint)
              const trialAction = actionFor(projection, "start_definition_trial", item.fingerprint)
              const isDefault = projection.default_binding?.fingerprint === item.fingerprint
              return (
                <div key={item.fingerprint} className="relative ml-3 rounded-xl border p-3 before:absolute before:-left-4 before:top-5 before:size-2 before:rounded-full before:bg-primary after:absolute after:-left-[13px] after:top-7 after:h-[calc(100%+0.75rem)] after:w-px after:bg-border last:after:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.display_name || shortFingerprint(item.fingerprint)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {shortFingerprint(item.fingerprint)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.parent_fingerprint
                          ? `继承 ${shortFingerprint(item.parent_fingerprint)}`
                          : "演化链起点"}
                        {` · ${item.evaluation_count} 次评估`}
                      </p>
                    </div>
                    <Badge variant={item.admitted_for_future_selection ? "default" : "outline"}>
                      {item.admitted_for_future_selection ? "已准入" : item.latest_verdict || "候选"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!accessToken || !trialAction?.enabled || busyKey !== null}
                      onClick={() => accessToken && void runConfirmed(
                        `trial:${item.fingerprint}`,
                        `确认从「${targetLabel}」的下一条普通消息开始应用这个 Agent Node 版本？`,
                        () => updateAgentDefinitionTrial(accessToken, {
                          action: "start",
                          conversation_id: projection.conversation_id,
                          workspace_id: projection.workspace_id ?? undefined,
                          definition_fingerprint: item.fingerprint,
                          expected_version: projection.trial_binding?.version ?? 0,
                        })
                      )}
                    >
                      应用到当前会话
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!action?.enabled || busyKey !== null}
                      onClick={() => setCandidate(item.fingerprint)}
                    >
                      配置评估
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!accessToken || !defaultAction?.enabled || isDefault || busyKey !== null}
                      onClick={() => {
                        if (!accessToken || !projection) return
                        void runConfirmed(
                          `default:${item.fingerprint}`,
                          "确认将这个已准入 Agent Node 版本用于后续新运行？",
                          () => updateAgentDefinitionDefault(accessToken, {
                            action: "set",
                            conversation_id: projection.conversation_id,
                            workspace_id: projection.workspace_id ?? undefined,
                            fingerprint: item.fingerprint,
                            expected_version: projection.default_binding?.version ?? 0,
                          })
                        )
                      }}
                    >
                      {isDefault ? "当前默认" : "设为默认 Agent"}
                    </Button>
                  </div>
                </div>
              )
            }) : <p className="text-xs text-muted-foreground">还没有候选 Agent Node 版本。</p>}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!accessToken || !projection?.default_binding || !actionFor(projection, "rollback_default_definition")?.enabled || busyKey !== null}
              onClick={() => {
                if (!accessToken || !projection?.default_binding) return
                void runConfirmed(
                  "default:rollback",
                  "确认把后续新运行回滚到上一个默认 Agent Node 版本？",
                  () => updateAgentDefinitionDefault(accessToken, {
                    action: "rollback",
                    conversation_id: projection.conversation_id,
                    workspace_id: projection.workspace_id ?? undefined,
                    expected_version: projection.default_binding!.version,
                  }),
                  "destructive"
                )
              }}
            >
              回滚默认版本
            </Button>
          </section>

          {definition?.parent_fingerprint ? (
            <section className="space-y-2 rounded-xl border p-3">
              <h3 className="text-sm font-medium">隔离评估</h3>
              <Textarea
                value={fixture}
                onChange={(event) => setFixture(event.target.value)}
                placeholder="输入评估任务"
                className="min-h-24"
              />
              <Input
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                placeholder="期望回答包含的文字"
              />
              <Button
                type="button"
                size="sm"
                disabled={!accessToken || !fixture.trim() || !expected.trim() || !actionFor(projection, "evaluate_definition", definition.fingerprint)?.enabled || busyKey !== null}
                onClick={() => {
                  if (!accessToken || !projection) return
                  void run(`evaluate:${definition.fingerprint}`, () =>
                    evaluateAgentDefinition(accessToken, {
                      conversation_id: projection.conversation_id,
                      workspace_id: projection.workspace_id ?? undefined,
                      baseline_fingerprint: definition.parent_fingerprint!,
                      candidate_fingerprint: definition.fingerprint,
                      fixture_version: `web-${Date.now()}`,
                      assertion: { kind: "assistant_contains", value: expected.trim() },
                      fixture_content: fixture.trim(),
                      trigger: { kind: "explicit_user" },
                    })
                  )
                }}
              >
                运行隔离回归评估
              </Button>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">评估与人工准入</h3>
            {projection?.evaluations.length ? projection.evaluations.map((evaluation) => {
              const action = actionFor(projection, "admit_definition", evaluation.id)
              return (
                <div key={evaluation.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{shortFingerprint(evaluation.candidate_fingerprint)}</span>
                    <Badge variant={evaluation.verdict === "retain_candidate" ? "default" : "secondary"}>
                      {evaluation.verdict}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={!accessToken || !action?.enabled || busyKey !== null}
                    onClick={() => {
                      if (!accessToken) return
                      void runConfirmed(
                        `admit:${evaluation.id}`,
                        "确认以独立审核者身份准入这个 Agent Node 版本？",
                        () => admitAgentDefinition(accessToken, evaluation.id, projection?.conversation_id ?? "")
                      )
                    }}
                  >
                    人工准入
                  </Button>
                </div>
              )
            }) : <p className="text-xs text-muted-foreground">暂无评估记录。</p>}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">独立审核收件箱</h3>
            {reviewQueue?.evaluations.length ? reviewQueue.evaluations.map((evaluation) => {
              return (
                <div key={`review:${evaluation.id}`} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">候选 {shortFingerprint(evaluation.candidate_fingerprint)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">会话 {shortFingerprint(evaluation.conversation_id)}</p>
                    </div>
                    <Badge>待独立审核</Badge>
                  </div>
                  <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-muted p-2 text-[11px] leading-5">
                    {JSON.stringify(evaluation.evidence_json, null, 2)}
                  </pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={!accessToken || busyKey !== null}
                    onClick={() => accessToken && void runConfirmed(
                      `review:${evaluation.id}`,
                      "确认以独立审核者身份准入这个 Agent Node 版本？",
                      () => admitAgentDefinition(accessToken, evaluation.id, evaluation.conversation_id)
                    )}
                  >
                    审核并准入
                  </Button>
                </div>
              )
            }) : <p className="text-xs text-muted-foreground">当前范围暂无待审核候选。</p>}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Gateway 迭代建议</h3>
            {projection?.suggestions.length ? projection.suggestions.map((suggestion) => (
              <div key={suggestion.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{suggestion.trigger_kind}</span>
                  <Badge variant={suggestion.status === "open" ? "default" : "outline"}>
                    {suggestion.status}
                  </Badge>
                </div>
                <pre className="mt-2 overflow-x-auto text-[11px] leading-5 text-muted-foreground">
                  {JSON.stringify(suggestion.evidence_json, null, 2)}
                </pre>
              </div>
            )) : <p className="text-xs text-muted-foreground">暂无由 Gateway 权威事实生成的建议。</p>}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">开放运行时（高级）</h3>
                <p className="text-xs text-muted-foreground">
                  TTL {projection?.runtime_lab_quote.ttl_seconds ?? "—"} 秒 · 预计最多 {projection?.runtime_lab_quote.max_estimated_credits?.toFixed(3) ?? "—"} credits
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!accessToken || !actionFor(projection, "create_runtime_lab")?.enabled || busyKey !== null}
                onClick={() => {
                  if (!accessToken || !projection) return
                  void runConfirmed(
                    "lab:create",
                    "确认创建会产生实际资源成本的开放运行环境？",
                    () => runRuntimeLabCommand(accessToken, {
                      action: "create",
                      workspace_id: projection.workspace_id ?? undefined,
                      confirmed: true,
                      max_estimated_credits: projection.runtime_lab_quote.max_estimated_credits ?? 0,
                      grants: { network: [], paths: [], services: [] },
                    })
                  )
                }}
              >
                创建运行环境
              </Button>
            </div>
            {projection?.runtime_labs.map((lab) => (
              <div key={lab.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{shortFingerprint(lab.id)}</span>
                  <Badge variant={lab.status === "ready" ? "default" : "outline"}>{lab.status}</Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  <Input value={componentName} onChange={(event) => setComponentName(event.target.value)} placeholder="组件逻辑名称" />
                  <Input value={componentDigest} onChange={(event) => setComponentDigest(event.target.value)} placeholder="sha256:... artifact digest" />
                  <Textarea value={componentConfig} onChange={(event) => setComponentConfig(event.target.value)} placeholder="组件 JSON 配置" className="min-h-20 font-mono text-xs" />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!accessToken || !actionFor(projection, "define_runtime_lab_component", lab.id)?.enabled || !componentName.trim() || !componentDigest.trim() || busyKey !== null}
                    onClick={() => {
                      if (!accessToken || !projection) return
                      let config: Record<string, unknown>
                      try {
                        config = JSON.parse(componentConfig) as Record<string, unknown>
                      } catch {
                        notify.error({ title: "组件配置无效", description: "请输入有效的 JSON 对象。" })
                        return
                      }
                      void run(`lab:define:${lab.id}`, () => runRuntimeLabCommand(accessToken, {
                        action: "define",
                        workspace_id: projection.workspace_id ?? undefined,
                        runtime_lab_id: lab.id,
                        logical_name: componentName.trim(),
                        artifact_digest: componentDigest.trim(),
                        component_kind: projection.runtime_lab_quote.allowed_component_kinds[0] ?? "node",
                        schema_version: "ineffable.runtime-lab/v1",
                        config,
                      }))
                    }}
                  >
                    定义组件
                  </Button>
                </div>
                {projection.runtime_lab_components.filter((component) => component.runtime_lab_id === lab.id).map((component) => {
                  const activate = actionFor(projection, "activate_runtime_lab_component", component.id)
                  return (
                    <div key={component.id} className="mt-2 flex items-center justify-between rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{component.logical_name}</p>
                        <p className="text-[11px] text-muted-foreground">{component.component_kind} · {component.state}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!accessToken || !activate?.enabled || busyKey !== null}
                        onClick={() => accessToken && void run(`lab:activate:${component.id}`, () => runRuntimeLabCommand(accessToken, {
                          action: "activate",
                          workspace_id: projection.workspace_id ?? undefined,
                          runtime_lab_id: lab.id,
                          component_id: component.id,
                        }))}
                      >
                        {component.state === "active" ? "已激活" : "激活"}
                      </Button>
                    </div>
                  )
                })}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["inspect_runtime_lab", "export_runtime_lab", "dispose_runtime_lab"] as const).map((name) => {
                    const action = actionFor(projection, name, lab.id)
                    const labels = { inspect_runtime_lab: "检查", export_runtime_lab: "导出", dispose_runtime_lab: "释放" }
                    return (
                      <Button
                        key={name}
                        type="button"
                        size="sm"
                        variant={name === "dispose_runtime_lab" ? "destructive" : "outline"}
                        disabled={!accessToken || !action?.enabled || busyKey !== null}
                        onClick={() => {
                          if (!accessToken) return
                          const commandAction = name === "inspect_runtime_lab" ? "inspect" : name === "export_runtime_lab" ? "export" : "dispose"
                          const operation = () => runRuntimeLabCommand(accessToken, {
                            action: commandAction,
                            workspace_id: projection.workspace_id ?? undefined,
                            runtime_lab_id: lab.id,
                            ...(commandAction === "dispose" ? { reason: "user_requested" } : {}),
                          })
                          if (action?.requires_confirmation) {
                            void runConfirmed(
                              `lab:${name}:${lab.id}`,
                              "确认执行这个操作？",
                              operation,
                              name === "dispose_runtime_lab" ? "destructive" : "default"
                            )
                          } else {
                            void run(`lab:${name}:${lab.id}`, operation)
                          }
                        }}
                      >
                        {labels[name]}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>

          {result ? (
            <pre className={cn("max-h-64 overflow-auto rounded-xl bg-muted p-3 text-[11px] leading-5", busyKey && "opacity-60")}>
              {result}
            </pre>
          ) : null}
    </div>
  )
}
