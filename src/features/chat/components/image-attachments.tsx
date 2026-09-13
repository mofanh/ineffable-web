import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { ImagePlusIcon, XIcon, LoaderCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ImageGallery } from "@/components/app/image-gallery"
import type { ImageDraft } from "@/features/chat/model/use-image-attachments"

export function ImageAttachments({ items, enabled, accessToken, onFiles, onRemove, onRetry }: {
  items: ImageDraft[]; enabled: boolean; accessToken?: string | null;
  onFiles: (files: File[]) => void; onRemove: (id: string) => void; onRetry: (item: ImageDraft) => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  return <div className="min-w-0 space-y-2">
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" aria-label={t("images.add")} onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} />
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="ghost" size="sm" disabled={!enabled || items.length >= 4} onClick={() => input.current?.click()} title={t("images.limits")}><ImagePlusIcon className="size-4" />{t("images.add")}</Button>
      {items.length ? <span className="text-xs text-muted-foreground">{t("images.savedInWorkspace")}</span> : null}
    </div>
    {items.length ? <div className="flex max-w-full gap-2 overflow-x-auto pb-1">{items.map((item) => <div key={item.id} className="relative w-32 shrink-0 rounded-lg border p-2">
      <Button type="button" variant="ghost" size="icon-sm" className="absolute right-0 top-0 z-10 rounded-full bg-background/80" onClick={() => onRemove(item.id)} aria-label={t("images.remove")}><XIcon /></Button>
      {item.image ? <ImageGallery images={[item.image]} accessToken={accessToken} /> : <div className="flex min-h-16 items-center gap-1 text-xs text-muted-foreground">{item.status === "uploading" ? <LoaderCircleIcon className="size-4 shrink-0 animate-spin" /> : null}<span className="truncate">{item.file?.name}</span></div>}
      {item.status === "error" ? <><p className="break-words text-xs text-destructive">{item.error}</p><Button type="button" size="sm" variant="ghost" onClick={() => onRetry(item)}>{t("common.retry")}</Button></> : null}
    </div>)}</div> : null}
  </div>
}
