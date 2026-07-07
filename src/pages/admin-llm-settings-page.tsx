import * as React from "react"
import { Link } from "react-router-dom"
import {
  BotIcon,
  CheckIcon,
  KeyRoundIcon,
  PackageIcon,
  RefreshCwIcon,
  SaveIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useAuthSession } from "@/features/auth/app-session"
import {
  assignAdminUserPlan,
  listAdminLlmSecrets,
  listAdminModelProfiles,
  listAdminPlanModelAccess,
  listAdminPlans,
  listAdminUserMonthlyUsage,
  listAdminUserPlanAssignments,
  listAdminUsers,
  setAdminUserRole,
  upsertAdminLlmSecret,
  upsertAdminModelProfile,
  upsertAdminPlan,
  upsertAdminPlanModelAccess,
  type AdminLlmSecret,
  type AdminModelProfile,
  type AdminPlan,
  type AdminPlanModelAccess,
  type AdminUser,
  type AdminUserMonthlyUsage,
  type AdminUserPlanAssignment,
} from "@/lib/api/api-client"

type Section = "models" | "plans" | "secrets" | "users"
type LoadState = "idle" | "loading" | "saving"

const adminSections: Array<{
  id: Section
  title: string
  path: string
}> = [
  { id: "models", title: "模型管理", path: "/system/models" },
  { id: "plans", title: "套餐管理", path: "/system/plans" },
  { id: "secrets", title: "密钥管理", path: "/system/secrets" },
  { id: "users", title: "用户管理", path: "/system/users" },
]

const emptyModel: AdminModelProfile = {
  id: "deepseek",
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

const emptyPlan: AdminPlan = {
  id: "pro",
  name: "pro",
  display_name: "Pro",
  monthly_credit_limit: 100000,
  enabled: true,
}

const emptySecret = {
  secret_ref: "deepseek-default",
  secret: "",
  status: "active",
  metadata_json: {},
}

function numberOrNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? Number(trimmed) : null
}

function textOrNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function isRawApiKey(value: string) {
  const trimmed = value.trim().toLowerCase()
  return (
    trimmed.startsWith("sk-") ||
    trimmed.startsWith("sk_") ||
    trimmed.startsWith("bearer ")
  )
}

function modelAccessFor(planId: string, modelId: string): AdminPlanModelAccess {
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

function normalizeAccess(access: AdminPlanModelAccess): AdminPlanModelAccess {
  return {
    ...access,
    usable: access.visible ? access.usable : false,
  }
}

function Field({
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

function ToggleField({
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

function SystemAdminNav({ active }: { active: Section }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {adminSections.map((section) => (
        <Link
          key={section.id}
          to={section.path}
          className={`rounded-md border px-3 py-2 text-sm ${
            active === section.id
              ? "bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted"
          }`}
        >
          {section.title}
        </Link>
      ))}
    </nav>
  )
}

export function AdminLlmSettingsPage() {
  return <SystemAdminConsole section="models" />
}

export function SystemModelManagementPage() {
  return <SystemAdminConsole section="models" />
}

export function SystemPlanManagementPage() {
  return <SystemAdminConsole section="plans" />
}

export function SystemSecretManagementPage() {
  return <SystemAdminConsole section="secrets" />
}

export function SystemUserManagementPage() {
  return <SystemAdminConsole section="users" />
}

function SystemAdminConsole({ section }: { section: Section }) {
  const { accessToken, currentUser } = useAuthSession()
  const [models, setModels] = React.useState<AdminModelProfile[]>([])
  const [plans, setPlans] = React.useState<AdminPlan[]>([])
  const [secrets, setSecrets] = React.useState<AdminLlmSecret[]>([])
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [selectedPlanId, setSelectedPlanId] = React.useState("default-free")
  const [selectedUserId, setSelectedUserId] = React.useState("")
  const [selectedUserPlanId, setSelectedUserPlanId] = React.useState("")
  const [accessRows, setAccessRows] = React.useState<AdminPlanModelAccess[]>([])
  const [assignments, setAssignments] = React.useState<
    AdminUserPlanAssignment[]
  >([])
  const [usage, setUsage] = React.useState<AdminUserMonthlyUsage[]>([])
  const [modelForm, setModelForm] =
    React.useState<AdminModelProfile>(emptyModel)
  const [planForm, setPlanForm] = React.useState<AdminPlan>(emptyPlan)
  const [secretForm, setSecretForm] = React.useState(emptySecret)
  const [state, setState] = React.useState<LoadState>("idle")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const isAdmin = currentUser?.role === "admin"

  const activeTitle =
    adminSections.find((item) => item.id === section)?.title ?? "系统管理"

  const loadAdminData = React.useCallback(async () => {
    if (!accessToken || !isAdmin) {
      return
    }

    setState("loading")
    setError("")
    try {
      const [modelResult, planResult] = await Promise.all([
        listAdminModelProfiles(accessToken),
        listAdminPlans(accessToken),
      ])
      setModels(modelResult.profiles)
      setPlans(planResult.plans)
      setSelectedPlanId((current) =>
        planResult.plans.some((plan) => plan.id === current)
          ? current
          : (planResult.plans[0]?.id ?? "default-free"),
      )
      setSelectedUserPlanId((current) =>
        planResult.plans.some((plan) => plan.id === current)
          ? current
          : (planResult.plans[0]?.id ?? ""),
      )

      if (section === "secrets") {
        const secretResult = await listAdminLlmSecrets(accessToken)
        setSecrets(secretResult.secrets)
      }
      if (section === "users") {
        const userResult = await listAdminUsers(accessToken)
        setUsers(userResult.users)
        setSelectedUserId((current) =>
          userResult.users.some((user) => user.id === current)
            ? current
            : (userResult.users[0]?.id ?? ""),
        )
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败")
    } finally {
      setState("idle")
    }
  }, [accessToken, isAdmin, section])

  React.useEffect(() => {
    void loadAdminData()
  }, [loadAdminData])

  React.useEffect(() => {
    if (!accessToken || !isAdmin || section !== "plans" || !selectedPlanId) {
      setAccessRows([])
      return
    }

    let cancelled = false
    void listAdminPlanModelAccess(accessToken, selectedPlanId)
      .then((result) => {
        if (!cancelled) {
          setAccessRows(result.access.map(normalizeAccess))
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载失败")
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, isAdmin, section, selectedPlanId])

  React.useEffect(() => {
    if (!accessToken || !isAdmin || section !== "users" || !selectedUserId) {
      setAssignments([])
      setUsage([])
      return
    }

    let cancelled = false
    void Promise.all([
      listAdminUserPlanAssignments(accessToken, selectedUserId),
      listAdminUserMonthlyUsage(accessToken, selectedUserId),
    ])
      .then(([planResult, usageResult]) => {
        if (!cancelled) {
          setAssignments(planResult.assignments)
          setUsage(usageResult.usage)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载失败")
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, isAdmin, section, selectedUserId])

  async function saveModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) {
      return
    }
    if (modelForm.upstream_api_key_ref && isRawApiKey(modelForm.upstream_api_key_ref)) {
      setError("模型密钥字段只能填写 secret_ref 或 env:NAME，不能填写原始 API Key")
      return
    }

    setState("saving")
    setError("")
    try {
      const result = await upsertAdminModelProfile(accessToken, modelForm)
      setModels((current) => [
        result.profile,
        ...current.filter((item) => item.id !== result.profile.id),
      ])
      setMessage(`模型已保存：${result.profile.display_name}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败")
    } finally {
      setState("idle")
    }
  }

  async function savePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) {
      return
    }

    setState("saving")
    setError("")
    try {
      const result = await upsertAdminPlan(accessToken, planForm)
      setPlans((current) => [
        result.plan,
        ...current.filter((item) => item.id !== result.plan.id),
      ])
      setSelectedPlanId(result.plan.id)
      setSelectedUserPlanId(result.plan.id)
      setMessage(`套餐已保存：${result.plan.display_name}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败")
    } finally {
      setState("idle")
    }
  }

  async function saveSecret(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken) {
      return
    }

    setState("saving")
    setError("")
    try {
      const result = await upsertAdminLlmSecret(accessToken, secretForm)
      setSecrets((current) => [
        result.secret,
        ...current.filter((item) => item.secret_ref !== result.secret.secret_ref),
      ])
      setSecretForm((current) => ({ ...current, secret: "" }))
      setMessage(`密钥已保存：${result.secret.secret_ref}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败")
    } finally {
      setState("idle")
    }
  }

  async function saveAccess(modelId: string, next: AdminPlanModelAccess) {
    if (!accessToken) {
      return
    }

    const payload = normalizeAccess(next)
    setState("saving")
    setError("")
    try {
      const result = await upsertAdminPlanModelAccess(accessToken, payload)
      const normalized = normalizeAccess(result.access)
      setAccessRows((current) => [
        normalized,
        ...current.filter((item) => item.model_profile_id !== modelId),
      ])
      setMessage(`权限已保存：${selectedPlanId} / ${modelId}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败")
    } finally {
      setState("idle")
    }
  }

  async function updateUserRole(user: AdminUser, role: "user" | "admin") {
    if (!accessToken) {
      return
    }

    setState("saving")
    setError("")
    try {
      const result = await setAdminUserRole(accessToken, {
        user_id: user.id,
        role,
      })
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? result.user : item)),
      )
      setMessage(`用户角色已更新：${result.user.email}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败")
    } finally {
      setState("idle")
    }
  }

  async function assignPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken || !selectedUserId || !selectedUserPlanId) {
      return
    }

    setState("saving")
    setError("")
    try {
      const result = await assignAdminUserPlan(accessToken, {
        user_id: selectedUserId,
        plan_id: selectedUserPlanId,
      })
      setAssignments((current) => [
        result.assignment,
        ...current.filter((item) => item.id !== result.assignment.id),
      ])
      setMessage(`套餐已分配：${selectedUserPlanId}`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败")
    } finally {
      setState("idle")
    }
  }

  if (!isAdmin) {
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

  return (
    <main className="flex w-full flex-1 flex-col gap-5 p-5 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">系统管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">{activeTitle}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadAdminData()}
          disabled={state !== "idle"}
        >
          <RefreshCwIcon />
          刷新
        </Button>
      </header>

      <SystemAdminNav active={section} />

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

      {section === "models" ? (
        <ModelSection
          models={models}
          modelForm={modelForm}
          state={state}
          setModelForm={setModelForm}
          saveModel={saveModel}
        />
      ) : null}

      {section === "plans" ? (
        <PlanSection
          models={models}
          plans={plans}
          planForm={planForm}
          selectedPlanId={selectedPlanId}
          accessRows={accessRows}
          state={state}
          setPlanForm={setPlanForm}
          setSelectedPlanId={setSelectedPlanId}
          savePlan={savePlan}
          saveAccess={saveAccess}
        />
      ) : null}

      {section === "secrets" ? (
        <SecretSection
          secrets={secrets}
          secretForm={secretForm}
          state={state}
          setSecretForm={setSecretForm}
          saveSecret={saveSecret}
        />
      ) : null}

      {section === "users" ? (
        <UserSection
          users={users}
          plans={plans}
          assignments={assignments}
          usage={usage}
          selectedUserId={selectedUserId}
          selectedUserPlanId={selectedUserPlanId}
          state={state}
          setSelectedUserId={setSelectedUserId}
          setSelectedUserPlanId={setSelectedUserPlanId}
          updateUserRole={updateUserRole}
          assignPlan={assignPlan}
        />
      ) : null}
    </main>
  )
}

function ModelSection({
  models,
  modelForm,
  state,
  setModelForm,
  saveModel,
}: {
  models: AdminModelProfile[]
  modelForm: AdminModelProfile
  state: LoadState
  setModelForm: React.Dispatch<React.SetStateAction<AdminModelProfile>>
  saveModel: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <form
        onSubmit={(event) => void saveModel(event)}
        className="rounded-lg border bg-background p-4"
      >
        <div className="mb-4 flex items-center gap-2">
          <BotIcon className="size-4 text-muted-foreground" />
          <h2 className="font-semibold">模型档案</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="模型 ID">
            <Input
              value={modelForm.id}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  id: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="展示名">
            <Input
              value={modelForm.display_name}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  display_name: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Endpoint">
            <Input
              value={modelForm.endpoint_kind}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  endpoint_kind: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="上游模型名">
            <Input
              value={modelForm.upstream_model_name}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  upstream_model_name: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Base URL">
            <Input
              value={modelForm.upstream_base_url ?? ""}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  upstream_base_url: textOrNull(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="密钥引用（secret_ref 或 env:NAME）">
            <Input
              value={modelForm.upstream_api_key_ref ?? ""}
              placeholder="例如 deepseek-default 或 env:DEEPSEEK_API_KEY"
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  upstream_api_key_ref: textOrNull(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="默认 max tokens">
            <Input
              type="number"
              value={modelForm.default_max_tokens ?? ""}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  default_max_tokens: numberOrNull(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="上下文长度">
            <Input
              type="number"
              value={modelForm.context_window_tokens ?? ""}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  context_window_tokens: numberOrNull(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="使用倍率">
            <Input
              type="number"
              step="0.01"
              value={modelForm.usage_multiplier}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  usage_multiplier: Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="排序">
            <Input
              type="number"
              value={modelForm.sort_order}
              onChange={(event) =>
                setModelForm((current) => ({
                  ...current,
                  sort_order: Number(event.target.value),
                }))
              }
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <ToggleField
            label="启用"
            checked={modelForm.enabled}
            onCheckedChange={(checked) =>
              setModelForm((current) => ({ ...current, enabled: checked }))
            }
          />
          <ToggleField
            label="Tool"
            checked={modelForm.supports_tool_calls}
            onCheckedChange={(checked) =>
              setModelForm((current) => ({
                ...current,
                supports_tool_calls: checked,
              }))
            }
          />
          <ToggleField
            label="Reasoning"
            checked={modelForm.supports_reasoning}
            onCheckedChange={(checked) =>
              setModelForm((current) => ({
                ...current,
                supports_reasoning: checked,
              }))
            }
          />
          <ToggleField
            label="Vision"
            checked={modelForm.supports_vision}
            onCheckedChange={(checked) =>
              setModelForm((current) => ({
                ...current,
                supports_vision: checked,
              }))
            }
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={state !== "idle"}>
            <SaveIcon />
            保存模型
          </Button>
        </div>
      </form>

      <div className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 font-semibold">模型列表</h2>
        <div className="grid gap-2">
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() =>
                setModelForm({
                  ...model,
                  metadata_json: model.metadata_json ?? {},
                })
              }
              className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <div className="font-medium">{model.display_name}</div>
              <div className="text-muted-foreground">
                {model.id} / {model.upstream_model_name}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function PlanSection({
  models,
  plans,
  planForm,
  selectedPlanId,
  accessRows,
  state,
  setPlanForm,
  setSelectedPlanId,
  savePlan,
  saveAccess,
}: {
  models: AdminModelProfile[]
  plans: AdminPlan[]
  planForm: AdminPlan
  selectedPlanId: string
  accessRows: AdminPlanModelAccess[]
  state: LoadState
  setPlanForm: React.Dispatch<React.SetStateAction<AdminPlan>>
  setSelectedPlanId: React.Dispatch<React.SetStateAction<string>>
  savePlan: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  saveAccess: (modelId: string, next: AdminPlanModelAccess) => Promise<void>
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="grid gap-4">
        <form
          onSubmit={(event) => void savePlan(event)}
          className="rounded-lg border bg-background p-4"
        >
          <div className="mb-4 flex items-center gap-2">
            <PackageIcon className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">套餐</h2>
          </div>
          <div className="grid gap-3">
            <Field label="套餐 ID">
              <Input
                value={planForm.id}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    id: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="内部名称">
              <Input
                value={planForm.name}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="展示名">
              <Input
                value={planForm.display_name}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    display_name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="月额度">
              <Input
                type="number"
                value={planForm.monthly_credit_limit ?? ""}
                onChange={(event) =>
                  setPlanForm((current) => ({
                    ...current,
                    monthly_credit_limit: numberOrNull(event.target.value),
                  }))
                }
              />
            </Field>
            <ToggleField
              label="启用套餐"
              checked={planForm.enabled}
              onCheckedChange={(checked) =>
                setPlanForm((current) => ({ ...current, enabled: checked }))
              }
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={state !== "idle"}>
              <SaveIcon />
              保存套餐
            </Button>
          </div>
        </form>

        <div className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 font-semibold">套餐列表</h2>
          <div className="grid gap-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setPlanForm(plan)
                  setSelectedPlanId(plan.id)
                }}
                className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <div className="font-medium">{plan.display_name}</div>
                <div className="text-muted-foreground">
                  {plan.id} / {plan.monthly_credit_limit ?? "不限额"}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-background p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">套餐模型权限</h2>
          </div>
          <select
            value={selectedPlanId}
            onChange={(event) => setSelectedPlanId(event.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          {models.map((model) => {
            const existing = accessRows.find(
              (item) => item.model_profile_id === model.id,
            )
            const access = normalizeAccess(
              existing ?? modelAccessFor(selectedPlanId, model.id),
            )

            return (
              <div
                key={model.id}
                className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto_auto_auto]"
              >
                <div>
                  <div className="font-medium">{model.display_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {model.id} / {model.upstream_model_name}
                  </div>
                </div>
                <ToggleField
                  label="可见"
                  checked={access.visible}
                  onCheckedChange={(checked) =>
                    void saveAccess(model.id, {
                      ...access,
                      visible: checked,
                      usable: checked ? access.usable : false,
                    })
                  }
                />
                <ToggleField
                  label="可用"
                  checked={access.usable}
                  disabled={!access.visible}
                  onCheckedChange={(checked) =>
                    void saveAccess(model.id, { ...access, usable: checked })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void saveAccess(model.id, access)}
                  disabled={state !== "idle"}
                >
                  <CheckIcon />
                  授权
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function SecretSection({
  secrets,
  secretForm,
  state,
  setSecretForm,
  saveSecret,
}: {
  secrets: AdminLlmSecret[]
  secretForm: typeof emptySecret
  state: LoadState
  setSecretForm: React.Dispatch<React.SetStateAction<typeof emptySecret>>
  saveSecret: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <form
        onSubmit={(event) => void saveSecret(event)}
        className="rounded-lg border bg-background p-4"
      >
        <div className="mb-4 flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-muted-foreground" />
          <h2 className="font-semibold">上游密钥</h2>
        </div>
        <div className="grid gap-3">
          <Field label="密钥引用">
            <Input
              value={secretForm.secret_ref}
              onChange={(event) =>
                setSecretForm((current) => ({
                  ...current,
                  secret_ref: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="密钥值">
            <Input
              type="password"
              value={secretForm.secret}
              placeholder="保存后不会回显"
              onChange={(event) =>
                setSecretForm((current) => ({
                  ...current,
                  secret: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="状态">
            <Input
              value={secretForm.status}
              onChange={(event) =>
                setSecretForm((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={state !== "idle"}>
            <SaveIcon />
            保存密钥
          </Button>
        </div>
      </form>

      <div className="rounded-lg border bg-background p-4">
        <h2 className="mb-3 font-semibold">密钥列表</h2>
        <div className="grid gap-2">
          {secrets.map((secret) => (
            <button
              key={secret.secret_ref}
              type="button"
              onClick={() =>
                setSecretForm({
                  secret_ref: secret.secret_ref,
                  secret: "",
                  status: secret.status,
                  metadata_json: secret.metadata_json ?? {},
                })
              }
              className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <div className="font-medium">{secret.secret_ref}</div>
              <div className="text-muted-foreground">
                {secret.status} / {secret.has_secret ? "已保存" : "无密钥"}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function UserSection({
  users,
  plans,
  assignments,
  usage,
  selectedUserId,
  selectedUserPlanId,
  state,
  setSelectedUserId,
  setSelectedUserPlanId,
  updateUserRole,
  assignPlan,
}: {
  users: AdminUser[]
  plans: AdminPlan[]
  assignments: AdminUserPlanAssignment[]
  usage: AdminUserMonthlyUsage[]
  selectedUserId: string
  selectedUserPlanId: string
  state: LoadState
  setSelectedUserId: React.Dispatch<React.SetStateAction<string>>
  setSelectedUserPlanId: React.Dispatch<React.SetStateAction<string>>
  updateUserRole: (user: AdminUser, role: "user" | "admin") => Promise<void>
  assignPlan: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}) {
  const selectedUser = users.find((user) => user.id === selectedUserId)

  return (
    <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-lg border bg-background p-4">
        <div className="mb-4 flex items-center gap-2">
          <UsersIcon className="size-4 text-muted-foreground" />
          <h2 className="font-semibold">用户列表</h2>
        </div>
        <div className="grid gap-2">
          {users.map((user) => (
            <div
              key={user.id}
              className={`grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] ${
                user.id === selectedUserId ? "border-primary" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedUserId(user.id)}
                className="text-left"
              >
                <div className="font-medium">{user.display_name}</div>
                <div className="text-sm text-muted-foreground">
                  {user.email} / {user.status}
                </div>
              </button>
              <select
                value={user.role ?? "user"}
                disabled={state !== "idle"}
                onChange={(event) =>
                  void updateUserRole(
                    user,
                    event.target.value === "admin" ? "admin" : "user",
                  )
                }
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <form
          onSubmit={(event) => void assignPlan(event)}
          className="rounded-lg border bg-background p-4"
        >
          <div className="mb-4 flex items-center gap-2">
            <PackageIcon className="size-4 text-muted-foreground" />
            <h2 className="font-semibold">用户套餐</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="当前用户">
              <Input value={selectedUser?.email ?? ""} readOnly />
            </Field>
            <Field label="分配套餐">
              <select
                value={selectedUserPlanId}
                onChange={(event) => setSelectedUserPlanId(event.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.display_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={state !== "idle" || !selectedUser || !selectedUserPlanId}
            >
              <SaveIcon />
              分配套餐
            </Button>
          </div>
        </form>

        <div className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 font-semibold">套餐记录</h2>
          <div className="grid gap-2">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <div className="font-medium">{assignment.plan_id}</div>
                <div className="text-muted-foreground">
                  {assignment.status} / {assignment.effective_from}
                </div>
              </div>
            ))}
            {assignments.length === 0 ? (
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                暂无套餐记录
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 font-semibold">月度用量</h2>
          <div className="grid gap-2">
            {usage.map((item) => (
              <div
                key={item.period_yyyymm}
                className="grid gap-2 rounded-md border px-3 py-2 text-sm md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="font-medium">{item.period_yyyymm}</div>
                  <div className="text-muted-foreground">
                    token {item.raw_total_tokens}
                  </div>
                </div>
                <div className="text-right">
                  {item.charged_credits.toFixed(4)} credits
                </div>
              </div>
            ))}
            {usage.length === 0 ? (
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                暂无用量记录
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
