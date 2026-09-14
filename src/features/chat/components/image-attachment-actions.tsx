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
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52 max-w-[calc(100vw-2rem)] rounded-xl p-1 shadow-md">
        <DropdownMenuItem className="min-h-9 gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-normal" title={t("images.limits")} onSelect={() => input.current?.click()}>
          <ImagePlusIcon className="size-4 shrink-0 text-muted-foreground" />
          <span>{t("images.upload")}</span>
        </DropdownMenuItem>
        {onWorkspace ? <DropdownMenuItem className="min-h-9 gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-normal" onSelect={onWorkspace}>
          <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
          <span>{t("images.fromWorkspace")}</span>
        </DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  </>
}
