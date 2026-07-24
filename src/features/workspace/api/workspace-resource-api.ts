import {
  getWorkspaceObjectContent,
  listWorkspaceTree,
  type WorkspaceObjectContentResponse,
  type WorkspaceTreeResponse,
} from "@/features/workspace/api/workspace-api"

type InFlightRequest<T> = {
  accessToken: string
  promise: Promise<T>
}

const workspaceTreeRequests = new Map<
  string,
  InFlightRequest<WorkspaceTreeResponse>
>()
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

export function listWorkspaceTreeDeduped(
  accessToken: string,
  workspaceId: string
) {
  return reuseInFlightRequest({
    requests: workspaceTreeRequests,
    key: workspaceId,
    accessToken,
    load: () => listWorkspaceTree(accessToken, workspaceId),
  })
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
