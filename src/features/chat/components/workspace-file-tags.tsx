import { XIcon } from "lucide-react"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { AppDialog } from "@/components/app/app-dialog"
import { Notice } from "@/components/app/notice"
import { normalizeAppError } from "@/lib/app/api-errors"
import { referencePage, referenceUri, type WorkspaceFileReference } from "@/lib/workspace-file-reference"

export function WorkspaceFileTags({ references, onRemove, accessToken }: { references: WorkspaceFileReference[]; accessToken?: string | null; onRemove?: (uri: string) => void }) {
  const { t } = useTranslation()
  const [selected, setSelected] = React.useState<{ ref: WorkspaceFileReference; token: string }>()
  const current = selected && selected.token === accessToken && references.some(ref => referenceUri(ref) === referenceUri(selected.ref)) ? selected : undefined
  return <><div className="flex min-w-0 flex-wrap gap-1.5" data-workspace-file-tags>
    {references.map(ref => <span key={referenceUri(ref)} className="inline-flex max-w-full items-center gap-1 rounded-lg border bg-muted/40 px-2 py-1 text-xs">
      <a className="truncate underline-offset-2 hover:underline" href={referencePage(ref)} target="_blank" rel="noopener noreferrer" title={ref.label} onClick={event => { if (accessToken) { event.preventDefault(); setSelected({ ref, token: accessToken }) } }}>{ref.label}</a>
      {onRemove && <Button type="button" variant="ghost" size="icon" className="size-5 shrink-0" aria-label={t("fileReferences.remove", { name: ref.label })} onClick={() => onRemove(referenceUri(ref))}><XIcon className="size-3" /></Button>}
    </span>)}
  </div>{current && <FileReferencePreview key={`${current.token}:${referenceUri(current.ref)}`} reference={current.ref} accessToken={current.token} onClose={() => setSelected(undefined)} />}</>
}

function FileReferencePreview({ reference, accessToken, onClose }: { reference: WorkspaceFileReference; accessToken: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [result, setResult] = React.useState<{ content?: string; error?: string }>()
  React.useEffect(() => {
    let active = true
    void import("@/lib/api/api-client").then(({ getWorkspaceObjectVersionContent }) => getWorkspaceObjectVersionContent(accessToken, reference.workspaceId, reference.versionId)).then(result => {
      if (result.object.id !== reference.objectId || result.object.workspace_id !== reference.workspaceId || result.version.id !== reference.versionId) throw new Error(t("fileReferences.unavailable"))
      if (active) setResult({ content: result.content })
    }).catch(error => { if (active) setResult({ error: normalizeAppError(error, { fallbackMessage: t("fileReferences.unavailable") }).message }) })
    return () => { active = false }
  }, [accessToken, reference, t])
  return <AppDialog open title={reference.label} description={t("fileReferences.version", { version: reference.versionId })} onOpenChange={open => { if (!open) onClose() }} maxWidth="3xl">
    {!result ? <p role="status">{t("common.loading")}</p> : result.error ? <Notice tone="error">{t("fileReferences.previewUnavailable")} {result.error}</Notice> : <pre className="whitespace-pre-wrap wrap-anywhere text-sm">{result.content}</pre>}
    <a className="mt-3 inline-block text-sm underline" href={referencePage(reference)} target="_blank" rel="noopener noreferrer">{t("fileReferences.openCurrent")}</a>
  </AppDialog>
}
