import * as React from "react"
import { CheckIcon, ChevronDownIcon, Edit3Icon, KeyRoundIcon, PlusIcon, SaveIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AppDialog,
  AppDisclosureSection,
  AppExpandablePanel,
  AppFieldGrid,
  AppListToolbar,
  AppSearchBar,
  AppSectionCard,
  DataTableBody,
  DataTableHeader,
  DataTableShell,
  EmptyState,
  FormField,
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
  const [expandedSecretRefs, setExpandedSecretRefs] = React.useState<Set<string>>(
    () => new Set()
  )
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

  function toggleExpandedSecret(secretRef: string) {
    setExpandedSecretRefs((current) => {
      const next = new Set(current)
      if (next.has(secretRef)) {
        next.delete(secretRef)
      } else {
        next.add(secretRef)
      }
      return next
    })
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
        description="主视图保持单列表格，安全说明和 metadata 通过行内展开查看。"
        icon={KeyRoundIcon}
      >
        <AppListToolbar
          search={
            <AppSearchBar
              value={query}
              onChange={setQuery}
              placeholder="搜索密钥..."
            />
          }
          actions={
            <Button type="button" onClick={openCreateDialog}>
              <PlusIcon />
              新增密钥
            </Button>
          }
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="grid gap-3">
          {filteredSecrets.length > 0 ? (
            <DataTableShell>
              <DataTableHeader>
                <tr>
                  <th className="w-12 px-3 py-3 sm:px-4" />
                  <th className="w-auto px-3 py-3 sm:px-4">密钥引用</th>
                  <th className="hidden w-28 px-4 py-3 @xl/table:table-cell">保存状态</th>
                  <th className="w-20 px-3 py-3 sm:w-24 sm:px-4">状态</th>
                  <th className="w-16 px-3 py-3 text-right sm:w-24 sm:px-4">操作</th>
                </tr>
              </DataTableHeader>
              <DataTableBody>
                {filteredSecrets.map((secret) => {
                  const expanded = expandedSecretRefs.has(secret.secret_ref)
                  return (
                    <React.Fragment key={secret.secret_ref}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-3 py-3 sm:px-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={expanded ? "收起密钥详情" : "展开密钥详情"}
                            onClick={() => toggleExpandedSecret(secret.secret_ref)}
                          >
                            <ChevronDownIcon
                              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </td>
                        <td className="min-w-0 px-3 py-3 sm:px-4">
                          <div className="truncate font-medium">{secret.secret_ref}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            密钥值保存后不会回显
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 @xl/table:table-cell">
                          <StatusBadge status={secret.has_secret ? "saved" : "missing"} />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <StatusBadge status={secret.status} />
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(secret)}
                            >
                              <Edit3Icon />
                              <span className="hidden sm:inline">编辑</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <AppExpandablePanel>
                              <SecretDetail secret={secret} />
                            </AppExpandablePanel>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </DataTableBody>
            </DataTableShell>
          ) : null}
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

function SecretDetail({ secret }: { secret: AdminLlmSecret }) {
  const metadata =
    secret.metadata_json && Object.keys(secret.metadata_json).length > 0
      ? JSON.stringify(secret.metadata_json)
      : "无 metadata"

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="text-[11px] font-medium uppercase text-muted-foreground">
          安全说明
        </div>
        <p className="mt-1 text-sm leading-6">
          密钥值不会回显。编辑已有密钥时，留空表示不修改密钥内容。
        </p>
      </div>
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="text-[11px] font-medium uppercase text-muted-foreground">
          Secret value
        </div>
        <div className="mt-1 text-sm">{secret.has_secret ? "已保存" : "未保存"}</div>
      </div>
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="text-[11px] font-medium uppercase text-muted-foreground">
          Metadata
        </div>
        <div className="mt-1 truncate text-sm">{metadata}</div>
      </div>
    </div>
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
      <AppDisclosureSection
        title="安全说明"
        description="密钥值不会回显；编辑已有密钥时留空表示不修改密钥内容。"
      >
        <p className="text-sm leading-6 text-muted-foreground">
          这里只维护 secret ref 和密钥状态。模型档案应引用 secret ref 或 env:NAME，不应保存原始 API key。
        </p>
      </AppDisclosureSection>
      <AppDisclosureSection title="密钥内容">
        <AppFieldGrid columns={1}>
          <FormField label="密钥引用">
            <Input
              value={secret.secret_ref}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, secret_ref: event.target.value } : current,
                )
              }
            />
          </FormField>
          <FormField label="密钥值">
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
          </FormField>
          <FormField label="状态">
            <Input
              value={secret.status}
              onChange={(event) =>
                onChange((current) =>
                  current ? { ...current, status: event.target.value } : current,
                )
              }
            />
          </FormField>
        </AppFieldGrid>
      </AppDisclosureSection>
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
