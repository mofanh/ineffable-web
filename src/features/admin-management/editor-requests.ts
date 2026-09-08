import { listAdminPlanModelAccess } from "@/lib/api/api-client"
import type { AppError } from "@/lib/app/api-errors"

const accessReads = new Map<string, { token: string; promise: ReturnType<typeof listAdminPlanModelAccess> }>()

// Share only concurrent reads, never reuse an editable snapshot as a cache.
export function readPlanAccess(token: string, sessionId: string | null, planId: string) {
  const key = JSON.stringify([sessionId, planId])
  const active = accessReads.get(key)
  if (active?.token === token) return active.promise
  const promise = listAdminPlanModelAccess(token, planId, sessionId ?? undefined)
  accessReads.set(key, { token, promise })
  const release = () => { if (accessReads.get(key)?.promise === promise) accessReads.delete(key) }
  void promise.then(release, release)
  return promise
}

export function isWriteOutcomeUnknown(error: AppError) {
  return !error.status || error.status === 408 || error.status < 400 || error.status >= 500
}
