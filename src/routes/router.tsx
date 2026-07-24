import { Suspense, lazy } from "react"
import { Navigate, createBrowserRouter } from "react-router-dom"

import { FullPageLoading } from "@/components/app/route-loading"
import {
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
} from "@/features/auth/app-session"
import { AuthLayout } from "@/layouts/auth-layout"
import { defaultPath } from "@/routes/navigation"
import {
  loadSystemModelsModule,
  loadSystemPlansModule,
  loadSystemSecretsModule,
  loadSystemUsersModule,
} from "@/routes/route-modules"

const App = lazy(() => import("@/App"))
const AccountPage = lazy(async () => ({
  default: (await import("@/pages/account-pages")).AccountPage,
}))
const AutomationPage = lazy(async () => ({
  default: (await import("@/pages/agent-products/automation-page")).AutomationPage,
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
const DocsCenterPage = lazy(async () => ({
  default: (await import("@/pages/docs-pages")).DocsCenterPage,
}))
const ModelCenterPage = lazy(async () => ({
  default: (await import("@/pages/model-pages")).ModelCenterPage,
}))
const ProjectsHomePage = lazy(async () => ({
  default: (await import("@/pages/project-pages")).ProjectsHomePage,
}))
const FeedbackPage = lazy(async () => ({
  default: (await import("@/pages/support-pages")).FeedbackPage,
}))
const SupportPage = lazy(async () => ({
  default: (await import("@/pages/support-pages")).SupportPage,
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
  default: (await loadSystemModelsModule()).SystemModelManagementPage,
}))
const SystemPlanManagementPage = lazy(async () => ({
  default: (await loadSystemPlansModule()).SystemPlanManagementPage,
}))
const SystemSecretManagementPage = lazy(async () => ({
  default: (await loadSystemSecretsModule()).SystemSecretManagementPage,
}))
const SystemUserManagementPage = lazy(async () => ({
  default: (await loadSystemUsersModule()).SystemUserManagementPage,
}))

const routeElements: Record<string, React.ReactElement> = {
  "/account": <AccountPage />,
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
  "/models": <ModelCenterPage />,
  "/models/genesis": <Navigate to="/models" replace />,
  "/models/explorer": <Navigate to="/models" replace />,
  "/models/quantum": <Navigate to="/models" replace />,
  "/notifications": <WorkspaceNotificationsPage />,
  "/docs": <DocsCenterPage />,
  "/docs/introduction": <Navigate to="/docs" replace />,
  "/docs/get-started": <Navigate to="/docs" replace />,
  "/docs/tutorials": <Navigate to="/docs" replace />,
  "/docs/changelog": <Navigate to="/docs" replace />,
  "/settings": <Navigate to="/account" replace />,
  "/settings/general": <Navigate to="/account" replace />,
  "/settings/team": <Navigate to="/account" replace />,
  "/settings/billing": <Navigate to="/account" replace />,
  "/settings/limits": <Navigate to="/account" replace />,
  "/projects": <ProjectsHomePage />,
  "/projects/design-engineering": <Navigate to="/projects" replace />,
  "/projects/sales-marketing": <Navigate to="/projects" replace />,
  "/projects/travel": <Navigate to="/projects" replace />,
  "/support": <SupportPage />,
  "/feedback": <FeedbackPage />,
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <RedirectIfAuthenticated>
        <AuthLayout />
      </RedirectIfAuthenticated>
    ),
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
    element: (
      <RequireAuth>
        <Suspense fallback={<FullPageLoading />}>
          <App />
        </Suspense>
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
        path: "workspace/:workspaceId/objects/:objectId",
        element: <WorkspaceObjectEditorPage />,
      },
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
