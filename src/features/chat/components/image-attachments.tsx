import { useTranslation } from "react-i18next"
import { XIcon, LoaderCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ImageGallery } from "@/components/app/image-gallery"
import type { ImageDraft } from "@/features/chat/model/use-image-attachments"

export function ImageAttachments({ items, accessToken, onRemove, onRetry }: {
  items: ImageDraft[]; accessToken?: string | null;
  onRemove: (id: string) => void; onRetry: (item: ImageDraft) => void
}) {
  const { t } = useTranslation()
  if (!items.length) return null
  return <div className="min-w-0 max-w-full" title={t("images.savedInWorkspace")}>
    {items.length ? <div className="flex max-w-full gap-3 overflow-x-auto p-1">{items.map((item) => <div key={item.id} className="relative w-20 shrink-0 rounded-xl border bg-muted/30">
      <Button type="button" variant="ghost" size="icon-sm" className="absolute -right-1 -top-1 z-10 size-6 rounded-full border bg-background shadow-sm" onClick={() => onRemove(item.id)} aria-label={t("images.remove")}><XIcon /></Button>
      {item.image ? <ImageGallery images={[item.image]} accessToken={accessToken} compact /> : <div className="flex h-20 items-center gap-1 overflow-hidden p-2 text-xs text-muted-foreground">{item.status === "uploading" ? <LoaderCircleIcon className="size-4 shrink-0 animate-spin" /> : null}<span className="truncate">{item.file?.name}</span></div>}
      {item.status === "error" ? <><p className="break-words text-xs text-destructive">{item.error}</p><Button type="button" size="sm" variant="ghost" onClick={() => onRetry(item)}>{t("common.retry")}</Button></> : null}
    </div>)}</div> : null}
  </div>
}
