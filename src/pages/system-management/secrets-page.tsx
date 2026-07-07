import * as React from "react"
import { CheckIcon, KeyRoundIcon, PlusIcon, SaveIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AppDialog,
  AppSearchBar,
  AppSectionCard,
  EmptyState,
  StatusBadge,
} from "@/components/app"
import { useAuthSession } from "@/features/auth/app-session"
import {
  listAdminLlmSecrets,
  upsertAdminLlmSecret,
  type AdminLlmSecret,
} from "@/lib/api/api-client"
import { normalizeAppError } from "@/lib/app/api-errors"
import { notify } from "@/lib/app/notifications"

import {
  AdminAccessDenied,
  Field,
  SystemPageShell,
  emptySecret,
  type LoadState,
} from "./shared"

type SecretForm = typeof emptySecret

export function SystemSecretManagementPage() {
  const { accessToken, currentUser } = useAuthSession()
  const [secrets, setSecrets] = React.useState<AdminLlmSecret[]>([])
  const [query, setQuery] = React.useState("")
  const [editingSecret, setEditingSecret] = React.useState<SecretForm | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [state, setState] = React.useState<LoadState>("idle")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const isAdmin = currentUser?.role === "admin"

  const loadSecrets = React.useCallback(async () => {
    if (!accessToken || !isAdmin) return
    setState("loading")
    setError("")
    try {
      const result = await listAdminLlmSecrets(accessToken)
      setSecrets(result.secrets)
    } catch (loadError) {
      const appError = normalizeAppError(loadError, {
        fallbackMessage: "加载失败",
      })
      setError(appError.message)
      notify.error({
        title: "加载密钥失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }, [accessToken, isAdmin])

  React.useEffect(() => {
    void loadSecrets()
  }, [loadSecrets])

  const filteredSecrets = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return secrets
    return secrets.filter((secret) =>
      `${secret.secret_ref} ${secret.status}`.toLowerCase().includes(keyword),
    )
  }, [query, secrets])

  const metrics = React.useMemo(
    () => [
      {
        label: "Secrets",
        value: String(secrets.length),
        detail: `${secrets.filter((secret) => secret.has_secret).length} stored`,
        icon: KeyRoundIcon,
        tone: "blue" as const,
      },
      {
        label: "Active",
        value: String(secrets.filter((secret) => secret.status === "active").length),
        detail: "ready references",
        icon: CheckIcon,
        tone: "green" as const,
      },
      {
        label: "Missing",
        value: String(secrets.filter((secret) => !secret.has_secret).length),
        detail: "without secret value",
        icon: KeyRoundIcon,
        tone: "amber" as const,
      },
    ],
    [secrets],
  )

  function openCreateDialog() {
    setEditingSecret({ ...emptySecret, secret: "" })
    setDialogOpen(true)
  }

  function openEditDialog(secret: AdminLlmSecret) {
    setEditingSecret({
      secret_ref: secret.secret_ref,
      secret: "",
      status: secret.status,
      metadata_json: secret.metadata_json ?? {},
    })
    setDialogOpen(true)
  }

  async function saveSecret(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessToken || !editingSecret) return
    setState("saving")
    setError("")
    try {
      const result = await upsertAdminLlmSecret(accessToken, editingSecret)
      setSecrets((current) => [
        result.secret,
        ...current.filter((item) => item.secret_ref !== result.secret.secret_ref),
      ])
      setMessage(`密钥已保存：${result.secret.secret_ref}`)
      notify.success({
        title: "密钥已保存",
        description: result.secret.secret_ref,
      })
      setDialogOpen(false)
    } catch (saveError) {
      const appError = normalizeAppError(saveError, {
        fallbackMessage: "保存失败",
      })
      setError(appError.message)
      notify.error({
        title: "保存密钥失败",
        description: appError.message,
      })
    } finally {
      setState("idle")
    }
  }

  if (!isAdmin) return <AdminAccessDenied />

  return (
    <SystemPageShell
      title="密钥管理"
      subtitle="集中维护上游模型密钥引用，模型档案只保存 secret_ref 或 env:NAME。"
      metrics={metrics}
      state={state}
      message={message}
      error={error}
      onRefresh={() => void loadSecrets()}
    >
      <AppSectionCard
        title="密钥列表"
        description="每张卡片代表一个上游密钥引用。密钥值保存后不会回显。"
        icon={KeyRoundIcon}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden w-72 md:block">
              <AppSearchBar
                value={query}
                onChange={setQuery}
                placeholder="搜索密钥..."
              />
            </div>
            <Button type="button" onClick={openCreateDialog}>
              <PlusIcon />
              新增密钥
            </Button>
          </div>
        }
      >
        <div className="mb-3 md:hidden">
          <AppSearchBar value={query} onChange={setQuery} placeholder="搜索密钥..." />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredSecrets.map((secret) => (
            <div
              key={secret.secret_ref}
              className="rounded-md border border-border bg-background/60 p-4 text-sm transition-colors hover:bg-muted/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{secret.secret_ref}</div>
                  <div className="mt-1 truncate text-muted-foreground">
                    {secret.has_secret ? "已保存" : "无密钥"}
                  </div>
                </div>
                <StatusBadge status={secret.status} />
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(secret)}
                >
                  编辑
                </Button>
              </div>
            </div>
          ))}
          {filteredSecrets.length === 0 ? (
            <EmptyState title="暂无密钥" detail="新增上游密钥后会出现在这里。" />
          ) : null}
        </div>
      </AppSectionCard>

      <AppDialog
        open={dialogOpen}
        title={editingSecret?.secret_ref ? "编辑密钥" : "新增密钥"}
        description="编辑已有密钥时，密钥值留空表示不修改密钥内容。"
        onOpenChange={setDialogOpen}
      >
        {editingSecret ? (
          <SecretForm
            secret={editingSecret}
            state={state}
            onChange={setEditingSecret}
            onSubmit={saveSecret}
            onCancel={() => setDialogOpen(false)}
          />
        ) : null}
      </AppDialog>
    </SystemPageShell>
  )
}

function SecretForm({
  secret,
  state,
  onChange,
  onSubmit,
  onCancel,
}: {
  secret: SecretForm
  state: LoadState
  onChange: React.Dispatch<React.SetStateAction<SecretForm | null>>
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}) {
  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <div className="grid gap-3">
        <Field label="密钥引用">
          <Input
            value={secret.secret_ref}
            onChange={(event) =>
              onChange((current) =>
                current ? { ...current, secret_ref: event.target.value } : current,
              )
            }
          />
        </Field>
        <Field label="密钥值">
          <Input
            type="password"
            value={secret.secret}
            placeholder="保存后不会回显"
            onChange={(event) =>
              onChange((current) =>
                current ? { ...current, secret: event.target.value } : current,
              )
            }
          />
        </Field>
        <Field label="状态">
          <Input
            value={secret.status}
            onChange={(event) =>
              onChange((current) =>
                current ? { ...current, status: event.target.value } : current,
              )
            }
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={state !== "idle"}>
          <SaveIcon />
          保存密钥
        </Button>
      </div>
    </form>
  )
}
