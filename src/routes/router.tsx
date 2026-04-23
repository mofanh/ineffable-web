import { Navigate, createBrowserRouter } from "react-router-dom"

import App from "@/App"
import {
  RedirectIfAuthenticated,
  RequireAuth,
} from "@/contexts/app-session"
import { AuthLayout } from "@/layouts/auth-layout"
import { AccountPage } from "@/pages/account-pages"
import { LoginPage, RegisterPage } from "@/pages/auth-pages"
import {
  ApiDebugPage,
  CliChatPage,
  CliDirectPage,
  CollaborationOverviewPage,
  ConsoleWorldHomePage,
  RealtimeTasksPage,
  ResourceBoardPage,
} from "@/pages/console-pages"
import {
  DocsCenterPage,
  DocsChangelogPage,
  DocsGetStartedPage,
  DocsIntroductionPage,
  DocsTutorialsPage,
} from "@/pages/docs-pages"
import {
  ExplorerPage,
  GenesisPage,
  ModelCenterPage,
  QuantumPage,
} from "@/pages/model-pages"
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
import { defaultPath } from "@/routes/navigation"

const routeElements: Record<string, React.ReactElement> = {
  "/account": <AccountPage />,
  "/console/world": <ConsoleWorldHomePage />,
  "/console/world/collaboration": <CollaborationOverviewPage />,
  "/console/world/tasks": <RealtimeTasksPage />,
  "/console/world/resources": <ResourceBoardPage />,
  "/console/world/cli-direct": <CliDirectPage />,
  "/console/world/cli-chat": <CliChatPage />,
  "/console/world/api-debug": <ApiDebugPage />,
  "/models": <ModelCenterPage />,
  "/models/genesis": <GenesisPage />,
  "/models/explorer": <ExplorerPage />,
  "/models/quantum": <QuantumPage />,
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
        path: "*",
        element: <Navigate to={defaultPath} replace />,
      },
    ],
  },
])
