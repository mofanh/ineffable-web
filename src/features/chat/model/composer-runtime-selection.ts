export type ComposerRuntimeSelection = {
  modelProfileId: string
  sandboxEnvironmentId: string
}

export type CanonicalComposerRuntimeSelection = {
  modelProfileId: string
  sandboxEnvironmentId: string | null
}

type SelectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

const RUNTIME_SELECTION_DRAFT_VERSION = 1

function selectionScope(conversationId: string | null | undefined) {
  return conversationId ?? "new"
}

function modelStorageKey(conversationId: string | null | undefined) {
  return `ineffable.chat.model.${selectionScope(conversationId)}`
}

function sandboxStorageKey(conversationId: string | null | undefined) {
  return `ineffable.chat.sandbox.${selectionScope(conversationId)}`
}

function draftStorageKey(conversationId: string) {
  return `ineffable.chat.runtime-selection-draft.${conversationId}`
}

export function readComposerRuntimeSelectionDraft(
  storage: SelectionStorage,
  conversationId: string
): ComposerRuntimeSelection | null {
  const raw = storage.getItem(draftStorageKey(conversationId))
  if (!raw) return null

  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (
      value.version !== RUNTIME_SELECTION_DRAFT_VERSION ||
      typeof value.modelProfileId !== "string" ||
      typeof value.sandboxEnvironmentId !== "string"
    ) {
      return null
    }
    return {
      modelProfileId: value.modelProfileId,
      sandboxEnvironmentId: value.sandboxEnvironmentId,
    }
  } catch {
    return null
  }
}

export function readCachedComposerRuntimeSelection(
  storage: SelectionStorage,
  conversationId: string | null | undefined
): ComposerRuntimeSelection {
  if (conversationId) {
    const draft = readComposerRuntimeSelectionDraft(storage, conversationId)
    if (draft) return draft
  }
  return {
    modelProfileId: storage.getItem(modelStorageKey(conversationId)) ?? "",
    sandboxEnvironmentId:
      storage.getItem(sandboxStorageKey(conversationId)) ?? "",
  }
}

export function writeComposerRuntimeSelectionDraft(
  storage: SelectionStorage,
  conversationId: string,
  selection: ComposerRuntimeSelection
) {
  storage.setItem(
    draftStorageKey(conversationId),
    JSON.stringify({ version: RUNTIME_SELECTION_DRAFT_VERSION, ...selection })
  )
  writeRecentComposerRuntimeSelection(storage, selection)
}

export function writeRecentComposerRuntimeSelection(
  storage: SelectionStorage,
  selection: ComposerRuntimeSelection
) {
  storage.setItem(modelStorageKey(null), selection.modelProfileId)
  storage.setItem(sandboxStorageKey(null), selection.sandboxEnvironmentId)
}

export function writeCanonicalComposerRuntimeSelection(
  storage: SelectionStorage,
  conversationId: string,
  selection: CanonicalComposerRuntimeSelection
) {
  storage.setItem(modelStorageKey(conversationId), selection.modelProfileId)
  if (selection.sandboxEnvironmentId != null) {
    storage.setItem(
      sandboxStorageKey(conversationId),
      selection.sandboxEnvironmentId
    )
  }
}

export function commitAcceptedComposerRuntimeSelection(
  storage: SelectionStorage,
  conversationId: string,
  selection: ComposerRuntimeSelection
) {
  const draft = readComposerRuntimeSelectionDraft(storage, conversationId)
  writeCanonicalComposerRuntimeSelection(storage, conversationId, selection)
  writeRecentComposerRuntimeSelection(storage, selection)
  if (
    !draft ||
    (draft.modelProfileId === selection.modelProfileId &&
      draft.sandboxEnvironmentId === selection.sandboxEnvironmentId)
  ) {
    storage.removeItem(draftStorageKey(conversationId))
  }
}

export function reconcileCanonicalComposerRuntimeSelection(
  storage: SelectionStorage,
  conversationId: string,
  selection: CanonicalComposerRuntimeSelection
) {
  writeCanonicalComposerRuntimeSelection(storage, conversationId, selection)
  const draft = readComposerRuntimeSelectionDraft(storage, conversationId)
  if (!draft) return true
  if (
    selection.sandboxEnvironmentId != null &&
    draft.modelProfileId === selection.modelProfileId &&
    draft.sandboxEnvironmentId === selection.sandboxEnvironmentId
  ) {
    storage.removeItem(draftStorageKey(conversationId))
    return true
  }
  return false
}

export function clearUnavailableComposerRuntimeSelectionField(
  storage: SelectionStorage,
  conversationId: string | null | undefined,
  field: "model" | "sandbox"
) {
  const selection = readCachedComposerRuntimeSelection(storage, conversationId)
  const next = {
    ...selection,
    ...(field === "model"
      ? { modelProfileId: "" }
      : { sandboxEnvironmentId: "" }),
  }
  if (conversationId) {
    if (readComposerRuntimeSelectionDraft(storage, conversationId)) {
      writeComposerRuntimeSelectionDraft(storage, conversationId, next)
    } else {
      commitAcceptedComposerRuntimeSelection(storage, conversationId, next)
    }
  } else {
    writeRecentComposerRuntimeSelection(storage, next)
  }
}
