import { BotIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { i18n } from "@/lib/i18n/i18n"

type TranslationKey = string

export type BreadcrumbEntry = {
  label: string
  path?: string
}

type BreadcrumbDefinition = {
  labelKey: TranslationKey
  path?: string
}

export type MainNavItem = {
  titleKey: TranslationKey
  path: string
}

export type MainNavGroup = {
  titleKey: TranslationKey
  path: string
  icon: LucideIcon
  items: MainNavItem[]
}

export type SimpleNavItem = {
  titleKey: TranslationKey
  path: string
  icon: LucideIcon
}

export const defaultPath = "/automation"

export const navigation = {
  main: [
    {
      titleKey: "shell.routes.models",
      path: "/models",
      icon: BotIcon,
      items: [],
    },
  ] as MainNavGroup[],
  projects: [] as SimpleNavItem[],
  secondary: [] as SimpleNavItem[],
}

export type RouteMeta = {
  path: string
  title: string
  breadcrumbs: BreadcrumbEntry[]
}

type RouteMetaDefinition = {
  path: string
  titleKey: TranslationKey
  breadcrumbs: BreadcrumbDefinition[]
}

const routeMetaDefinitions: RouteMetaDefinition[] = [
  {
    path: "/models",
    titleKey: "shell.routes.models",
    breadcrumbs: [{ labelKey: "shell.routes.models" }],
  },
  {
    path: "/projects",
    titleKey: "shell.routes.projects",
    breadcrumbs: [{ labelKey: "shell.routes.projects" }],
  },
  {
    path: "/account",
    titleKey: "shell.routes.account",
    breadcrumbs: [{ labelKey: "shell.routes.account" }],
  },
  {
    path: "/docs",
    titleKey: "shell.routes.docs",
    breadcrumbs: [{ labelKey: "shell.routes.docs" }],
  },
  {
    path: "/support",
    titleKey: "shell.routes.support",
    breadcrumbs: [{ labelKey: "shell.routes.support" }],
  },
  {
    path: "/feedback",
    titleKey: "shell.routes.feedback",
    breadcrumbs: [{ labelKey: "shell.routes.feedback" }],
  },
  {
    path: "/admin/llm",
    titleKey: "shell.routes.modelManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.modelManagement" },
    ],
  },
  {
    path: "/system/models",
    titleKey: "shell.routes.modelManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.modelManagement" },
    ],
  },
  {
    path: "/system/plans",
    titleKey: "shell.routes.planManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.planManagement" },
    ],
  },
  {
    path: "/system/secrets",
    titleKey: "shell.routes.secretManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.secretManagement" },
    ],
  },
  {
    path: "/system/users",
    titleKey: "shell.routes.userManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.userManagement" },
    ],
  },
  {
    path: "/automation",
    titleKey: "shell.routes.automation",
    breadcrumbs: [{ labelKey: "shell.routes.automation" }],
  },
  {
    path: "/agent-nodes",
    titleKey: "shell.routes.agentNodes",
    breadcrumbs: [{ labelKey: "shell.routes.agentNodes" }],
  },
]

const routeMetaMap = new Map(
  routeMetaDefinitions.map((definition) => [definition.path, definition])
)

function resolveRouteMeta(definition: RouteMetaDefinition): RouteMeta {
  return {
    path: definition.path,
    title: i18n.t(definition.titleKey),
    breadcrumbs: definition.breadcrumbs.map((breadcrumb) => ({
      label: i18n.t(breadcrumb.labelKey),
      path: breadcrumb.path,
    })),
  }
}

export const allRouteMeta = routeMetaDefinitions.map(resolveRouteMeta)

export function getRouteMeta(pathname: string) {
  if (pathname.startsWith("/workspace/")) {
    return {
      path: pathname,
      title: i18n.t("shell.routes.workspaceFiles"),
      breadcrumbs: [
        { label: i18n.t("shell.routes.workspace") },
        { label: i18n.t("shell.routes.files") },
      ],
    }
  }

  const definition = routeMetaMap.get(pathname)
  return definition ? resolveRouteMeta(definition) : undefined
}
