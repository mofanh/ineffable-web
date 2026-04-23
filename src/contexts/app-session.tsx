import * as React from "react"
import { Navigate } from "react-router-dom"

import {
  createConversation,
  createWorkspace,
  fetchMe,
  loginUser,
  logoutUser,
  refreshToken as refreshAuthToken,
  registerUser,
  listConversations,
  type AppUser,
  type Conversation,
  type Workspace,
} from "@/lib/api/gateway-client"
import { defaultPath } from "@/routes/navigation"

type SessionStatus = "loading" | "authenticated" | "unauthenticated"

type AppSessionContextValue = {
  status: SessionStatus
  accessToken: string | null
  refreshToken: string | null
  currentSessionId: string | null
  currentUser: AppUser | null
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  conversations: Conversation[]
  currentConversationId: string | null
  isBootstrapping: boolean
  login: (payload: { email: string; password: string }) => Promise<void>
  register: (payload: {
    email: string
    display_name: string
    password: string
  }) => Promise<void>
  logout: () => Promise<void>
  refreshAppData: () => Promise<void>
  selectWorkspace: (workspaceId: string) => Promise<void>
  refreshConversations: () => Promise<void>
  createConversation: (title: string) => Promise<Conversation>
  selectConversation: (conversationId: string | null) => void
}

const STORAGE_KEYS = {
  accessToken: "ineffable.auth.access_token",
  refreshToken: "ineffable.auth.refresh_token",
  sessionId: "ineffable.auth.session_id",
  workspaceId: "ineffable.auth.workspace_id",
  conversationId: "ineffable.chat.conversation_id",
}

const AppSessionContext = React.createContext<AppSessionContextValue | null>(null)

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

function slugify(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || `workspace-${Date.now()}`
}

export function AppSessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [status, setStatus] = React.useState<SessionStatus>("loading")
  const [accessToken, setAccessToken] = React.useState<string | null>(() =>
    readStorage(STORAGE_KEYS.accessToken) || null
  )
  const [refreshToken, setRefreshToken] = React.useState<string | null>(() =>
    readStorage(STORAGE_KEYS.refreshToken) || null
  )
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(() =>
    readStorage(STORAGE_KEYS.sessionId) || null
  )
  const [currentUser, setCurrentUser] = React.useState<AppUser | null>(null)
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceId] = React.useState<string | null>(() =>
    readStorage(STORAGE_KEYS.workspaceId) || null
  )
  const [conversations, setConversations] = React.useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(() =>
    readStorage(STORAGE_KEYS.conversationId) || null
  )
  const [isBootstrapping, setIsBootstrapping] = React.useState(false)

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

  const persistTokens = React.useCallback((
    nextAccessToken: string,
    nextRefreshToken: string,
    nextSessionId: string
  ) => {
    setAccessToken(nextAccessToken)
    setRefreshToken(nextRefreshToken)
    setCurrentSessionId(nextSessionId)
    writeStorage(STORAGE_KEYS.accessToken, nextAccessToken)
    writeStorage(STORAGE_KEYS.refreshToken, nextRefreshToken)
    writeStorage(STORAGE_KEYS.sessionId, nextSessionId)
  }, [])

  const ensureWorkspace = React.useCallback(
    async (token: string, user: AppUser, existingWorkspaces: Workspace[]) => {
      if (existingWorkspaces.length > 0) {
        return existingWorkspaces
      }

      const base = user.display_name || user.email.split("@")[0] || "Workspace"
      const response = await createWorkspace(token, {
        slug: `${slugify(base)}-${Date.now().toString().slice(-6)}`,
        name: `${base} Workspace`,
      })

      return [response.workspace]
    },
    []
  )

  const refreshConversations = React.useCallback(
    async (workspaceIdOverride?: string | null, tokenOverride?: string | null) => {
      const token = tokenOverride ?? accessToken
      const workspaceId = workspaceIdOverride ?? currentWorkspaceId

      if (!token || !workspaceId) {
        setConversations([])
        setCurrentConversationId(null)
        writeStorage(STORAGE_KEYS.conversationId, null)
        return
      }

      const response = await listConversations(token, workspaceId, {
        limit: 100,
        offset: 0,
      })

      setConversations(response.conversations)
      setCurrentConversationId((current) => {
        const nextId =
          current && response.conversations.some((item) => item.id === current)
            ? current
            : response.conversations[0]?.id ?? null
        writeStorage(STORAGE_KEYS.conversationId, nextId)
        return nextId
      })
    },
    [accessToken, currentWorkspaceId]
  )

  const hydrateWithToken = React.useCallback(
    async (token: string) => {
      const me = await fetchMe(token, currentWorkspaceId)
      const nextWorkspaces = await ensureWorkspace(token, me.user, me.workspaces)

      setCurrentUser(me.user)
      setWorkspaces(nextWorkspaces)

      const nextWorkspaceId =
        (currentWorkspaceId &&
          nextWorkspaces.some((workspace) => workspace.id === currentWorkspaceId) &&
          currentWorkspaceId) ||
        me.current_workspace_id ||
        nextWorkspaces[0]?.id ||
        null

      setCurrentWorkspaceId(nextWorkspaceId)
      writeStorage(STORAGE_KEYS.workspaceId, nextWorkspaceId)
      setStatus("authenticated")

      await refreshConversations(nextWorkspaceId, token)
    },
    [currentWorkspaceId, ensureWorkspace, refreshConversations]
  )

  const refreshAppData = React.useCallback(async () => {
    if (!accessToken) {
      clearSession()
      return
    }

    setIsBootstrapping(true)

    try {
      await hydrateWithToken(accessToken)
    } catch (error) {
      if (!refreshToken) {
        clearSession()
        setIsBootstrapping(false)
        return
      }

      try {
        const refreshed = await refreshAuthToken(refreshToken)
        persistTokens(
          refreshed.tokens.access_token,
          refreshed.tokens.refresh_token,
          refreshed.tokens.session_id
        )
        await hydrateWithToken(refreshed.tokens.access_token)
      } catch {
        clearSession()
      }
    } finally {
      setIsBootstrapping(false)
    }
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
        response.tokens.session_id
      )
      setCurrentUser(response.user)
      setStatus("authenticated")
      await hydrateWithToken(response.tokens.access_token)
    },
    [hydrateWithToken, persistTokens]
  )

  const register = React.useCallback(
    async (payload: { email: string; display_name: string; password: string }) => {
      const response = await registerUser(payload)
      persistTokens(
        response.tokens.access_token,
        response.tokens.refresh_token,
        response.tokens.session_id
      )
      setCurrentUser(response.user)
      setStatus("authenticated")
      await hydrateWithToken(response.tokens.access_token)
    },
    [hydrateWithToken, persistTokens]
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

  const selectWorkspace = React.useCallback(
    async (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId)
      writeStorage(STORAGE_KEYS.workspaceId, workspaceId)
      await refreshConversations(workspaceId)
    },
    [refreshConversations]
  )

  const createConversationForWorkspace = React.useCallback(
    async (title: string) => {
      if (!accessToken || !currentWorkspaceId) {
        throw new Error("当前未绑定工作区。")
      }

      const conversation = await createConversation(accessToken, currentWorkspaceId, {
        title,
      })

      setConversations((current) => {
        const next = [conversation, ...current.filter((item) => item.id !== conversation.id)]
        return next
      })
      setCurrentConversationId(conversation.id)
      writeStorage(STORAGE_KEYS.conversationId, conversation.id)
      return conversation
    },
    [accessToken, currentWorkspaceId]
  )

  const selectConversation = React.useCallback((conversationId: string | null) => {
    setCurrentConversationId(conversationId)
    writeStorage(STORAGE_KEYS.conversationId, conversationId)
  }, [])

  const value = React.useMemo<AppSessionContextValue>(
    () => ({
      status,
      accessToken,
      refreshToken,
      currentSessionId,
      currentUser,
      workspaces,
      currentWorkspace:
        workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null,
      conversations,
      currentConversationId,
      isBootstrapping,
      login,
      register,
      logout,
      refreshAppData,
      selectWorkspace,
      refreshConversations: () => refreshConversations(),
      createConversation: createConversationForWorkspace,
      selectConversation,
    }),
    [
      accessToken,
      conversations,
      createConversationForWorkspace,
      currentConversationId,
      currentSessionId,
      currentUser,
      currentWorkspaceId,
      isBootstrapping,
      login,
      logout,
      refreshAppData,
      refreshConversations,
      refreshToken,
      register,
      selectConversation,
      selectWorkspace,
      status,
      workspaces,
    ]
  )

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  )
}

export function useAppSession() {
  const context = React.useContext(AppSessionContext)

  if (!context) {
    throw new Error("useAppSession must be used within AppSessionProvider")
  }

  return context
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, isBootstrapping } = useAppSession()

  if (status === "loading" || isBootstrapping) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        正在加载账号会话…
      </div>
    )
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export function RedirectIfAuthenticated({
  children,
}: {
  children: React.ReactNode
}) {
  const { status, isBootstrapping } = useAppSession()

  if (status === "loading" || isBootstrapping) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        正在加载账号会话…
      </div>
    )
  }

  if (status === "authenticated") {
    return <Navigate to={defaultPath} replace />
  }

  return <>{children}</>
}
