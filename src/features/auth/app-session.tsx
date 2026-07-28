import * as React from "react"
import { Navigate, useLocation } from "react-router-dom"

import { FullPageLoading } from "@/components/app/route-loading"
import {
  fetchMe,
  loginUser,
  logoutUser,
  refreshToken as refreshAuthToken,
  registerUser,
  type AppUser,
  type AuthTokenPair,
} from "@/features/auth/api/auth-api"
import {
  createConversation,
  listConversations,
  type Conversation,
} from "@/features/chat/api/chat-api"
import {
  reconcileConversationSelection,
  shouldApplyConversationListRefresh,
} from "@/features/chat/model/conversation-selection"
import { type Workspace } from "@/features/workspace/api/workspace-api"
import { defaultPath } from "@/routes/navigation"
import { i18n } from "@/lib/i18n/i18n"
import {
  getReturnPath,
  rememberReturnPath,
  type ReturnRouteState,
} from "@/lib/app/return-route"
import { clearApiResourceCache } from "@/lib/app/use-api-resource"
import { ApiRequestError } from "@/lib/app/api-errors"
import {
  ensureAuthSessionFresh,
  getAccessTokenRefreshDelay,
  registerAuthSessionRuntime,
  type AuthSessionSnapshot,
} from "@/lib/api/auth-session-runtime"

export type SessionStatus = "loading" | "authenticated" | "unauthenticated"

type AuthSessionContextValue = {
  status: SessionStatus
  accessToken: string | null
  refreshToken: string | null
  currentSessionId: string | null
  currentUser: AppUser | null
  isBootstrapping: boolean
  login: (payload: { email: string; password: string }) => Promise<void>
  register: (payload: {
    email: string
    display_name: string
    password: string
    email_verification_code: string
  }) => Promise<void>
  logout: () => Promise<void>
  refreshAppData: () => Promise<void>
}

type WorkspaceSessionContextValue = {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  selectWorkspace: (workspaceId: string) => Promise<void>
}

type ConversationSessionContextValue = {
  conversations: Conversation[]
  currentConversationId: string | null
  refreshConversations: () => Promise<void>
  createConversation: (title: string) => Promise<Conversation>
  selectConversation: (conversationId: string | null) => void
}

type AppSessionContextValue = AuthSessionContextValue &
  WorkspaceSessionContextValue &
  ConversationSessionContextValue

const STORAGE_KEYS = {
  accessToken: "ineffable.auth.access_token",
  refreshToken: "ineffable.auth.refresh_token",
  accessExpiresAt: "ineffable.auth.access_expires_at",
  refreshExpiresAt: "ineffable.auth.refresh_expires_at",
  sessionId: "ineffable.auth.session_id",
  workspaceId: "ineffable.auth.workspace_id",
  conversationId: "ineffable.chat.conversation_id",
  newConversationDraft: "ineffable.chat.new_conversation_draft",
}
const AUTH_REFRESH_LOCK_NAME = "ineffable.auth.refresh"

const AuthSessionContext = React.createContext<AuthSessionContextValue | null>(
  null,
)
const WorkspaceSessionContext =
  React.createContext<WorkspaceSessionContextValue | null>(null)
const ConversationSessionContext =
  React.createContext<ConversationSessionContextValue | null>(null)

function readStorage(key: string) {
  if (typeof window === "undefined") {
    return ""
  }

  return window.localStorage.getItem(key) ?? ""
}

function writeStorage(key: string, value: string | null) {
  if (typeof window === "undefined") {
    return
  }

  if (value) {
    window.localStorage.setItem(key, value)
    return
  }

  window.localStorage.removeItem(key)
}

function readStoredNumber(key: string) {
  const value = Number(readStorage(key))
  return Number.isFinite(value) && value > 0 ? value : null
}

function readStoredAuthSnapshot(): AuthSessionSnapshot {
  return {
    accessToken: readStorage(STORAGE_KEYS.accessToken) || null,
    refreshToken: readStorage(STORAGE_KEYS.refreshToken) || null,
    accessExpiresAt: readStoredNumber(STORAGE_KEYS.accessExpiresAt),
    refreshExpiresAt: readStoredNumber(STORAGE_KEYS.refreshExpiresAt),
  }
}

async function runAuthRefreshExclusive<T>(
  run: () => Promise<T>
): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return run()
  }
  return await navigator.locks.request(AUTH_REFRESH_LOCK_NAME, run)
}

function getWorkspaceType(workspace: Workspace) {
  return workspace.workspace_type || "team"
}

function chooseWorkspaceId(
  workspaces: Workspace[],
  preferredWorkspaceId?: string | null,
  backendWorkspaceId?: string | null,
) {
  const findWorkspace = (workspaceId?: string | null) =>
    workspaceId
      ? (workspaces.find((workspace) => workspace.id === workspaceId) ?? null)
      : null

  return (
    findWorkspace(preferredWorkspaceId)?.id ||
    findWorkspace(backendWorkspaceId)?.id ||
    workspaces.find((workspace) => getWorkspaceType(workspace) === "personal")
      ?.id ||
    workspaces.find((workspace) => getWorkspaceType(workspace) === "team")
      ?.id ||
    null
  )
}

export function AppSessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [status, setStatus] = React.useState<SessionStatus>("loading")
  const [accessToken, setAccessToken] = React.useState<string | null>(
    () => readStorage(STORAGE_KEYS.accessToken) || null,
  )
  const [refreshToken, setRefreshToken] = React.useState<string | null>(
    () => readStorage(STORAGE_KEYS.refreshToken) || null,
  )
  const [accessExpiresAt, setAccessExpiresAt] = React.useState<number | null>(
    () => readStoredNumber(STORAGE_KEYS.accessExpiresAt),
  )
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(
    () => readStorage(STORAGE_KEYS.sessionId) || null,
  )
  const [currentUser, setCurrentUser] = React.useState<AppUser | null>(null)
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceId] = React.useState<
    string | null
  >(() => readStorage(STORAGE_KEYS.workspaceId) || null)
  const [conversations, setConversations] = React.useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = React.useState<
    string | null
  >(() => readStorage(STORAGE_KEYS.conversationId) || null)
  const [isBootstrapping, setIsBootstrapping] = React.useState(false)
  const refreshAppDataPromiseRef = React.useRef<Promise<void> | null>(null)
  const initialBootstrapStartedRef = React.useRef(false)
  const conversationSelectionVersionRef = React.useRef(0)
  const conversationRefreshRequestRef = React.useRef(0)

  const clearSession = React.useCallback(() => {
    clearApiResourceCache()
    setStatus("unauthenticated")
    setAccessToken(null)
    setRefreshToken(null)
    setAccessExpiresAt(null)
    setCurrentSessionId(null)
    setCurrentUser(null)
    setWorkspaces([])
    setCurrentWorkspaceId(null)
    setConversations([])
    setCurrentConversationId(null)
    writeStorage(STORAGE_KEYS.accessToken, null)
    writeStorage(STORAGE_KEYS.refreshToken, null)
    writeStorage(STORAGE_KEYS.accessExpiresAt, null)
    writeStorage(STORAGE_KEYS.refreshExpiresAt, null)
    writeStorage(STORAGE_KEYS.sessionId, null)
    writeStorage(STORAGE_KEYS.workspaceId, null)
    writeStorage(STORAGE_KEYS.conversationId, null)
    writeStorage(STORAGE_KEYS.newConversationDraft, null)
  }, [])

  const persistTokens = React.useCallback(
    (tokens: AuthTokenPair) => {
      setAccessToken(tokens.access_token)
      setRefreshToken(tokens.refresh_token)
      setAccessExpiresAt(tokens.access_expires_at)
      setCurrentSessionId(tokens.session_id)
      writeStorage(STORAGE_KEYS.refreshToken, tokens.refresh_token)
      writeStorage(STORAGE_KEYS.accessExpiresAt, String(tokens.access_expires_at))
      writeStorage(
        STORAGE_KEYS.refreshExpiresAt,
        String(tokens.refresh_expires_at),
      )
      writeStorage(STORAGE_KEYS.sessionId, tokens.session_id)
      writeStorage(STORAGE_KEYS.accessToken, tokens.access_token)
    },
    [],
  )

  React.useEffect(
    () =>
      registerAuthSessionRuntime({
        getSnapshot: readStoredAuthSnapshot,
        refresh: async (currentRefreshToken) =>
          (await refreshAuthToken(currentRefreshToken)).tokens,
        onRefreshed: persistTokens,
        onExpired: clearSession,
        runRefreshExclusive: runAuthRefreshExclusive,
        shouldExpireOnRefreshError: (error) =>
          error instanceof ApiRequestError &&
          Boolean(error.status && error.status >= 400 && error.status < 500),
      }),
    [clearSession, persistTokens],
  )

  const refreshConversations = React.useCallback(
    async (
      _workspaceIdOverride?: string | null,
      tokenOverride?: string | null,
    ) => {
      const token = tokenOverride ?? accessToken
      const requestId = ++conversationRefreshRequestRef.current
      const selectionVersionAtRequest =
        conversationSelectionVersionRef.current

      if (!token) {
        setConversations([])
        setCurrentConversationId(null)
        writeStorage(STORAGE_KEYS.conversationId, null)
        return
      }

      const response = await listConversations(token, {
        limit: 100,
        offset: 0,
      })
      if (
        !shouldApplyConversationListRefresh({
          requestId,
          latestRequestId: conversationRefreshRequestRef.current,
          selectionVersionAtRequest,
          currentSelectionVersion: conversationSelectionVersionRef.current,
        })
      ) {
        return
      }

      setConversations(response.conversations)
      setCurrentConversationId((current) => {
        const nextId = reconcileConversationSelection({
          currentConversationId: current,
          availableConversationIds: response.conversations.map(
            (conversation) => conversation.id,
          ),
          preserveNewConversationDraft:
            readStorage(STORAGE_KEYS.newConversationDraft) === "true",
        })
        writeStorage(STORAGE_KEYS.conversationId, nextId)
        return nextId
      })
    },
    [accessToken],
  )

  const hydrateWithToken = React.useCallback(
    async (token: string) => {
      const me = await fetchMe(token)
      const nextWorkspaces = me.workspaces

      setCurrentUser(me.user)
      setWorkspaces(nextWorkspaces)

      const nextWorkspaceId = chooseWorkspaceId(
        nextWorkspaces,
        currentWorkspaceId,
        me.current_workspace_id,
      )

      setCurrentWorkspaceId(nextWorkspaceId)
      writeStorage(STORAGE_KEYS.workspaceId, nextWorkspaceId)
      setStatus("authenticated")

      await refreshConversations(nextWorkspaceId, token)
    },
    [currentWorkspaceId, refreshConversations],
  )

  const refreshAppData = React.useCallback(() => {
    if (refreshAppDataPromiseRef.current) {
      return refreshAppDataPromiseRef.current
    }

    const run = (async () => {
      if (!accessToken) {
        clearSession()
        return
      }

      setIsBootstrapping(true)

      try {
        await hydrateWithToken(accessToken)
      } catch {
        if (!readStorage(STORAGE_KEYS.accessToken)) {
          clearSession()
        } else {
          setStatus("loading")
        }
      } finally {
        setIsBootstrapping(false)
      }
    })()

    const trackedRun = run.finally(() => {
      if (refreshAppDataPromiseRef.current === trackedRun) {
        refreshAppDataPromiseRef.current = null
      }
    })

    refreshAppDataPromiseRef.current = trackedRun

    return refreshAppDataPromiseRef.current
  }, [accessToken, clearSession, hydrateWithToken])

  React.useEffect(() => {
    if (initialBootstrapStartedRef.current) {
      return
    }
    initialBootstrapStartedRef.current = true
    void refreshAppData()
  }, [refreshAppData])

  React.useEffect(() => {
    if (status !== "authenticated" || !accessToken || !refreshToken) {
      return
    }

    const delay = getAccessTokenRefreshDelay(accessExpiresAt)
    if (delay === null) {
      return
    }

    const timerId = window.setTimeout(() => {
      void ensureAuthSessionFresh()
    }, delay)
    return () => window.clearTimeout(timerId)
  }, [accessExpiresAt, accessToken, refreshToken, status])

  React.useEffect(() => {
    if (status === "unauthenticated") {
      return
    }

    function refreshWhenActive() {
      if (document.visibilityState === "visible") {
        void ensureAuthSessionFresh()
        if (status === "loading") {
          void refreshAppData()
        }
      }
    }

    window.addEventListener("focus", refreshWhenActive)
    window.addEventListener("online", refreshWhenActive)
    document.addEventListener("visibilitychange", refreshWhenActive)
    return () => {
      window.removeEventListener("focus", refreshWhenActive)
      window.removeEventListener("online", refreshWhenActive)
      document.removeEventListener("visibilitychange", refreshWhenActive)
    }
  }, [refreshAppData, status])

  React.useEffect(() => {
    if (status !== "loading" || !accessToken) {
      return
    }

    const retryId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshAppData()
      }
    }, 10_000)
    return () => window.clearInterval(retryId)
  }, [accessToken, refreshAppData, status])

  React.useEffect(() => {
    async function syncAuthStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEYS.accessToken) {
        return
      }

      const nextAccessToken = readStorage(STORAGE_KEYS.accessToken) || null
      if (!nextAccessToken) {
        clearSession()
        return
      }

      const nextRefreshToken = readStorage(STORAGE_KEYS.refreshToken) || null
      const nextSessionId = readStorage(STORAGE_KEYS.sessionId) || null
      const nextAccessExpiresAt = readStoredNumber(STORAGE_KEYS.accessExpiresAt)
      setAccessToken(nextAccessToken)
      setRefreshToken(nextRefreshToken)
      setCurrentSessionId(nextSessionId)
      setAccessExpiresAt(nextAccessExpiresAt)

      try {
        await hydrateWithToken(nextAccessToken)
      } catch {
        if (!readStorage(STORAGE_KEYS.accessToken)) {
          clearSession()
        }
      }
    }

    window.addEventListener("storage", syncAuthStorage)
    return () => window.removeEventListener("storage", syncAuthStorage)
  }, [clearSession, hydrateWithToken])

  const login = React.useCallback(
    async (payload: { email: string; password: string }) => {
      const response = await loginUser(payload)
      persistTokens(response.tokens)
      setCurrentUser(response.user)
      setStatus("authenticated")
      await hydrateWithToken(response.tokens.access_token)
    },
    [hydrateWithToken, persistTokens],
  )

  const register = React.useCallback(
    async (payload: {
      email: string
      display_name: string
      password: string
      email_verification_code: string
    }) => {
      const response = await registerUser(payload)
      persistTokens(response.tokens)
      setCurrentUser(response.user)
      setStatus("authenticated")
      await hydrateWithToken(response.tokens.access_token)
    },
    [hydrateWithToken, persistTokens],
  )

  const logout = React.useCallback(async () => {
    if (accessToken) {
      try {
        await logoutUser(accessToken, currentWorkspaceId)
      } catch {
        // Ignore logout transport failures and clear local state anyway.
      }
    }

    clearSession()
  }, [accessToken, clearSession, currentWorkspaceId])

  const selectWorkspace = React.useCallback(async (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId)
    writeStorage(STORAGE_KEYS.workspaceId, workspaceId)
  }, [])

  const createConversationForWorkspace = React.useCallback(
    async (title: string) => {
      if (!accessToken) {
        throw new Error(i18n.t("common.sessionExpired.signedOut"))
      }

      const conversation = await createConversation(accessToken, {
        title,
      })

      setConversations((current) => {
        const next = [
          conversation,
          ...current.filter((item) => item.id !== conversation.id),
        ]
        return next
      })
      conversationSelectionVersionRef.current += 1
      setCurrentConversationId(conversation.id)
      writeStorage(STORAGE_KEYS.conversationId, conversation.id)
      writeStorage(STORAGE_KEYS.newConversationDraft, null)
      return conversation
    },
    [accessToken],
  )

  const selectConversation = React.useCallback(
    (conversationId: string | null) => {
      conversationSelectionVersionRef.current += 1
      setCurrentConversationId(conversationId)
      writeStorage(STORAGE_KEYS.conversationId, conversationId)
      writeStorage(
        STORAGE_KEYS.newConversationDraft,
        conversationId == null ? "true" : null,
      )
    },
    [],
  )

  const refreshConversationList = React.useCallback(
    () => refreshConversations(),
    [refreshConversations],
  )

  const authValue = React.useMemo<AuthSessionContextValue>(
    () => ({
      status,
      accessToken,
      refreshToken,
      currentSessionId,
      currentUser,
      isBootstrapping,
      login,
      register,
      logout,
      refreshAppData,
    }),
    [
      accessToken,
      currentSessionId,
      currentUser,
      isBootstrapping,
      login,
      logout,
      refreshAppData,
      refreshToken,
      register,
      status,
    ],
  )

  const workspaceValue = React.useMemo<WorkspaceSessionContextValue>(
    () => ({
      workspaces,
      currentWorkspace:
        workspaces.find((workspace) => workspace.id === currentWorkspaceId) ??
        null,
      selectWorkspace,
    }),
    [currentWorkspaceId, selectWorkspace, workspaces],
  )

  const conversationValue = React.useMemo<ConversationSessionContextValue>(
    () => ({
      conversations,
      currentConversationId,
      refreshConversations: refreshConversationList,
      createConversation: createConversationForWorkspace,
      selectConversation,
    }),
    [
      conversations,
      createConversationForWorkspace,
      currentConversationId,
      refreshConversationList,
      selectConversation,
    ],
  )

  return (
    <AuthSessionContext.Provider value={authValue}>
      <WorkspaceSessionContext.Provider value={workspaceValue}>
        <ConversationSessionContext.Provider value={conversationValue}>
          {children}
        </ConversationSessionContext.Provider>
      </WorkspaceSessionContext.Provider>
    </AuthSessionContext.Provider>
  )
}

export function useAuthSession() {
  const context = React.useContext(AuthSessionContext)

  if (!context) {
    throw new Error("useAuthSession must be used within AppSessionProvider")
  }

  return context
}

export function useWorkspaceSession() {
  const context = React.useContext(WorkspaceSessionContext)

  if (!context) {
    throw new Error(
      "useWorkspaceSession must be used within AppSessionProvider",
    )
  }

  return context
}

export function useConversationSession() {
  const context = React.useContext(ConversationSessionContext)

  if (!context) {
    throw new Error(
      "useConversationSession must be used within AppSessionProvider",
    )
  }

  return context
}

export function useAppSession(): AppSessionContextValue {
  return {
    ...useAuthSession(),
    ...useWorkspaceSession(),
    ...useConversationSession(),
  }
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, isBootstrapping } = useAuthSession()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  React.useEffect(() => {
    rememberReturnPath(returnTo)
  }, [returnTo])

  if (status === "loading" || isBootstrapping) {
    return <FullPageLoading />
  }

  if (status !== "authenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo } satisfies ReturnRouteState}
      />
    )
  }

  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { status, isBootstrapping, currentUser } = useAuthSession()
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}${location.hash}`

  if (status === "loading" || isBootstrapping) {
    return <FullPageLoading />
  }

  if (status !== "authenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo } satisfies ReturnRouteState}
      />
    )
  }

  if (currentUser?.role !== "admin") {
    return <Navigate to={defaultPath} replace />
  }

  return <>{children}</>
}

export function RedirectIfAuthenticated({
  children,
}: {
  children: React.ReactNode
}) {
  const { status, isBootstrapping } = useAuthSession()
  const location = useLocation()

  if (status === "loading" || isBootstrapping) {
    return <FullPageLoading />
  }

  if (status === "authenticated") {
    const state = location.state as ReturnRouteState | null
    return (
      <Navigate to={getReturnPath(state?.returnTo, defaultPath)} replace />
    )
  }

  return <>{children}</>
}
