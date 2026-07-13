import { Navigate, createBrowserRouter } from "react-router-dom"

import App from "@/App"
import {
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
} from "@/features/auth/app-session"
import { AuthLayout } from "@/layouts/auth-layout"
import { AccountPage } from "@/pages/account-pages"
import {
  AdminLlmSettingsPage,
  SystemModelManagementPage,
} from "@/pages/system-management/models-page"
import { SystemPlanManagementPage } from "@/pages/system-management/plans-page"
import { SystemSecretManagementPage } from "@/pages/system-management/secrets-page"
import { SystemUserManagementPage } from "@/pages/system-management/users-page"
import { AutomationPage } from "@/pages/agent-products/automation-page"
import { LoginPage, RegisterPage } from "@/pages/auth-pages"
import {
  DocsCenterPage,
  DocsChangelogPage,
  DocsGetStartedPage,
  DocsIntroductionPage,
  DocsTutorialsPage,
} from "@/pages/docs-pages"
import { ModelCenterPage } from "@/pages/model-pages"
import {
  DesignEngineeringPage,
  ProjectsHomePage,
  SalesMarketingPage,
  TravelProjectPage,
} from "@/pages/project-pages"
import {
  SettingsBillingPage,
  SettingsCenterPage,
  SettingsGeneralPage,
  SettingsLimitsPage,
  SettingsTeamPage,
} from "@/pages/settings-pages"
import { FeedbackPage, SupportPage } from "@/pages/support-pages"
import {
  AcceptWorkspaceInvitationPage,
  CreateTeamWorkspacePage,
  TeamWorkspaceMembersPage,
  WorkspaceNotificationsPage,
} from "@/pages/team-workspace-pages"
import { WorkspaceObjectEditorPage } from "@/pages/workspace-object-editor-page"
import { defaultPath } from "@/routes/navigation"

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
  "/docs/introduction": <DocsIntroductionPage />,
  "/docs/get-started": <DocsGetStartedPage />,
  "/docs/tutorials": <DocsTutorialsPage />,
  "/docs/changelog": <DocsChangelogPage />,
  "/settings": <SettingsCenterPage />,
  "/settings/general": <SettingsGeneralPage />,
  "/settings/team": <SettingsTeamPage />,
  "/settings/billing": <SettingsBillingPage />,
  "/settings/limits": <SettingsLimitsPage />,
  "/projects": <ProjectsHomePage />,
  "/projects/design-engineering": <DesignEngineeringPage />,
  "/projects/sales-marketing": <SalesMarketingPage />,
  "/projects/travel": <TravelProjectPage />,
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
    path: "/",
    element: (
      <RequireAuth>
        <App />
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
