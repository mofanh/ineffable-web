import { dispatchWorkspaceObjectsChanged } from "@/lib/workspace-events"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { type ImageReference, uploadImage } from "@/lib/api/images"
import { normalizeAppError } from "@/lib/app/api-errors"

export type ImageDraft = { id: string; file?: File; image?: ImageReference; status: "uploading" | "ready" | "error"; error?: string }

export function useImageAttachments(scope: string, accessToken: string | null, workspaceId?: string, ownerId = "session") {
  const { t } = useTranslation()
  const drafts = React.useRef(new Map<string, { items: ImageDraft[] }>())
  const owner = React.useRef(ownerId)
  const [, rerender] = React.useReducer((value: number) => value + 1, 0)
  const controllers = React.useRef(new Map<string, AbortController>())
  React.useEffect(() => {
    const requests = controllers.current
    return () => { for (const controller of requests.values()) controller.abort(); requests.clear() }
  }, [])
  React.useEffect(() => {
    if (owner.current === ownerId) return
    owner.current = ownerId
    for (const controller of controllers.current.values()) controller.abort()
    controllers.current.clear()
    drafts.current.clear()
    rerender()
  }, [ownerId])
  // Async callbacks retain this exact draft object. Moving it never aliases the
  // reusable New Chat key, so a later New Chat gets a different generation.
  let draft = drafts.current.get(scope)
  if (!draft) { draft = { items: [] }; drafts.current.set(scope, draft) }
  const capturedDraft = draft
  const items = capturedDraft.items
  function update(action: (items: ImageDraft[]) => ImageDraft[]) {
    capturedDraft.items = action(capturedDraft.items)
    rerender()
  }
  async function upload(item: ImageDraft) {
    if (!accessToken || !workspaceId || !item.file) return
    if (!["image/png", "image/jpeg", "image/webp"].includes(item.file.type) || item.file.size === 0 || item.file.size > 10 * 1024 * 1024) return
    const controller = new AbortController()
    controllers.current.set(item.id, controller)
    update((items) => items.map((current) => current.id === item.id ? { ...current, status: "uploading", error: undefined } : current))
    try {
      const image = await uploadImage(accessToken, workspaceId, item.file, controller.signal)
      if (!controller.signal.aborted) {
        update((items) => items.map((current) => current.id === item.id ? { id: item.id, image, status: "ready" } : current))
        dispatchWorkspaceObjectsChanged({ workspaceId: image.workspace_id, objectId: image.object_id, versionId: image.version_id, action: "create_file", source: "user" })
      }
    } catch (error) {
      if (!controller.signal.aborted) update((items) => items.map((current) => current.id === item.id ? {
        ...current, status: "error", error: normalizeAppError(error, { fallbackMessage: t("images.uploadFailed") }).message,
      } : current))
    } finally { controllers.current.delete(item.id) }
  }
  function addFiles(files: File[]) {
    const retainedFiles = [...drafts.current.values()].reduce((count, items) => count + items.items.filter((item) => item.file).length, 0)
    const next = files.slice(0, Math.max(0, Math.min(4 - retainedFiles, 4 - capturedDraft.items.length))).map((file): ImageDraft => ({
      id: crypto.randomUUID(), file,
      status: ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024 ? "uploading" : "error",
      error: t("images.limits"),
    }))
    update((items) => [...items, ...next].slice(0, 4))
    for (const item of next) if (item.status === "uploading") void upload(item)
  }
  return {
    items, images: items.flatMap((item) => item.image ? [item.image] : []),
    ready: items.every((item) => item.status === "ready"),
    enabled: Boolean(accessToken && workspaceId), addFiles, retry: upload,
    remove: (id: string) => { controllers.current.get(id)?.abort(); controllers.current.delete(id); update((items) => items.filter((item) => item.id !== id)) },
    detach: () => {
      // A submitted send retains the captured ready references. An abandoned
      // new draft must not keep raw uploads in the hook's retained-file budget.
      if (drafts.current.get(scope) === capturedDraft) drafts.current.delete(scope)
      for (const item of capturedDraft.items) {
        controllers.current.get(item.id)?.abort()
        controllers.current.delete(item.id)
      }
    },
    moveTo: (nextScope: string) => {
      if (drafts.current.get(scope) === capturedDraft) drafts.current.delete(scope)
      const existing = drafts.current.get(nextScope)
      if (existing && existing !== capturedDraft && existing.items.length) {
        capturedDraft.items = [...capturedDraft.items, ...existing.items].slice(0, 4)
      }
      drafts.current.set(nextScope, capturedDraft)
      rerender()
    },
    clear: (ids: string[]) => update((items) => items.filter((item) => !ids.includes(item.id))),
    addReference: (image: ImageReference) => update((items) => items.length >= 4 ? items : [...items, { id: crypto.randomUUID(), image, status: "ready" }]),
  }
}
