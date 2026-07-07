import * as React from "react"
import { ShieldIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { WorkbenchPage, type MetricCard } from "@/components/workbench"
import {
  type AdminModelProfilePayload,
  type AdminPlanPayload,
  type AdminPlanModelAccess,
} from "@/lib/api/api-client"

export type LoadState = "idle" | "loading" | "saving"

export const emptyModel: AdminModelProfilePayload = {
  display_name: "DeepSeek Chat",
  endpoint_kind: "openai_compatible",
  upstream_model_name: "deepseek-chat",
  upstream_base_url: "https://api.deepseek.com",
  upstream_api_key_ref: null,
  default_temperature: 0.7,
  default_top_p: 1,
  default_frequency_penalty: 0,
  default_presence_penalty: 0,
  default_max_tokens: 8192,
  context_window_tokens: null,
  max_output_tokens: 8192,
  supports_tool_calls: true,
  supports_reasoning: false,
  supports_json_schema: false,
  supports_vision: false,
  usage_multiplier: 1,
  enabled: true,
  sort_order: 10,
  metadata_json: {},
}

export const emptyPlan: AdminPlanPayload = {
  name: "pro",
  display_name: "Pro",
  monthly_credit_limit: 100000,
  enabled: true,
}

export const emptySecret = {
  secret_ref: "deepseek-default",
  secret: "",
  status: "active",
  metadata_json: {},
}

export function numberOrNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? Number(trimmed) : null
}

export function textOrNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function isRawApiKey(value: string) {
  const trimmed = value.trim().toLowerCase()
  return (
    trimmed.startsWith("sk-") ||
    trimmed.startsWith("sk_") ||
    trimmed.startsWith("bearer ")
  )
}

export function modelAccessFor(
  planId: string,
  modelId: string,
): AdminPlanModelAccess {
  return {
    plan_id: planId,
    model_profile_id: modelId,
    visible: true,
    usable: true,
    input_multiplier: 1,
    output_multiplier: 1,
    reasoning_multiplier: 1,
    cached_input_multiplier: 0.25,
    max_tokens_per_request: null,
    max_requests_per_day: null,
  }
}

export function normalizeAccess(
  access: AdminPlanModelAccess,
): AdminPlanModelAccess {
  return {
    ...access,
    usable: access.visible ? access.usable : false,
  }
}

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function ToggleField({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span className={disabled ? "text-muted-foreground" : undefined}>
        {label}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </label>
  )
}

export function AdminAccessDenied() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
      <div className="rounded-lg border bg-background p-6">
        <ShieldIcon className="mb-3 size-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">管理员权限不足</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          当前账号没有 admin 角色，无法访问系统管理。
        </p>
      </div>
    </main>
  )
}

export function SystemPageShell({
  title,
  subtitle,
  metrics,
  state,
  message,
  error,
  onRefresh,
  children,
}: {
  title: string
  subtitle: string
  metrics: MetricCard[]
  state: LoadState
  message: string
  error: string
  onRefresh: () => void
  children: React.ReactNode
}) {
  return (
    <WorkbenchPage
      eyebrow="System Management"
      title={title}
      subtitle={subtitle}
      metrics={metrics}
      headerActions={
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={state !== "idle"}
        >
          刷新
        </Button>
      }
    >
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {children}
    </WorkbenchPage>
  )
}
