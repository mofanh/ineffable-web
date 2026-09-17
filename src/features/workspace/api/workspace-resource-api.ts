import {
  getWorkspaceObjectContent,
  listWorkspaceDirectory,
  listWorkspaceObjectVersions,
  type WorkspaceObjectContentResponse,
} from "@/features/workspace/api/workspace-api"

type InFlightRequest<T> = {
  accessToken: string
  promise: Promise<T>
}

const workspaceContentRequests = new Map<
  string,
  InFlightRequest<WorkspaceObjectContentResponse>
>()

function reuseInFlightRequest<T>({
  requests,
  key,
  accessToken,
  load,
}: {
  requests: Map<string, InFlightRequest<T>>
  key: string
  accessToken: string
  load: () => Promise<T>
}) {
  const active = requests.get(key)
  if (active?.accessToken === accessToken) {
    return active.promise
  }

  const promise = load()
  requests.set(key, { accessToken, promise })
  void promise.then(
    () => {
      if (requests.get(key)?.promise === promise) {
        requests.delete(key)
      }
    },
    () => {
      if (requests.get(key)?.promise === promise) {
        requests.delete(key)
      }
    }
  )
  return promise
}

export function getWorkspaceObjectContentDeduped(
  accessToken: string,
  workspaceId: string,
  objectId: string
) {
  return reuseInFlightRequest({
    requests: workspaceContentRequests,
    key: `${workspaceId}:${objectId}`,
    accessToken,
    load: () => getWorkspaceObjectContent(accessToken, workspaceId, objectId),
  })
}

const directoryRequests = new Map<string, InFlightRequest<Awaited<ReturnType<typeof listWorkspaceDirectory>>>>()
export function listWorkspaceDirectoryDeduped(accessToken: string, workspaceId: string, path = "", cursor?: string) {
  return reuseInFlightRequest({ requests: directoryRequests, key: JSON.stringify([workspaceId, path, cursor]),
    accessToken, load: () => listWorkspaceDirectory(accessToken, workspaceId, path, cursor) })
}

// Metadata chooses the representation before any text decoding request.
export function isWorkspaceImage(mimeType?: string | null) {
  return Boolean(mimeType?.toLowerCase().startsWith("image/"))
}
const documentRequests = new Map<string, InFlightRequest<Awaited<ReturnType<typeof loadWorkspaceDocument>>>>()
async function loadWorkspaceDocument(accessToken: string, workspaceId: string, objectId: string) {
  const metadata = await listWorkspaceObjectVersions(accessToken, workspaceId, objectId)
  if (isWorkspaceImage(metadata.object.mime_type)) {
    return { object: metadata.object, version: metadata.versions.find(v => v.id === metadata.object.current_version_id) ?? null,
      content: "", versions: metadata.versions }
  }
  const content = await getWorkspaceObjectContentDeduped(accessToken, workspaceId, objectId)
  return { ...content, versions: metadata.versions }
}
export function getWorkspaceDocument(accessToken: string, workspaceId: string, objectId: string) {
  return reuseInFlightRequest({ requests: documentRequests, key: `${workspaceId}:${objectId}`, accessToken,
    load: () => loadWorkspaceDocument(accessToken, workspaceId, objectId) })
}
