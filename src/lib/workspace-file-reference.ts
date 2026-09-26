/** Canonical content is the only draft/persistence owner for file references. */
import type { ImageReference } from "./image-reference"
export type WorkspaceFileReference = {
  workspaceId: string
  objectId: string
  versionId: string
  label: string
}
const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
const uriPattern = new RegExp(`^workspace://(${uuid})/(${uuid})/(${uuid})$`)
export const MAX_FILE_REFERENCES = 32

export function referenceUri(ref: WorkspaceFileReference) {
  return `workspace://${ref.workspaceId}/${ref.objectId}/${ref.versionId}`
}
export function referenceMatchesImage(ref: WorkspaceFileReference, image: ImageReference) {
  return ref.workspaceId === image.workspace_id && ref.objectId === image.object_id && ref.versionId === image.version_id
}
export function removeImageFileReference(content: string, image: ImageReference) {
  const draft = splitFileReferences(content)
  return joinFileReferences(draft.text, draft.references.filter(ref => !referenceMatchesImage(ref, image)))
}
export function parseReferenceUri(uri: string, label = ""): WorkspaceFileReference | null {
  const match = uri.match(uriPattern)
  return match ? { workspaceId: match[1].toLowerCase(), objectId: match[2].toLowerCase(), versionId: match[3].toLowerCase(), label: label || match[2] } : null
}
export function referencePage(ref: WorkspaceFileReference) {
  return `/workspace/${ref.workspaceId}/objects/${ref.objectId}?version=${ref.versionId}`
}
function escapeLabel(label: string) { return label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/[\r\n]/g, " ") }
export function referenceMarkdown(ref: WorkspaceFileReference, origin?: string) {
  return `[${escapeLabel(ref.label)}](${origin ? origin + referencePage(ref) : referenceUri(ref)})`
}
export function mergeReferences(...groups: WorkspaceFileReference[][]) {
  const map = new Map<string, WorkspaceFileReference>()
  for (const ref of groups.flat()) map.set(referenceUri(ref), ref)
  return [...map.values()]
}
export function splitFileReferences(content: string) {
  const references: WorkspaceFileReference[] = []
  const rawReferences: string[] = []
  const text = content.replace(/\[((?:\\.|[^\]\\])*)\]\((workspace:\/\/[^\s)]+)\)/g, (whole, label: string, uri: string) => {
    const ref = parseReferenceUri(uri, label.replace(/\\([\\[\]])/g, "$1"))
    if (!ref) return whole
    references.push(ref)
    rawReferences.push(whole)
    return ""
  })
  // Strip only our serialized footer. User-authored trailing newlines are data:
  // trimming them here would make Enter stop working once a file is attached.
  const footer = `\n\n${rawReferences.join("\n")}`
  return { text: rawReferences.length && content.endsWith(footer) ? content.slice(0, -footer.length) : text, references: mergeReferences(references) }
}
export function joinFileReferences(text: string, references: WorkspaceFileReference[]) {
  return references.length ? `${text}\n\n${mergeReferences(references).map(ref => referenceMarkdown(ref)).join("\n")}` : text
}
/** Only same-origin links minted with an immutable version become local pointers. */
export function normalizeReferencePaste(text: string, origin: string) {
  return text.replace(/\[((?:\\.|[^\]\\])*)\]\((https?:\/\/[^\s)]+)\)/g, (whole, label: string, href: string) => {
    try {
      const url = new URL(href)
      const path = url.pathname.match(new RegExp(`^/workspace/(${uuid})/objects/(${uuid})$`))
      if (url.origin !== origin || url.username || url.password || !path || url.hash || url.searchParams.size !== 1) return whole
      const ref = parseReferenceUri(`workspace://${path[1]}/${path[2]}/${url.searchParams.get("version")}`, label.replace(/\\([\\[\]])/g, "$1"))
      return ref ? referenceMarkdown(ref) : whole
    } catch { return whole }
  })
}
export function fileMentionAt(text: string, cursor: number) {
  const match = text.slice(0, cursor).match(/(^|\s)@([^@\n]*)$/)
  return match && match.index != null ? { start: match.index + match[1].length, end: cursor, query: match[2] } : null
}
