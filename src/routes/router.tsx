import { Suspense, lazy, useEffect, useState } from "react"
import { Navigate, createBrowserRouter } from "react-router-dom"

import { FullPageLoading } from "@/components/app/route-loading"
import { RouteErrorPage } from "@/components/app/route-error-page"
import {
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
  useAuthSession,
} from "@/features/auth/app-session"
import { AuthLayout } from "@/layouts/auth-layout"
import { defaultPath } from "@/routes/navigation"
import { createDeferredModule } from "@/lib/app/deferred-module"

const TeamWorkspaceDirectoryPage = lazy(() => import("@/pages/team-workspace-directory-page"))
const SettingsPage = lazy(() => import("@/pages/settings-page"))
const appModule = createDeferredModule(() => import("@/App"))

function BootstrappedApp() {
  const { isBootstrapping } = useAuthSession()
  const [hasEntered, setHasEntered] = useState(false)
  const module = appModule.useModule()
  useEffect(() => {
    if (!isBootstrapping) setHasEntered(true)
  }, [isBootstrapping])
  // Initial selection must settle, but a later refresh must preserve drafts and streams.
  if (!module || (!hasEntered && isBootstrapping)) return <FullPageLoading />
  const App = module.default
  return <App />
}

function AppRoute() {
  const { currentSessionId } = useAuthSession()
  return <BootstrappedApp key={currentSessionId} />
}

function AuthEntryRoute() {
  const { status } = useAuthSession()
  useEffect(() => {
    if (status === "authenticated") {
      // Overlap code loading with bootstrap's first list. The same promise,
      // including rejection, is consumed by AppRoute and the existing error boundary.
      void appModule.preload().catch(() => undefined)
    }
  }, [status])
  return (
    <RedirectIfAuthenticated>
      <AuthLayout />
    </RedirectIfAuthenticated>
  )
}
const AccountPage = lazy(async () => ({
  default: (await import("@/pages/account-pages")).AccountPage,
}))
const ChannelsPage = lazy(async () => ({ default: (await import("@/pages/agent-products/channels-page")).ChannelsPage }))
const AutomationPage = lazy(async () => ({
  default: (await import("@/pages/agent-products/automation-page")).AutomationPage,
}))
const AgentNodeManagementPage = lazy(async () => ({
  default: (await import("@/pages/agent-node-management-page"))
    .AgentNodeManagementPage,
}))
const LoginPage = lazy(async () => ({
  default: (await import("@/pages/auth-pages")).LoginPage,
}))
const RegisterPage = lazy(async () => ({
  default: (await import("@/pages/auth-pages")).RegisterPage,
}))
const SandboxPreviewLaunchPage = lazy(async () => ({
  default: (await import("@/pages/sandbox-preview-launch-page"))
    .SandboxPreviewLaunchPage,
}))
const ModelCenterPage = lazy(async () => ({
  default: (await import("@/pages/model-pages")).ModelCenterPage,
}))
const AcceptWorkspaceInvitationPage = lazy(async () => ({
  default: (await import("@/pages/team-workspace-pages"))
    .AcceptWorkspaceInvitationPage,
}))
const CreateTeamWorkspacePage = lazy(async () => ({
  default: (await import("@/pages/team-workspace-pages")).CreateTeamWorkspacePage,
}))
const TeamWorkspaceMembersPage = lazy(async () => ({
  default: (await import("@/pages/team-workspace-pages")).TeamWorkspaceMembersPage,
}))
const WorkspaceNotificationsPage = lazy(async () => ({
  default: (await import("@/pages/team-workspace-pages")).WorkspaceNotificationsPage,
}))
const WorkspaceObjectEditorPage = lazy(async () => ({
  default: (await import("@/pages/workspace-object-editor-page"))
    .WorkspaceObjectEditorPage,
}))
const AdminLlmSettingsPage = lazy(async () => ({
  default: (await import("@/pages/system-management/models-page"))
    .AdminLlmSettingsPage,
}))
const SystemModelManagementPage = lazy(async () => ({
  default: (await import("@/pages/system-management/models-page"))
    .SystemModelManagementPage,
}))
const SystemPlanManagementPage = lazy(async () => ({
  default: (await import("@/pages/system-management/plans-page"))
    .SystemPlanManagementPage,
}))
const SystemSecretManagementPage = lazy(async () => ({
  default: (await import("@/pages/system-management/secrets-page"))
    .SystemSecretManagementPage,
}))
const SystemUserManagementPage = lazy(async () => ({
  default: (await import("@/pages/system-management/users-page"))
    .SystemUserManagementPage,
}))

const routeElements: Record<string, React.ReactElement> = {
  "/account": <AccountPage />,
  "/channels": <ChannelsPage />,
  "/admin/llm": (
    <RequireAdmin>
      <AdminLlmSettingsPage />
    </RequireAdmin>
  ),
  "/system/models": (
    <RequireAdmin>
      <SystemModelManagementPage />
    </RequireAdmin>
  ),
  "/system/plans": (
    <RequireAdmin>
      <SystemPlanManagementPage />
    </RequireAdmin>
  ),
  "/system/secrets": (
    <RequireAdmin>
      <SystemSecretManagementPage />
    </RequireAdmin>
  ),
  "/system/users": (
    <RequireAdmin>
      <SystemUserManagementPage />
    </RequireAdmin>
  ),
  "/automation": <AutomationPage />,
  "/agent-nodes": <AgentNodeManagementPage />,
  "/models": <ModelCenterPage />,
  "/models/genesis": <Navigate to="/models" replace />,
  "/models/explorer": <Navigate to="/models" replace />,
  "/models/quantum": <Navigate to="/models" replace />,
  "/notifications": <WorkspaceNotificationsPage />,
  "/docs": <Navigate to="/automation" replace />,
  "/docs/introduction": <Navigate to="/automation" replace />,
  "/docs/get-started": <Navigate to="/automation" replace />,
  "/docs/tutorials": <Navigate to="/automation" replace />,
  "/docs/changelog": <Navigate to="/automation" replace />,
  "/settings": <SettingsPage />,
  "/settings/general": <Navigate to="/account" replace />,
  "/settings/team": <Navigate to="/account" replace />,
  "/settings/billing": <Navigate to="/account" replace />,
  "/settings/limits": <Navigate to="/account" replace />,
  "/projects": <Navigate to="/automation" replace />,
  "/projects/design-engineering": <Navigate to="/automation" replace />,
  "/projects/sales-marketing": <Navigate to="/automation" replace />,
  "/projects/travel": <Navigate to="/automation" replace />,
  "/support": <Navigate to="/account" replace />,
  "/feedback": <Navigate to="/account" replace />,
}

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    element: <AuthEntryRoute />,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "register",
        element: <RegisterPage />,
      },
    ],
  },
  {
    path: "/sandbox-preview/:exposureId",
    errorElement: <RouteErrorPage />,
    element: (
      <RequireAuth>
        <Suspense fallback={<FullPageLoading />}>
          <SandboxPreviewLaunchPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: "/",
    errorElement: <RouteErrorPage />,
    element: (
      <RequireAuth>
        <AppRoute />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: <Navigate to={defaultPath} replace />,
      },
      ...Object.entries(routeElements).map(([path, element]) => ({
        path: path.replace(/^\//, ""),
        element,
      })),
      {
        path: "workspace/:workspaceId/objects/:objectId?",
        element: <WorkspaceObjectEditorPage />,
      },
      { path: "team-spaces", element: <TeamWorkspaceDirectoryPage /> },
      { path: "team-spaces/archived", element: <Navigate to="/team-spaces?status=archived" replace /> },
      {
        path: "team-spaces/new",
        element: <CreateTeamWorkspacePage />,
      },
      {
        path: "team-spaces/:workspaceId/members",
        element: <TeamWorkspaceMembersPage />,
      },
      {
        path: "workspace-invitations/:token/accept",
        element: <AcceptWorkspaceInvitationPage />,
      },
      {
        path: "workspace-invitations/:token",
        element: <AcceptWorkspaceInvitationPage />,
      },
      {
        path: "*",
        element: <Navigate to={defaultPath} replace />,
      },
    ],
  },
])
