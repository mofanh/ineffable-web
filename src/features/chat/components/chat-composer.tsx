import { pendingHoldReasonKey } from "@/features/chat/model/pending-queue-presentation"
import type { ImageReference } from "@/lib/image-reference"
import { WorkspaceFileMenu, type FileMenuHandle } from "./workspace-file-menu"
import { WorkspaceFileTags } from "./workspace-file-tags"
import { referenceMatchesImage, fileMentionAt, splitFileReferences, joinFileReferences, mergeReferences, normalizeReferencePaste, referenceUri, MAX_FILE_REFERENCES, type WorkspaceFileReference } from "@/lib/workspace-file-reference"
import { notify } from "@/lib/app/notifications"
import type { SandboxResultDeliveryHealth } from "@/lib/api/api-client"
import { Notice } from "@/components/app/notice"
import { sandboxDeliveryPresentation } from "@/features/chat/model/sandbox-delivery-presentation"
import { ComposerRunSettings } from "@/features/chat/components/composer-run-settings"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/app"
import { useChatScrollBoundary } from "@/features/chat/components/chat-scroll-boundary"
import {
  ComposerSingleSelect,
  type ComposerSingleSelectOption,
} from "@/features/chat/components/composer-single-select"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { SidebarFooter } from "@/components/ui/sidebar"
import type {
  CapabilityExposurePolicy,
  CapabilityExposureSelection,
  CapabilityCatalogEntry,
} from "@/lib/api/api-client"
import { cn } from "@/lib/utils"
import {
  ArrowUpIcon,
  BotIcon,
  BoxIcon,
  GripVerticalIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

export type PreInputQueueItem = {
  holdReason?: string | null
  inTimeline?: boolean
  messageId?: string
  id: string
  content: string
  status?: "queued" | "promoting" | "deleting"
}

export type ModelProfileOption = {
  id: string
  displayName: string
  supportsReasoning: boolean
  supportsVision?: boolean
  supportsAuxiliaryVision?: boolean
  supportsToolCalls: boolean
}

type ChatComposerProps = {
  inputDisabledReason?: string
  imageActions?: React.ReactNode
  imageAttachments?: React.ReactNode
  attachedImages?: ImageReference[]
  imageCount?: number
  imagesReady?: boolean
  onImageFiles?: (files: File[]) => void
  isFullScreen: boolean
  composer: string
  isSending: boolean
  canStop?: boolean
  isSubmittingInput: boolean
  canPromoteToGuided: boolean
  canResumePreInputQueue: boolean
  pendingQueueHoldReason: string | null
  blockedPreInputErrorCode?: string | null
  pendingQueueAction: "idle" | "resuming" | "clearing"
  preInputQueue: PreInputQueueItem[]
  fileReferenceScope?: string
  accessToken?: string | null
  workspaces?: { id: string; name: string }[]
  currentWorkspaceId?: string
  modelOptions: ModelProfileOption[]
  isModelCatalogLoaded: boolean
  isModelCatalogLoading: boolean
  modelCatalogError: string | null
  onModelCatalogRefresh: () => void
  isSandboxCatalogLoaded: boolean
  sandboxCatalogError: string | null
  selectedModelProfileId: string
  sandboxOptions: { environmentId: string; label: string; status: string; resultDelivery?: SandboxResultDeliveryHealth | null }[]
  isRefreshingSandboxOptions: boolean
  selectedSandboxEnvironmentId: string
  capabilityExposureSelection: CapabilityExposureSelection | null
  capabilityExposurePolicy: CapabilityExposurePolicy | null
  capabilityExposureDraftStatus: "idle" | "loading" | "ready" | "error"
  capabilityCatalog: CapabilityCatalogEntry[]
  capabilityCatalogStatus: "idle" | "loading" | "ready" | "error"
  onCapabilityCatalogRefresh: () => void
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
  onCapabilityExposureDraftRefresh: () => void
  onAgentIterationChange: (requested: boolean) => void
  onSend: () => void
  onStop: () => void
  onPromoteToGuided: (id: string) => void
  onDeleteFromQueue: (id: string) => void
  onResumePreInputQueue: () => void
  onClearPreInputQueue: () => void
}

export function ChatComposer({
  attachedImages = [], imageActions, imageAttachments, imageCount = 0, imagesReady = true, onImageFiles,
  isFullScreen,
  composer,
  isSending,
  canStop = isSending,
  isSubmittingInput,
  canPromoteToGuided,
  canResumePreInputQueue,
  pendingQueueHoldReason,
  blockedPreInputErrorCode,
  pendingQueueAction,
  preInputQueue,
  accessToken, workspaces = [], currentWorkspaceId, fileReferenceScope,
  modelOptions,
  isModelCatalogLoaded,
  isModelCatalogLoading,
  modelCatalogError,
  onModelCatalogRefresh,
  isSandboxCatalogLoaded,
  sandboxCatalogError,
  selectedModelProfileId,
  sandboxOptions,
  isRefreshingSandboxOptions,
  selectedSandboxEnvironmentId,
  capabilityExposureSelection,
  capabilityExposurePolicy,
  capabilityExposureDraftStatus,
  capabilityCatalog,
  capabilityCatalogStatus,
  onCapabilityCatalogRefresh,
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
  onCapabilityExposureDraftRefresh,
  onAgentIterationChange,
  onSend,
  onStop,
  onPromoteToGuided,
  onDeleteFromQueue,
  onResumePreInputQueue,
  onClearPreInputQueue,
  inputDisabledReason,
}: ChatComposerProps) {
  const scrollBoundaryRef = useChatScrollBoundary<HTMLDivElement>()
  const { t } = useTranslation()
  const [menuScope, setMenuScope] = React.useState<string | null>(null)
  const scope = `${accessToken}:${fileReferenceScope}:${currentWorkspaceId}`
  const [cursor, setCursor] = React.useState(0)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const menuRef = React.useRef<FileMenuHandle>(null)
  const composing = React.useRef(false)
  const draft = React.useMemo(() => splitFileReferences(composer), [composer])
  const visibleFileReferences = draft.references.filter(ref => !attachedImages.some(image => referenceMatchesImage(ref, image)))
  const trigger = fileMentionAt(draft.text, cursor)
  const showFileMenu = menuScope === scope && Boolean(trigger) && Boolean(accessToken)
  const editable = !isSubmittingInput && !inputDisabledReason
  const modelPickerOptions = React.useMemo<ComposerSingleSelectOption[]>(
    () =>
      [...modelOptions.map((option) => ({
        value: option.id,
        label: option.displayName,
        searchText: [
          option.supportsReasoning ? t("chat.composer.modelReasoning") : "",
          option.supportsToolCalls ? t("chat.composer.modelTools") : "",
        ].join(" "),
        supportingContent: (
          <>
            {option.supportsReasoning ? (
              <span className="text-muted-foreground">
                {t("chat.composer.modelReasoning")}
              </span>
            ) : null}
            {option.supportsToolCalls ? (
              <span className="text-muted-foreground">
                {t("chat.composer.modelTools")}
              </span>
            ) : null}
            {!option.supportsReasoning && !option.supportsToolCalls ? (
              <span>{t("chat.composer.modelTextOnly")}</span>
            ) : null}
          </>
        ),
      })), ...(selectedModelProfileId && !modelOptions.some(option => option.id === selectedModelProfileId) ? [{ value: selectedModelProfileId, label: t(isModelCatalogLoaded ? "interaction.unavailableModel" : "chat.composer.modelUnconfirmed") }] : [])],
    [modelOptions, selectedModelProfileId, isModelCatalogLoaded, t]
  )

  const sandboxPickerOptions = React.useMemo<ComposerSingleSelectOption[]>(
    () => [
      ...(selectedSandboxEnvironmentId && !sandboxOptions.some(option => option.environmentId === selectedSandboxEnvironmentId) ? [{ value: selectedSandboxEnvironmentId, label: t(isSandboxCatalogLoaded ? "interaction.unavailableEnvironment" : "chat.composer.sandboxUnconfirmed") }] : []),
      {
        value: "__disabled__",
        label: t("chat.composer.noSandbox"),
        searchText: t("chat.composer.noSandboxDescription"),
        supportingContent: t("chat.composer.noSandboxDescription"),
      },
      ...sandboxOptions.map((option) => ({
        value: option.environmentId,
        label: option.label,
        searchText: option.status,
        supportingContent: (
          <div className="space-y-0.5">
          <StatusBadge
            status={option.status}
            label={t(`chat.composer.sandboxStatus.${option.status}`, {
              defaultValue: option.status,
            })}
            className="px-1.5 py-0 text-[10px]"
          />
          {sandboxDeliveryPresentation(option.resultDelivery) ? <span className="block text-[11px] leading-4 text-muted-foreground">{t(sandboxDeliveryPresentation(option.resultDelivery)!.key, { count: option.resultDelivery?.pending_results ?? 0 })}</span> : null}
          </div>
        ),
      })),
    ],
    [sandboxOptions, selectedSandboxEnvironmentId, isSandboxCatalogLoaded, t]
  )

  const queuedItems = preInputQueue.filter(item => !item.inTimeline)
  const isActionPending = (status?: PreInputQueueItem["status"]) =>
    status === "promoting" || status === "deleting"
  function updateText(value: string, position: number) {
    onComposerChange(joinFileReferences(value, draft.references))
    setCursor(position)
    setMenuScope(fileMentionAt(value, position) ? scope : null)
  }
  function addReferences(references: WorkspaceFileReference[], text: string, position: number) {
    if (!editable) return
    const merged = mergeReferences(draft.references, references.filter(ref => !attachedImages.some(image => referenceMatchesImage(ref, image))))
    if (merged.length > MAX_FILE_REFERENCES) { notify.error({ title: t("fileReferences.limit") }); return }
    onComposerChange(joinFileReferences(text, merged))
    setMenuScope(null)
    setCursor(position)
    const textarea = textareaRef.current
    // The element is scoped by conversation; a late frame cannot focus another draft.
    window.requestAnimationFrame(() => { if (textarea?.isConnected) { textarea.focus(); textarea.setSelectionRange(position, position) } })
  }
  function selectReference(reference: WorkspaceFileReference) {
    if (!trigger) return
    addReferences([reference], draft.text.slice(0, trigger.start) + draft.text.slice(trigger.end), trigger.start)
  }
  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    if (showFileMenu) {
      if (event.key === "Escape") { event.preventDefault(); setMenuScope(null); return }
      if (menuRef.current?.keyDown(event)) { event.preventDefault(); return }
      // Loading/empty menus must never accidentally submit on selection keys.
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); return }
    }
    onComposerKeyDown(event)
  }
  function handleReferencePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!editable) return
    const normalized = normalizeReferencePaste(event.clipboardData.getData("text/plain"), window.location.origin)
    const pasted = splitFileReferences(normalized)
    if (!pasted.references.length) return
    event.preventDefault()
    event.stopPropagation()
    const start = event.currentTarget.selectionStart
    const end = event.currentTarget.selectionEnd
    addReferences(pasted.references, draft.text.slice(0, start) + pasted.text + draft.text.slice(end), start + pasted.text.length)
  }

  const firstHoldReason = queuedItems[0]?.holdReason
  const displayedHoldReason = pendingQueueHoldReason ?? (
    firstHoldReason && queuedItems.every(item => item.holdReason === firstHoldReason) ? firstHoldReason : null
  )

  const delivery = sandboxDeliveryPresentation(sandboxOptions.find((option) => option.environmentId === selectedSandboxEnvironmentId)?.resultDelivery)

  return (
    <SidebarFooter
      className={cn(
        "@container/chat-composer w-full px-2 pt-0 pb-[calc(0.5rem+env(safe-area-inset-bottom))]",
        isFullScreen && "mx-auto max-w-[780px] px-5 md:px-2"
      )}
    >
      {delivery ? <Notice tone="warning" className="mb-2">{t(delivery.key, { count: delivery.count })}</Notice> : null}
      {queuedItems.length > 0 ? (
        <div className="mb-1.5 space-y-1.5">
          <div className="flex min-h-6 items-center justify-between gap-2 px-1 text-[11px] font-medium text-muted-foreground">
            <div className="flex min-w-0 items-center gap-1.5">
              <GripVerticalIcon className="size-3 shrink-0" />
              <span className="shrink-0">
                {t(displayedHoldReason ? "chat.composer.heldInputs" : "chat.composer.queue", { count: queuedItems.length })}
              </span>
              {displayedHoldReason ? (
                <span className="truncate text-amber-700 dark:text-amber-400">
                  {t(pendingHoldReasonKey(displayedHoldReason, blockedPreInputErrorCode))}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canResumePreInputQueue ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 rounded-md px-1.5 text-[11px] text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:text-amber-400"
                  onClick={onResumePreInputQueue}
                  disabled={pendingQueueAction !== "idle"}
                >
                  {pendingQueueAction === "resuming" ? (
                    <LoaderCircleIcon className="size-3 animate-spin" />
                  ) : (
                    <RotateCcwIcon className="size-3" />
                  )}
                  {t(pendingQueueHoldReason === "outcome_unknown" ? "chat.composer.retryUnknown" : "chat.composer.resumeQueue")}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 gap-1 rounded-md px-1.5 text-[11px] hover:bg-destructive/10 hover:text-destructive"
                onClick={onClearPreInputQueue}
                disabled={pendingQueueAction !== "idle"}
              >
                {pendingQueueAction === "clearing" ? (
                  <LoaderCircleIcon className="size-3 animate-spin" />
                ) : (
                  <Trash2Icon className="size-3" />
                )}
                {t("chat.composer.clearQueue")}
              </Button>
            </div>
          </div>
          <div className="max-h-[140px] space-y-1 overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-1.5">
            {queuedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-1.5 rounded-lg bg-background px-2.5 py-2 text-[13px] leading-snug shadow-sm"
              >
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground/80">
                  {item.holdReason && item.holdReason !== displayedHoldReason ? <span className="mb-1 block text-xs text-amber-700 dark:text-amber-400">{t(pendingHoldReasonKey(item.holdReason))}</span> : null}
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
                      !canPromoteToGuided || Boolean(item.holdReason) || isActionPending(item.status)
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
        onDragOver={(event) => { if (onImageFiles && event.dataTransfer.types.includes("Files")) event.preventDefault() }}
        onDrop={(event) => { if (onImageFiles && event.dataTransfer.files.length) { event.preventDefault(); onImageFiles(Array.from(event.dataTransfer.files)) } }}
        onPaste={(event) => { const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/")); if (onImageFiles && files.length) { event.preventDefault(); onImageFiles(files) } }}
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!inputDisabledReason) onSend()
        }}
      >
        {imageCount > 0 && modelOptions.some(model => model.id === selectedModelProfileId && !model.supportsVision && model.supportsAuxiliaryVision) ? <Notice>{t("images.auxiliaryHint")}</Notice> : null}
        {imageCount > 0 && !modelOptions.some((model) => model.id === selectedModelProfileId && (model.supportsVision || model.supportsAuxiliaryVision)) ? <Notice tone="warning">{t("images.visionRequired")}</Notice> : null}
        {inputDisabledReason && <Notice>{inputDisabledReason}</Notice>}

        {showFileMenu && <WorkspaceFileMenu key={scope} ref={menuRef} accessToken={accessToken!} workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} query={trigger?.query ?? ""} onSelect={selectReference} />}

        <InputGroup
          className="h-auto overflow-hidden rounded-[26px] border border-sidebar-border/90 bg-background shadow-[0_10px_32px_-20px_rgba(15,23,42,0.45)] transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-[0_14px_38px_-20px_rgba(15,23,42,0.5)] dark:shadow-[0_12px_34px_-22px_rgba(0,0,0,0.8)]"
          ref={scrollBoundaryRef}
        >
          {imageCount > 0 ? <InputGroupAddon align="block-start" className="min-w-0 px-3 pt-3 pb-0">{imageAttachments}</InputGroupAddon> : null}
          {visibleFileReferences.length > 0 && <InputGroupAddon align="block-start" className="min-w-0 px-3 pt-3 pb-0"><WorkspaceFileTags accessToken={accessToken} references={visibleFileReferences} onRemove={editable ? uri => onComposerChange(joinFileReferences(draft.text, draft.references.filter(ref => referenceUri(ref) !== uri))) : undefined} /></InputGroupAddon>}
          <InputGroupTextarea
            key={scope}
            ref={textareaRef}
            data-chat-scroll-region
            aria-label={t("chat.composer.messageLabel")}
            placeholder={t("chat.composer.placeholder")}
            rows={2}
            value={draft.text}
            onChange={(event) => updateText(event.target.value, event.target.selectionStart)}
            onSelect={event => setCursor(event.currentTarget.selectionStart)}
            onPaste={handleReferencePaste}
            onCompositionStart={() => { composing.current = true }}
            onCompositionEnd={() => { composing.current = false }}
            onKeyDown={handleComposerKeyDown}
            readOnly={isSubmittingInput || Boolean(inputDisabledReason)}
            aria-busy={isSubmittingInput}
            className="min-h-14 max-h-32 overflow-y-auto overscroll-contain border-0 bg-transparent px-4 py-3 text-[15px] leading-6 shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-0"
          />
          <InputGroupAddon
            align="block-end"
            className="cursor-default px-2 pb-2 pt-1"
          >
            <div className="flex w-full min-w-0 items-center gap-0.5 @[480px]/chat-composer:gap-1" data-composer-primary-actions>
              {imageActions}
              <div className="min-w-14 max-w-64 flex-initial">
                <ComposerSingleSelect
                  value={selectedModelProfileId}
                  options={modelPickerOptions}
                  icon={<BotIcon className="size-3.5 shrink-0 text-muted-foreground" />}
                  label={t("chat.composer.modelPickerLabel")}
                  placeholder={t(isModelCatalogLoaded ? "chat.composer.noModelSelected" : "chat.composer.model")}
                  emptyLabel={t("chat.composer.noMatchingModels")}
                  searchPlaceholder={t("chat.composer.modelSearch")}
                  loading={isModelCatalogLoading}
                  loadingLabel={t("chat.composer.catalogLoading")}
                  error={modelCatalogError}
                  onRetry={onModelCatalogRefresh}
                  retryLabel={t("common.retry")}
                  onOpenChange={open => { if (open) onModelCatalogRefresh() }}
                  onValueChange={onModelProfileChange}
                  className="px-1 @[480px]/chat-composer:px-2"
                />
              </div>
              <div className="min-w-14 max-w-48 flex-initial">
                <ComposerSingleSelect
                  key={scope}
                  value={selectedSandboxEnvironmentId || "__disabled__"}
                  options={sandboxPickerOptions}
                  icon={<BoxIcon className="size-3.5 shrink-0 text-muted-foreground" />}
                  label={t("chat.composer.sandboxPickerLabel")}
                  placeholder={t("chat.composer.sandbox")}
                  emptyLabel={t("chat.composer.noMatchingSandboxes")}
                  searchPlaceholder={t("chat.composer.sandboxSearch")}
                  loading={isRefreshingSandboxOptions}
                  loadingLabel={t("chat.composer.sandboxSyncing")}
                  error={sandboxCatalogError}
                  onRetry={onSandboxOptionsRefresh}
                  retryLabel={t("common.retry")}
                  onOpenChange={open => { if (open) onSandboxOptionsRefresh() }}
                  onValueChange={value => onSandboxEnvironmentChange(value === "__disabled__" ? "" : value)}
                  className="px-1 @[480px]/chat-composer:px-2"
                />
              </div>
              <ComposerRunSettings
                key={`run-settings:${scope}`}
                capabilityExposureSelection={capabilityExposureSelection}
                capabilityExposurePolicy={capabilityExposurePolicy}
                capabilityExposureDraftStatus={capabilityExposureDraftStatus}
                capabilityCatalog={capabilityCatalog}
                capabilityCatalogStatus={capabilityCatalogStatus}
                onCapabilityCatalogRefresh={onCapabilityCatalogRefresh}
                onCapabilityExposureChange={onCapabilityExposureChange}
                onCapabilityExposureDraftRefresh={onCapabilityExposureDraftRefresh}
                agentIterationRequested={agentIterationRequested}
                agentIterationMode={agentIterationMode}
                isAgentIterationLoading={isAgentIterationLoading}
                agentIterationUnavailableReason={agentIterationUnavailableReason}
                onAgentIterationChange={onAgentIterationChange}
              />
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {canStop ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    className="size-8 rounded-full border border-sidebar-border bg-background text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-foreground"
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
                  disabled={Boolean(inputDisabledReason) || (!composer.trim() && imageCount === 0) || !imagesReady || isSubmittingInput || (imageCount > 0 && !modelOptions.some((model) => model.id === selectedModelProfileId && (model.supportsVision || model.supportsAuxiliaryVision)))}
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
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </SidebarFooter>
  )
}
