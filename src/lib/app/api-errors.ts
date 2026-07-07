export type AppErrorKind =
  | "timeout"
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "server"
  | "unknown"

export type AppError = {
  kind: AppErrorKind
  message: string
  status?: number
  cause?: unknown
  recoverable?: boolean
}

export class ApiRequestError extends Error {
  status?: number
  cause?: unknown

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message)
    this.name = "ApiRequestError"
    this.status = options?.status
    this.cause = options?.cause
  }
}

export function statusToAppErrorKind(status?: number): AppErrorKind {
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 404) return "not_found"
  if (status === 408 || status === 504) return "timeout"
  if (status === 400 || status === 422) return "validation"
  if (status && status >= 500) return "server"
  return "unknown"
}

export function defaultAppErrorMessage(kind: AppErrorKind) {
  switch (kind) {
    case "timeout":
      return "Request timed out. Please try again."
    case "network":
      return "Network connection failed. Please check your connection."
    case "unauthorized":
      return "Your session has expired. Please sign in again."
    case "forbidden":
      return "You do not have permission to perform this action."
    case "not_found":
      return "The requested resource was not found."
    case "validation":
      return "Please check the submitted information."
    case "server":
      return "Server error. Please try again later."
    case "unknown":
      return "Request failed. Please try again."
  }
}

export function normalizeAppError(
  error: unknown,
  options?: { fallbackMessage?: string }
): AppError {
  if (error instanceof ApiRequestError) {
    const kind = statusToAppErrorKind(error.status)
    return {
      kind,
      message:
        error.message ||
        options?.fallbackMessage ||
        defaultAppErrorMessage(kind),
      status: error.status,
      cause: error.cause,
      recoverable:
        kind === "timeout" || kind === "network" || kind === "server",
    }
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      kind: "timeout",
      message: options?.fallbackMessage || defaultAppErrorMessage("timeout"),
      cause: error,
      recoverable: true,
    }
  }

  if (error instanceof TypeError) {
    return {
      kind: "network",
      message: options?.fallbackMessage || defaultAppErrorMessage("network"),
      cause: error,
      recoverable: true,
    }
  }

  if (error instanceof Error) {
    return {
      kind: "unknown",
      message:
        error.message ||
        options?.fallbackMessage ||
        defaultAppErrorMessage("unknown"),
      cause: error,
      recoverable: false,
    }
  }

  if (typeof error === "string" && error.trim()) {
    return {
      kind: "unknown",
      message: error,
      cause: error,
      recoverable: false,
    }
  }

  return {
    kind: "unknown",
    message: options?.fallbackMessage || defaultAppErrorMessage("unknown"),
    cause: error,
    recoverable: false,
  }
}
