import * as React from "react"
import { useTranslation } from "react-i18next"
import { ImageGallery } from "@/components/app/image-gallery"
import { Button } from "@/components/ui/button"
import { useAuthSession, useConversationSession } from "@/features/auth/app-session"
import type { WorkspaceObject } from "@/features/workspace/api/workspace-api"
import { getImageReference, type ImageReference } from "@/lib/api/images"
import { normalizeAppError } from "@/lib/app/api-errors"
import { notify } from "@/lib/app/notifications"
import { prepareImageReferenceTarget, requestImageReference } from "@/lib/image-reference-events"

export function WorkspaceImagePreview({ object }: { object: WorkspaceObject }) {
  const { t } = useTranslation()
  const { accessToken, currentSessionId } = useAuthSession()
  const { getConversationSelectionIdentity } = useConversationSession()
  const pendingReference = React.useRef<AbortController | null>(null)
  const [isPreparingReference, setIsPreparingReference] = React.useState(false)
  React.useEffect(() => {
    setIsPreparingReference(false)
    return () => {
      pendingReference.current?.abort()
      pendingReference.current = null
    }
  }, [currentSessionId, object.id, object.workspace_id])
  const [image, setImage] = React.useState<ImageReference | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [retry, setRetry] = React.useState(0)
  React.useEffect(() => {
    if (!accessToken || !object.current_version_id) return
    let cancelled = false
    void getImageReference(accessToken, object.current_version_id).then(reference => {
      if (cancelled) return
      if (reference.object_id !== object.id || reference.workspace_id !== object.workspace_id) {
        setError(t("images.loadFailed")); return
      }
      setImage(reference)
    }).catch(cause => {
      if (!cancelled) setError(normalizeAppError(cause, { fallbackMessage: t("images.loadFailed") }).message)
    })
    return () => { cancelled = true }
  }, [accessToken, object.current_version_id, object.id, object.workspace_id, retry, t])
  const addReference = async (reference: ImageReference) => {
    if (pendingReference.current) return
    const owner = getConversationSelectionIdentity()
    if (!currentSessionId || owner.sessionId !== currentSessionId) return
    const controller = new AbortController()
    pendingReference.current = controller
    setIsPreparingReference(true)
    try {
      const ready = await prepareImageReferenceTarget(controller.signal)
      const current = getConversationSelectionIdentity()
      if (controller.signal.aborted || current.sessionId !== owner.sessionId || current.version !== owner.version) return
      if (!ready || !requestImageReference({ sessionId: currentSessionId, version: owner.version }, reference)) {
        notify.info({ title: t("images.referenceUnavailable") })
      }
    } finally {
      if (pendingReference.current === controller) {
        pendingReference.current = null
        setIsPreparingReference(false)
      }
    }
  }
  return <div className="mx-auto flex min-h-72 max-w-4xl flex-col items-center justify-center gap-3 px-4 py-8">
    {image ? <>
      <ImageGallery images={[image]} accessToken={accessToken} onReference={addReference} />
      <span className="text-xs text-muted-foreground">{image.width} × {image.height}</span>
      <Button variant="outline" size="sm" disabled={isPreparingReference} onClick={() => void addReference(image)}>{t("images.useReference")}</Button>
    </> : <div role="status" className="text-sm text-muted-foreground">
      {error || !object.current_version_id ? <Button variant="ghost" onClick={() => { setError(null); setRetry(value => value + 1) }}>{error ?? t("images.unavailableRetry")}</Button> : t("common.loading")}
    </div>}
  </div>
}
