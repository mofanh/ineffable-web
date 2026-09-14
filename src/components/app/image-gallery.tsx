import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { DownloadIcon, ExpandIcon, ShrinkIcon, FolderOpenIcon, ImagePlusIcon } from "lucide-react"
import { AppDialog, AppDialogFooter } from "@/components/app/app-dialog"
import type { ImageReference } from "@/lib/image-reference"

function ImageTile({ image, accessToken, onReference, compact, userMessage, multiple }: {
  image: ImageReference; accessToken: string; compact?: boolean; userMessage?: boolean; multiple?: boolean; onReference?: (image: ImageReference) => void
}) {
  const { t } = useTranslation()
  const actionClass = "h-auto min-h-8 min-w-0 justify-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-normal whitespace-normal text-muted-foreground hover:text-foreground sm:justify-center"
  const tile = compact || (userMessage && multiple)
  const tileClass = compact ? "size-20" : "size-16"
  const singleWidth = userMessage && !tile ? Math.min(240, 240 * image.width / Math.max(1, image.height)) : undefined

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
    {current?.url ? <Button type="button" variant="ghost" style={singleWidth ? { width: singleWidth } : undefined} className={tile ? `${tileClass} overflow-hidden rounded-xl border-0 p-0` : "h-auto max-w-full overflow-hidden rounded-xl border-0 p-0"} onClick={() => { setPreviewEpoch((value) => value + 1); setFullSize(false); setOpen(true) }}>
      <img src={current.url} alt={t("images.preview")} width={image.width} height={image.height} decoding="async" className={tile ? `${tileClass} object-cover` : "h-auto max-h-60 max-w-full rounded-xl object-contain"} />
    </Button> : <div className={`flex items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground ${tile ? `${tileClass} overflow-hidden` : "h-24 w-32 max-w-full"}`} role="status">
      {current?.error ? <Button variant="ghost" size="sm" onClick={() => setRetry((value) => value + 1)}>{t("images.unavailableRetry")}</Button> : t("common.loading")}
    </div>}
    <AppDialog open={open && Boolean(current?.url)} onOpenChange={setOpen} title={t("images.preview")} maxWidth="6xl" footer={current?.url ? <AppDialogFooter className="grid grid-cols-2 gap-1 px-3 py-2 sm:flex sm:justify-start">
      {full?.url ? <Button asChild variant="ghost" size="sm" className={actionClass}>
        <a href={full.url} download={`image-${image.version_id}.${image.mime_type === "image/jpeg" ? "jpg" : image.mime_type.split("/")[1]}`}><DownloadIcon className="size-4" />{t("images.download")}</a>
      </Button> : <span role="status" className="px-2.5 text-xs text-muted-foreground">{full?.error ? t("images.loadFailed") : t("common.loading")}</span>}
      <Button type="button" variant="ghost" size="sm" className={actionClass} onClick={() => setFullSize((value) => !value)}>{fullSize ? <ShrinkIcon className="size-4" /> : <ExpandIcon className="size-4" />}{fullSize ? t("images.fit") : t("images.actualSize")}</Button>
      <Button asChild variant="ghost" size="sm" className={actionClass}><a href={`/workspace/${encodeURIComponent(image.workspace_id)}/objects/${encodeURIComponent(image.object_id)}`}><FolderOpenIcon className="size-4" />{t("images.openWorkspace")}</a></Button>
      {onReference ? <Button type="button" variant="ghost" size="sm" className={actionClass} onClick={() => { onReference(image); setOpen(false) }}><ImagePlusIcon className="size-4" />{t("images.useReference")}</Button> : null}
    </AppDialogFooter> : undefined}>
      {current?.url ? <div className="max-h-[65vh] overflow-auto"><img src={full?.url ?? current.url} alt={t("images.preview")} width={image.width} height={image.height} className={fullSize ? "h-auto max-w-none" : "h-auto max-w-full"} /></div> : null}
    </AppDialog>
  </div>
}

export function ImageGallery({ images, accessToken, onReference, compact, userMessage }: {
  images: ImageReference[]; compact?: boolean; userMessage?: boolean; accessToken?: string | null; onReference?: (image: ImageReference) => void
}) {
  if (!accessToken || images.length === 0) return null
  return <div className={compact ? "flex max-w-full" : userMessage ? "flex max-w-full flex-wrap justify-end gap-2" : "my-2 flex max-w-full flex-wrap items-start gap-2"}>{images.map((image, index) =>
    <ImageTile key={`${image.version_id}:${index}`} image={image} accessToken={accessToken} onReference={onReference} compact={compact} userMessage={userMessage} multiple={images.length > 1} />
  )}</div>
}
