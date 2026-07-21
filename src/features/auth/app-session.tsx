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
} from "@/features/auth/api/auth-api"
import {
  createConversation,
  listConversations,
  type Conversation,
} from "@/features/chat/api/chat-api"
import { type Workspace } from "@/features/workspace/api/workspace-api"
import { defaultPath } from "@/routes/navigation"
import { i18n } from "@/lib/i18n/i18n"
import {
  getReturnPath,
  rememberReturnPath,
  type ReturnRouteState,
} from "@/lib/app/return-route"

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
  sessionId: "ineffable.auth.session_id",
  workspaceId: "ineffable.auth.workspace_id",
  conversationId: "ineffable.chat.conversation_id",
}

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

  const clearSession = React.useCallback(() => {
    setStatus("unauthenticated")
    setAccessToken(null)
    setRefreshToken(null)
    setCurrentSessionId(null)
    setCurrentUser(null)
    setWorkspaces([])
    setCurrentWorkspaceId(null)
    setConversations([])
    setCurrentConversationId(null)
    writeStorage(STORAGE_KEYS.accessToken, null)
    writeStorage(STORAGE_KEYS.refreshToken, null)
    writeStorage(STORAGE_KEYS.sessionId, null)
    writeStorage(STORAGE_KEYS.workspaceId, null)
    writeStorage(STORAGE_KEYS.conversationId, null)
  }, [])

  const persistTokens = React.useCallback(
    (
      nextAccessToken: string,
      nextRefreshToken: string,
      nextSessionId: string,
    ) => {
      setAccessToken(nextAccessToken)
      setRefreshToken(nextRefreshToken)
      setCurrentSessionId(nextSessionId)
      writeStorage(STORAGE_KEYS.accessToken, nextAccessToken)
      writeStorage(STORAGE_KEYS.refreshToken, nextRefreshToken)
      writeStorage(STORAGE_KEYS.sessionId, nextSessionId)
    },
    [],
  )

  const refreshConversations = React.useCallback(
    async (
      _workspaceIdOverride?: string | null,
      tokenOverride?: string | null,
    ) => {
      const token = tokenOverride ?? accessToken

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

      setConversations(response.conversations)
      setCurrentConversationId((current) => {
        const nextId =
          current && response.conversations.some((item) => item.id === current)
            ? current
            : (response.conversations[0]?.id ?? null)
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
        if (!refreshToken) {
          clearSession()
          return
        }

        try {
          const refreshed = await refreshAuthToken(refreshToken)
          persistTokens(
            refreshed.tokens.access_token,
            refreshed.tokens.refresh_token,
            refreshed.tokens.session_id,
          )
          await hydrateWithToken(refreshed.tokens.access_token)
        } catch {
          clearSession()
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
  }, [accessToken, clearSession, hydrateWithToken, persistTokens, refreshToken])

  React.useEffect(() => {
    void refreshAppData()
  }, [refreshAppData])

  const login = React.useCallback(
    async (payload: { email: string; password: string }) => {
      const response = await loginUser(payload)
      persistTokens(
        response.tokens.access_token,
        response.tokens.refresh_token,
        response.tokens.session_id,
      )
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
      persistTokens(
        response.tokens.access_token,
        response.tokens.refresh_token,
        response.tokens.session_id,
      )
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
      setCurrentConversationId(conversation.id)
      writeStorage(STORAGE_KEYS.conversationId, conversation.id)
      return conversation
    },
    [accessToken],
  )

  const selectConversation = React.useCallback(
    (conversationId: string | null) => {
      setCurrentConversationId(conversationId)
      writeStorage(STORAGE_KEYS.conversationId, conversationId)
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
