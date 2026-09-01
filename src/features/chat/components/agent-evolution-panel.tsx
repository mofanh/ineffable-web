import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  admitAgentDefinition,
  evaluateAgentDefinition,
  runRuntimeLabCommand,
  updateAgentDefinitionDefault,
  type AgentEvolutionProjection,
} from "@/features/chat/api/chat-api"
import { normalizeAppError } from "@/lib/app/api-errors"
import { confirm } from "@/lib/app/confirm"
import { notify } from "@/lib/app/notifications"
import { cn } from "@/lib/utils"
import { FlaskConicalIcon, RefreshCcwIcon } from "lucide-react"

type AgentEvolutionPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  accessToken: string | null
  projection: AgentEvolutionProjection | null
  onRefresh: () => Promise<void>
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

export function AgentEvolutionPanel({
  open,
  onOpenChange,
  accessToken,
  projection,
  onRefresh,
}: AgentEvolutionPanelProps) {
  const [busyKey, setBusyKey] = React.useState<string | null>(null)
  const [candidate, setCandidate] = React.useState<string | null>(null)
  const [fixture, setFixture] = React.useState("")
  const [expected, setExpected] = React.useState("")
  const [result, setResult] = React.useState<string | null>(null)

  const run = React.useCallback(
    async (key: string, operation: () => Promise<unknown>) => {
      setBusyKey(key)
      try {
        const value = await operation()
        setResult(JSON.stringify(value, null, 2))
        await onRefresh()
      } catch (caught) {
        const error = normalizeAppError(caught, { fallbackMessage: "Agent 迭代操作失败" })
        notify.error({ title: "Agent 迭代操作失败", description: error.message })
      } finally {
        setBusyKey(null)
      }
    },
    [onRefresh]
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(92vw,560px)] sm:max-w-[560px]">
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2 pr-8">
            <FlaskConicalIcon className="size-4" />
            <SheetTitle>Runtime Lab</SheetTitle>
            <Badge variant={projection?.requested ? "default" : "secondary"}>
              {projection?.effective_mode ?? "disabled"}
            </Badge>
          </div>
          <SheetDescription>
            Definition 候选、隔离评估、人工准入与临时开放运行时。
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground">
              已使用 {projection?.definition_usage ?? 0} 个 Definition
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busyKey !== null}
              onClick={() => void run("refresh", onRefresh)}
            >
              <RefreshCcwIcon /> 刷新
            </Button>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Definition 候选</h3>
            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              当前默认：{projection?.default_binding?.fingerprint
                ? shortFingerprint(projection.default_binding.fingerprint)
                : "系统 Definition"}
              {projection?.default_binding ? ` · v${projection.default_binding.version}` : ""}
            </div>
            {projection?.definitions.length ? projection.definitions.map((item) => {
              const action = actionFor(projection, "evaluate_definition", item.fingerprint)
              const defaultAction = actionFor(projection, "set_default_definition", item.fingerprint)
              const isDefault = projection.default_binding?.fingerprint === item.fingerprint
              return (
                <div key={item.fingerprint} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.display_name || shortFingerprint(item.fingerprint)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {shortFingerprint(item.fingerprint)}
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
                          "确认将这个已准入 Definition 用于后续新运行？",
                          () => updateAgentDefinitionDefault(accessToken, {
                            action: "set",
                            workspace_id: projection.workspace_id ?? undefined,
                            fingerprint: item.fingerprint,
                            expected_version: projection.default_binding?.version ?? 0,
                          })
                        )
                      }}
                    >
                      {isDefault ? "当前默认" : "设为默认"}
                    </Button>
                  </div>
                </div>
              )
            }) : <p className="text-xs text-muted-foreground">还没有候选 Definition。</p>}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!accessToken || !projection?.default_binding || !actionFor(projection, "rollback_default_definition")?.enabled || busyKey !== null}
              onClick={() => {
                if (!accessToken || !projection?.default_binding) return
                void runConfirmed(
                  "default:rollback",
                  "确认把后续新运行回滚到上一个默认 Definition？",
                  () => updateAgentDefinitionDefault(accessToken, {
                    action: "rollback",
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
                disabled={!accessToken || !fixture.trim() || !expected.trim() || busyKey !== null}
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
                运行 baseline / candidate / evaluator
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
                        "确认以独立审核者身份准入这个 Definition？",
                        () => admitAgentDefinition(accessToken, evaluation.id)
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
                <h3 className="text-sm font-medium">开放 Runtime Lab</h3>
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
                    "确认创建会产生实际资源成本的 Runtime Lab？",
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
                创建 Lab
              </Button>
            </div>
            {projection?.runtime_labs.map((lab) => (
              <div key={lab.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{shortFingerprint(lab.id)}</span>
                  <Badge variant={lab.status === "ready" ? "default" : "outline"}>{lab.status}</Badge>
                </div>
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
      </SheetContent>
    </Sheet>
  )
}
