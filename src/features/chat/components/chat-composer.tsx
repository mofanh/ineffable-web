import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { containChatWheel } from "@/features/chat/components/chat-scroll-boundary"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SidebarFooter } from "@/components/ui/sidebar"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type {
  CapabilityExposureMode,
  CapabilityExposurePolicy,
  CapabilityExposureSelection,
} from "@/lib/api/api-client"
import { cn } from "@/lib/utils"
import {
  ArrowUpIcon,
  AtSignIcon,
  BotIcon,
  FileTextIcon,
  GripVerticalIcon,
  GitBranchIcon,
  LoaderCircleIcon,
  SendHorizontalIcon,
  SquareIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

export type PreInputQueueItem = {
  id: string
  content: string
  status?: "queued" | "promoting" | "deleting"
}

export type AgentDescriptorOption = {
  workspaceId: string
  workspaceName: string
  path: string
  label: string
}

export type ModelProfileOption = {
  id: string
  displayName: string
  supportsReasoning: boolean
  supportsToolCalls: boolean
}

type ChatComposerProps = {
  isFullScreen: boolean
  composer: string
  error: string | null
  isSending: boolean
  isSubmittingInput: boolean
  canPromoteToGuided: boolean
  preInputQueue: PreInputQueueItem[]
  agentDescriptorOptions: AgentDescriptorOption[]
  modelOptions: ModelProfileOption[]
  isModelCatalogLoaded: boolean
  selectedModelProfileId: string
  sandboxOptions: { environmentId: string; label: string; status: string }[]
  isRefreshingSandboxOptions: boolean
  selectedSandboxEnvironmentId: string
  capabilityExposureSelection: CapabilityExposureSelection
  capabilityExposurePolicy: CapabilityExposurePolicy | null
  agentIterationRequested: boolean
  agentIterationMode: "disabled" | "declarative_only" | "artifact_allowed" | "runtime_lab_allowed"
  isAgentIterationLoading: boolean
  agentIterationUnavailableReason?: string | null
  onComposerChange: (value: string) => void
  onComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onModelProfileChange: (value: string) => void
  onSandboxEnvironmentChange: (value: string) => void
  onSandboxOptionsRefresh: () => void
  onCapabilityExposureChange: (selection: CapabilityExposureSelection) => void
  onAgentIterationChange: (requested: boolean) => void
  onSend: () => void
  onStop: () => void
  onPromoteToGuided: (id: string) => void
  onDeleteFromQueue: (id: string) => void
}

export function ChatComposer({
  isFullScreen,
  composer,
  error,
  isSending,
  isSubmittingInput,
  canPromoteToGuided,
  preInputQueue,
  agentDescriptorOptions,
  modelOptions,
  isModelCatalogLoaded,
  selectedModelProfileId,
  sandboxOptions,
  isRefreshingSandboxOptions,
  selectedSandboxEnvironmentId,
  capabilityExposureSelection,
  capabilityExposurePolicy,
  agentIterationRequested,
  agentIterationMode,
  isAgentIterationLoading,
  agentIterationUnavailableReason,
  onComposerChange,
  onComposerKeyDown,
  onModelProfileChange,
  onSandboxEnvironmentChange,
  onSandboxOptionsRefresh,
  onCapabilityExposureChange,
  onAgentIterationChange,
  onSend,
  onStop,
  onPromoteToGuided,
  onDeleteFromQueue,
}: ChatComposerProps) {
  const { t } = useTranslation()
  const [isAgentMenuOpen, setIsAgentMenuOpen] = React.useState(false)
  const allowedCapabilityModes = capabilityExposurePolicy?.allowed_modes ?? [
    "smart",
    "clean",
  ]
  const selectableCapabilityFamilies =
    capabilityExposurePolicy?.allowed_families.length
      ? capabilityExposurePolicy.allowed_families
      : [
          "workspace.files",
          "sandbox.files",
          "sandbox.command",
          "web.research",
          "agent.delegation",
          "agent.evolution",
          "automation",
          "interaction",
          "planning",
          "mcp",
          "skills",
        ]

  function selectCapabilityMode(mode: CapabilityExposureMode) {
    onCapabilityExposureChange({
      mode,
      custom:
        mode === "custom"
          ? capabilityExposureSelection.custom ?? {
              families: [],
              capabilities: [],
              discovery_scope: { kind: "all_authorized" },
            }
          : undefined,
    })
  }

  function toggleCapabilityFamily(family: string, checked: boolean) {
    const current = capabilityExposureSelection.custom ?? {
      families: [],
      capabilities: [],
      discovery_scope: { kind: "all_authorized" } as const,
    }
    const families = checked
      ? Array.from(new Set([...current.families, family])).sort()
      : current.families.filter((item) => item !== family)
    onCapabilityExposureChange({
      mode: "custom",
      custom: {
        ...current,
        families,
        discovery_scope: families.length
          ? { kind: "families", families }
          : { kind: "all_authorized" },
      },
    })
  }

  const isActionPending = (status?: PreInputQueueItem["status"]) =>
    status === "promoting" || status === "deleting"
  const agentTrigger = React.useMemo(() => {
    const match = composer.match(/(^|\s)@([^\s@]*)$/)
    if (!match || match.index == null) {
      return null
    }

    return {
      query: match[2].toLowerCase(),
      start: match.index + match[1].length,
    }
  }, [composer])
  const filteredAgentOptions = React.useMemo(() => {
    if (!agentTrigger?.query) {
      return agentDescriptorOptions
    }

    return agentDescriptorOptions.filter((option) => {
      const haystack = `${option.workspaceName} ${option.label} ${option.path}`.toLowerCase()
      return haystack.includes(agentTrigger.query)
    })
  }, [agentDescriptorOptions, agentTrigger])
  const groupedAgentOptions = React.useMemo(
    () =>
      filteredAgentOptions.reduce<
        { workspaceId: string; workspaceName: string; options: AgentDescriptorOption[] }[]
      >((groups, option) => {
        const group = groups.find((item) => item.workspaceId === option.workspaceId)
        if (group) {
          group.options.push(option)
          return groups
        }

        groups.push({
          workspaceId: option.workspaceId,
          workspaceName: option.workspaceName,
          options: [option],
        })
        return groups
      }, []),
    [filteredAgentOptions]
  )
  const shouldShowAgentMenu = isAgentMenuOpen && Boolean(agentTrigger)
  const hasAgentFiles = agentDescriptorOptions.length > 0
  const hasFilteredAgentFiles = filteredAgentOptions.length > 0
  const agentMenuHint = hasAgentFiles
    ? t("chat.composer.searchAgents")
    : t("chat.composer.createAgentHint")

  function handleComposerValueChange(value: string) {
    onComposerChange(value)
    setIsAgentMenuOpen(/(^|\s)@([^\s@]*)$/.test(value))
  }

  function insertAgentDescriptor(option: AgentDescriptorOption) {
    const mention = `@agent(${option.workspaceId}:${option.path})`
    if (!agentTrigger) {
      const trimmedEnd = composer.replace(/\s+$/, "")
      onComposerChange(trimmedEnd ? `${trimmedEnd}\n${mention} ` : `${mention} `)
      setIsAgentMenuOpen(false)
      return
    }

    onComposerChange(`${composer.slice(0, agentTrigger.start)}${mention} `)
    setIsAgentMenuOpen(false)
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && shouldShowAgentMenu) {
      event.preventDefault()
      setIsAgentMenuOpen(false)
      return
    }

    onComposerKeyDown(event)
  }

  function handleAgentOptionMouseDown(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
  }

  function handleComposerFocus() {
    if (agentTrigger) {
      setIsAgentMenuOpen(true)
    }
  }

  function handleComposerBlur() {
    window.setTimeout(() => setIsAgentMenuOpen(false), 120)
  }

  return (
    <SidebarFooter
      className={cn(
        "w-full p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
        isFullScreen && "mx-auto max-w-[780px] px-5 md:px-2"
      )}
    >
      {preInputQueue.length > 0 ? (
        <div className="mb-1.5 space-y-1.5">
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
            <GripVerticalIcon className="size-3" />
            <span>{t("chat.composer.queue", { count: preInputQueue.length })}</span>
          </div>
          <div className="max-h-[140px] space-y-1 overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-1.5">
            {preInputQueue.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-1.5 rounded-lg bg-background px-2.5 py-2 text-[13px] leading-snug shadow-sm"
              >
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground/80">
                  {item.status === "queued" ? t("chat.composer.queued") : ""}
                  {item.status === "promoting" ? t("chat.composer.promoting") : ""}
                  {item.status === "deleting" ? t("chat.composer.deleting") : ""}
                  {item.content.length > 100
                    ? `${item.content.slice(0, 100)}...`
                    : item.content}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6 rounded-md text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700"
                    title={
                      canPromoteToGuided
                        ? t("chat.composer.promoteTitle")
                        : t("chat.composer.promoteUnavailable")
                    }
                    onClick={() => onPromoteToGuided(item.id)}
                    disabled={
                      !canPromoteToGuided || isActionPending(item.status)
                    }
                  >
                    <SendHorizontalIcon className="size-3" />
                    <span className="sr-only">{t("chat.composer.promote")}</span>
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t("chat.composer.deleteFromQueue")}
                    onClick={() => onDeleteFromQueue(item.id)}
                    disabled={isActionPending(item.status)}
                  >
                    <XIcon className="size-3" />
                    <span className="sr-only">{t("chat.composer.delete")}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          onSend()
        }}
      >
        {error ? <p className="text-destructive text-xs">{error}</p> : null}

        {shouldShowAgentMenu ? (
          <div className="overflow-hidden rounded-2xl border border-sidebar-border bg-popover text-popover-foreground shadow-lg">
            <div className="px-3.5 py-2 text-sm font-medium">
              {t("chat.composer.add")}
            </div>
            <div className="space-y-1 px-2 pb-2">
              <div className="flex items-center gap-2 rounded-xl bg-sidebar-accent/60 px-2.5 py-2 text-sm">
                <AtSignIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 font-medium">
                  {t("chat.composer.agentDescriptor")}
                </span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {agentMenuHint}
                </span>
              </div>

              <div className="px-1 pt-1 text-xs font-medium text-muted-foreground">
                {t("chat.composer.agentFiles")}
              </div>

              <div className="max-h-64 overflow-y-auto">
                {hasFilteredAgentFiles ? (
                  groupedAgentOptions.map((group) => (
                    <div key={group.workspaceId} className="py-1">
                      <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
                        {group.workspaceName}
                      </div>
                      {group.options.map((option) => (
                        <button
                          key={`${option.workspaceId}:${option.path}`}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none"
                          onMouseDown={handleAgentOptionMouseDown}
                          onClick={() => insertAgentDescriptor(option)}
                        >
                          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {option.label}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {option.path}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    {hasAgentFiles
                      ? t("chat.composer.noMatchingAgents")
                      : t("chat.composer.noAgents")}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <InputGroup
          className="h-auto overflow-hidden rounded-[26px] border border-sidebar-border/90 bg-background shadow-[0_10px_32px_-20px_rgba(15,23,42,0.45)] transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-[0_14px_38px_-20px_rgba(15,23,42,0.5)] dark:shadow-[0_12px_34px_-22px_rgba(0,0,0,0.8)]"
          onWheel={containChatWheel}
        >
          <InputGroupTextarea
            data-chat-scroll-region
            aria-label={t("chat.composer.messageLabel")}
            placeholder={t("chat.composer.placeholder")}
            rows={2}
            value={composer}
            onChange={(event) => handleComposerValueChange(event.target.value)}
            onFocus={handleComposerFocus}
            onBlur={handleComposerBlur}
            onKeyDown={handleComposerKeyDown}
            readOnly={isSubmittingInput}
            aria-busy={isSubmittingInput}
            className="min-h-14 max-h-32 overflow-y-auto overscroll-contain border-0 bg-transparent px-4 py-3 text-[15px] leading-6 shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-0"
          />
          <InputGroupAddon
            align="block-end"
            className="cursor-default flex-nowrap items-center justify-between gap-1 px-3 pb-3 pt-1"
          >
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-hidden">
              <div className="flex w-fit min-w-0 max-w-40 shrink">
                {modelOptions.length > 0 ? (
                  <Select
                    value={selectedModelProfileId}
                    onValueChange={onModelProfileChange}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-8 w-full min-w-0 rounded-full border-transparent bg-transparent px-2 text-xs shadow-none hover:bg-sidebar-accent/70 focus-visible:border-sidebar-border focus-visible:ring-0"
                    >
                      <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <SelectValue
                        placeholder={t("chat.composer.noModelSelected")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div
                    className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-full px-2 text-xs text-muted-foreground"
                    title={t(
                      isModelCatalogLoaded
                        ? "chat.composer.noModel"
                        : "chat.composer.model"
                    )}
                  >
                    <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {t(
                        isModelCatalogLoaded
                          ? "chat.composer.noModel"
                          : "chat.composer.model"
                      )}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex w-fit min-w-0 max-w-40 shrink">
                <Select
                  value={selectedSandboxEnvironmentId || "__disabled__"}
                  onOpenChange={(open) => {
                    if (open) {
                      onSandboxOptionsRefresh()
                    }
                  }}
                  onValueChange={(value) => {
                    const nextValue = value === "__disabled__" ? "" : value
                    if (
                      !nextValue &&
                      selectedSandboxEnvironmentId &&
                      !sandboxOptions.some(
                        (option) =>
                          option.environmentId === selectedSandboxEnvironmentId
                      )
                    ) {
                      // Base UI's hidden native select can coerce an as-yet
                      // unavailable controlled value to its first option while
                      // the workspace catalog is hydrating. That is not a user
                      // choice and must not become a persisted no-sandbox draft.
                      return
                    }
                    onSandboxEnvironmentChange(nextValue)
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 w-full min-w-0 rounded-full border-transparent bg-transparent px-2 text-xs shadow-none hover:bg-sidebar-accent/70 focus-visible:border-sidebar-border focus-visible:ring-0"
                    aria-busy={isRefreshingSandboxOptions}
                    title={
                      isRefreshingSandboxOptions
                        ? t("chat.composer.sandboxSyncing")
                        : t("chat.composer.sandboxTitle")
                    }
                  >
                    <SelectValue placeholder={t("chat.composer.sandbox")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__disabled__">
                      {t("chat.composer.noSandbox")}
                    </SelectItem>
                    {sandboxOptions.map((option) => (
                      <SelectItem
                        key={option.environmentId}
                        value={option.environmentId}
                      >
                        {option.label} / {option.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 min-w-0 max-w-28 shrink gap-1 rounded-full px-2 text-xs font-normal text-muted-foreground"
                    title={t("chat.composer.capabilityModeHint")}
                  >
                    <SparklesIcon className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {t(
                        `chat.composer.capabilityMode.${capabilityExposureSelection.mode}`
                      )}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-64">
                  <DropdownMenuLabel>
                    {t("chat.composer.capabilityModeLabel")}
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={capabilityExposureSelection.mode}
                    onValueChange={(value) =>
                      selectCapabilityMode(value as CapabilityExposureMode)
                    }
                  >
                    {allowedCapabilityModes.map((mode) => (
                      <DropdownMenuRadioItem key={mode} value={mode}>
                        <span>
                          {t(`chat.composer.capabilityMode.${mode}`)}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {capabilityExposureSelection.mode === "custom" ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>
                        {t("chat.composer.capabilityFamilies")}
                      </DropdownMenuLabel>
                      {selectableCapabilityFamilies.map((family) => (
                        <DropdownMenuCheckboxItem
                          key={family}
                          checked={
                            capabilityExposureSelection.custom?.families.includes(
                              family
                            ) ?? false
                          }
                          onCheckedChange={(checked) =>
                            toggleCapabilityFamily(family, checked === true)
                          }
                          onSelect={(event) => event.preventDefault()}
                        >
                          <span className="truncate">{family}</span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </>
                  ) : null}
                  {capabilityExposurePolicy ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="font-normal">
                        {t("chat.composer.capabilityBudget", {
                          count:
                            capabilityExposurePolicy.exposure_budget.max_count,
                        })}
                      </DropdownMenuLabel>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

              <div
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs transition-colors",
                  agentIterationRequested
                    ? "bg-primary/8 text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/70"
                )}
                title={
                  agentIterationUnavailableReason ??
                  `${t("chat.composer.nodeIteration")} · ${t(`chat.composer.iterationMode.${agentIterationMode}`)} · ${t("chat.composer.nodeIterationHint")}`
                }
              >
                <GitBranchIcon className="size-3.5 shrink-0" />
                <Switch
                  size="sm"
                  checked={agentIterationRequested}
                  disabled={isAgentIterationLoading}
                  aria-label={`${t("chat.composer.nodeIteration")} · ${t(`chat.composer.iterationMode.${agentIterationMode}`)}`}
                  onCheckedChange={onAgentIterationChange}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isSending ? (
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="size-9 rounded-full border border-sidebar-border bg-background text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground"
                  onClick={onStop}
                  title={t("chat.composer.stop")}
                >
                  <SquareIcon className="size-3.5 fill-current" />
                  <span className="sr-only">{t("chat.composer.stop")}</span>
                </Button>
              ) : null}

              <InputGroupButton
                type="submit"
                size="icon-sm"
                className={cn(
                  "size-10 rounded-full bg-foreground text-background transition-[color,background-color,transform] hover:bg-foreground/85 active:scale-95 disabled:bg-muted disabled:text-muted-foreground",
                  isSending && "bg-amber-500 text-white hover:bg-amber-600"
                )}
                disabled={!composer.trim() || isSubmittingInput}
                title={
                  isSubmittingInput
                    ? t("chat.composer.submitting")
                    : isSending
                    ? t("chat.composer.enqueue")
                    : t("chat.composer.sendMessage")
                }
              >
                {isSubmittingInput ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <ArrowUpIcon />
                )}
                <span className="sr-only">
                  {isSubmittingInput
                    ? t("chat.composer.submitting")
                    : isSending
                      ? t("chat.composer.joinQueue")
                      : t("chat.composer.send")}
                </span>
              </InputGroupButton>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </SidebarFooter>
  )
}
