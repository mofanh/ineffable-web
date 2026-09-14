import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { FolderOpenIcon, ImagePlusIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function ImageAttachmentActions({ disabled, onFiles, onWorkspace }: {
  disabled: boolean
  onFiles: (files: File[]) => void
  onWorkspace?: () => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  return <>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" aria-label={t("images.add")} onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t("images.add")} title={t("images.add")} className="group shrink-0 rounded-full bg-muted/60 text-foreground hover:bg-muted data-[state=open]:bg-muted">
          <PlusIcon className="size-5 transition-transform duration-150 group-data-[state=open]:rotate-45" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl p-1.5 shadow-lg">
        <DropdownMenuItem className="gap-3 rounded-xl px-3 py-2.5" onSelect={() => input.current?.click()}>
          <ImagePlusIcon className="size-5 shrink-0" />
          <span className="min-w-0"><span className="block font-medium">{t("images.upload")}</span><span className="block text-xs text-muted-foreground">{t("images.uploadHint")}</span></span>
        </DropdownMenuItem>
        {onWorkspace ? <DropdownMenuItem className="gap-3 rounded-xl px-3 py-2.5" onSelect={onWorkspace}>
          <FolderOpenIcon className="size-5 shrink-0" />
          <span className="min-w-0"><span className="block font-medium">{t("images.fromWorkspace")}</span><span className="block text-xs text-muted-foreground">{t("images.workspaceHint")}</span></span>
        </DropdownMenuItem> : null}
        <p className="px-3 pb-1.5 pt-2 text-[11px] leading-relaxed text-muted-foreground">{t("images.limits")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  </>
}
