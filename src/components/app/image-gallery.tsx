import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { AppDialog } from "@/components/app/app-dialog"
import type { ImageReference } from "@/lib/image-reference"

function ImageTile({ image, accessToken, onReference }: {
  image: ImageReference; accessToken: string; onReference?: (image: ImageReference) => void
}) {
  const { t } = useTranslation()
  const [resource, setResource] = React.useState<{ identity: string; url?: string; error?: boolean }>({ identity: "" })
  const [open, setOpen] = React.useState(false)
  const [original, setOriginal] = React.useState<{ identity: string; url?: string; error?: boolean }>({ identity: "" })
  const [fullSize, setFullSize] = React.useState(false)
  const [previewEpoch, setPreviewEpoch] = React.useState(0)
  const [retry, setRetry] = React.useState(0)
  const element = React.useRef<HTMLDivElement>(null)
  const identity = `${accessToken}:${image.version_id}`
  React.useEffect(() => {
    const controller = new AbortController()
    let url: string | undefined
    let started = false
    const load = async () => {
      if (started) return
      started = true
      try {
        const { loadImageBlob } = await import("@/lib/api/images")
        if (controller.signal.aborted) return
        const blob = await loadImageBlob(accessToken, image, controller.signal, true)
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setResource({ identity, url })
      } catch {
        if (!controller.signal.aborted) setResource({ identity, error: true })
      }
    }
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { void load(); observer?.disconnect() }
    }, { rootMargin: "200px" })
    if (observer && element.current) observer.observe(element.current)
    else void load()
    return () => { controller.abort(); observer?.disconnect(); if (url) URL.revokeObjectURL(url) }
  }, [accessToken, image, identity, retry])
  const originalIdentity = `${identity}:${previewEpoch}`
  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    let url: string | undefined
    void (async () => {
      try {
        const { loadImageBlob } = await import("@/lib/api/images")
        if (controller.signal.aborted) return
        const blob = await loadImageBlob(accessToken, image, controller.signal)
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setOriginal({ identity: originalIdentity, url })
      } catch { if (!controller.signal.aborted) setOriginal({ identity: originalIdentity, error: true }) }
    })()
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [open, accessToken, image, originalIdentity, retry])
  const full = original.identity === originalIdentity ? original : null
  const current = resource.identity === identity ? resource : null
  return <div ref={element} className="min-w-0 max-w-full space-y-1">
    {current?.url ? <Button type="button" variant="ghost" className="h-auto max-w-full p-0" onClick={() => { setPreviewEpoch((value) => value + 1); setFullSize(false); setOpen(true) }}>
      <img src={current.url} alt={t("images.preview")} width={image.width} height={image.height} decoding="async" className="max-h-60 max-w-full rounded-lg object-contain" />
    </Button> : <div className="flex h-24 w-32 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground" role="status">
      {current?.error ? <Button variant="ghost" size="sm" onClick={() => setRetry((value) => value + 1)}>{t("images.unavailableRetry")}</Button> : t("common.loading")}
    </div>}
    <AppDialog open={open && Boolean(current?.url)} onOpenChange={setOpen} title={t("images.preview")} maxWidth="6xl">
      {current?.url ? <>
        <div className="max-h-[65vh] overflow-auto"><img src={full?.url ?? current.url} alt={t("images.preview")} width={image.width} height={image.height} className={fullSize ? "h-auto max-w-none" : "h-auto max-w-full"} /></div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {full?.url ? <a href={full.url} download={`image-${image.version_id}.${image.mime_type === "image/jpeg" ? "jpg" : image.mime_type.split("/")[1]}`}>{t("images.download")}</a> : <span role="status">{full?.error ? t("images.loadFailed") : t("common.loading")}</span>}
          <Button variant="outline" size="sm" onClick={() => setFullSize((value) => !value)}>{fullSize ? t("images.fit") : t("images.actualSize")}</Button>
          <a href={`/workspace/${encodeURIComponent(image.workspace_id)}/objects/${encodeURIComponent(image.object_id)}`}>{t("images.openWorkspace")}</a>
          {onReference ? <Button variant="outline" size="sm" onClick={() => { onReference(image); setOpen(false) }}>{t("images.useReference")}</Button> : null}
        </div>
      </> : null}
    </AppDialog>
  </div>
}

export function ImageGallery({ images, accessToken, onReference }: {
  images: ImageReference[]; accessToken?: string | null; onReference?: (image: ImageReference) => void
}) {
  if (!accessToken || images.length === 0) return null
  return <div className="my-2 flex max-w-full flex-wrap items-start gap-2">{images.map((image, index) =>
    <ImageTile key={`${image.version_id}:${index}`} image={image} accessToken={accessToken} onReference={onReference} />
  )}</div>
}
