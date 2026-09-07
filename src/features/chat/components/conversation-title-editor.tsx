import * as React from "react"
import { useTranslation } from "react-i18next"
import { PencilIcon } from "lucide-react"
import { AppDialog, AppDialogFooter } from "@/components/app/app-dialog"
import { FormField } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { normalizeAppError } from "@/lib/app/api-errors"

export function ConversationTitleEditor({ title, onSave }: {
  title: string
  onSave: (title: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(title)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const generation = React.useRef(0)
  const fieldId = React.useId()
  React.useEffect(() => () => { generation.current += 1 }, [])

  function changeOpen(next: boolean) {
    generation.current += 1
    setOpen(next)
    setSaving(false)
    setError(null)
    if (next) setDraft(title)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || saving) return
    const request = ++generation.current
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      if (request === generation.current) changeOpen(false)
    } catch (caught) {
      if (request === generation.current) {
        setError(normalizeAppError(caught, { fallbackMessage: t("chat.header.renameFailed") }).message)
      }
    } finally {
      if (request === generation.current) setSaving(false)
    }
  }

  return <>
    <Button type="button" variant="ghost" size="icon" className="size-8 rounded-md text-muted-foreground" title={t("chat.header.rename")} aria-label={t("chat.header.rename")} onClick={() => changeOpen(true)}>
      <PencilIcon className="size-3.5" />
    </Button>
    <AppDialog open={open} onOpenChange={changeOpen} title={t("chat.header.rename")} maxWidth="lg">
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <FormField label={t("chat.header.titleLabel")} htmlFor={fieldId}>
          <Input id={fieldId} autoFocus value={draft} disabled={saving} onChange={(event) => setDraft(event.target.value)} />
        </FormField>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AppDialogFooter>
          <Button type="button" variant="outline" onClick={() => changeOpen(false)}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={saving || !draft.trim()}>{t("chat.header.saveTitle")}</Button>
        </AppDialogFooter>
      </form>
    </AppDialog>
  </>
}
