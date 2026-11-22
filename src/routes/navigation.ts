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

export const defaultPath = "/chat"

export type RouteKind = "conversation" | "global" | "resource" | "settings"

export type RouteMeta = {
  kind: RouteKind
  path: string
  title: string
  breadcrumbs: BreadcrumbEntry[]
}

type RouteMetaDefinition = {
  kind: RouteKind
  path: string
  titleKey: TranslationKey
  breadcrumbs: BreadcrumbDefinition[]
}

const routeMetaDefinitions: RouteMetaDefinition[] = [
  { path: "/chat", kind: "conversation", titleKey: "workbench.conversations", breadcrumbs: [{ labelKey: "workbench.conversations" }] },
  { path: "/settings", kind: "settings", titleKey: "interaction.settings", breadcrumbs: [{ labelKey: "interaction.settings" }] },
  { path: "/team-spaces", kind: "global", titleKey: "shell.breadcrumbs.teamSpaces", breadcrumbs: [{ labelKey: "shell.breadcrumbs.teamSpaces" }] },
  { path: "/channels", kind: "global", titleKey: "channels.title", breadcrumbs: [{ labelKey: "channels.title" }] },
  {
    path: "/models", kind: "global",
    titleKey: "shell.routes.models",
    breadcrumbs: [{ labelKey: "shell.routes.models" }],
  },
  {
    path: "/account", kind: "global",
    titleKey: "shell.routes.account",
    breadcrumbs: [{ labelKey: "shell.routes.account" }],
  },
  {
    path: "/admin/llm", kind: "global",
    titleKey: "shell.routes.modelManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.modelManagement" },
    ],
  },
  {
    path: "/system/models", kind: "global",
    titleKey: "shell.routes.modelManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.modelManagement" },
    ],
  },
  {
    path: "/system/plans", kind: "global",
    titleKey: "shell.routes.planManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.planManagement" },
    ],
  },
  {
    path: "/system/secrets", kind: "global",
    titleKey: "shell.routes.secretManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.secretManagement" },
    ],
  },
  {
    path: "/system/users", kind: "global",
    titleKey: "shell.routes.userManagement",
    breadcrumbs: [
      { labelKey: "shell.routes.systemManagement" },
      { labelKey: "shell.routes.userManagement" },
    ],
  },
  {
    path: "/automation", kind: "global",
    titleKey: "shell.routes.automation",
    breadcrumbs: [{ labelKey: "shell.routes.automation" }],
  },
  {
    path: "/agent-nodes", kind: "global",
    titleKey: "shell.routes.agentNodes",
    breadcrumbs: [{ labelKey: "shell.routes.agentNodes" }],
  },
]

const routeMetaMap = new Map(
  routeMetaDefinitions.map((definition) => [definition.path, definition])
)

function resolveRouteMeta(definition: RouteMetaDefinition): RouteMeta {
  return {
    kind: definition.kind,
    path: definition.path,
    title: i18n.t(definition.titleKey),
    breadcrumbs: [...(["/account", "/channels", "/models", "/agent-nodes"].includes(definition.path) || definition.path.startsWith("/system/") ? [{ labelKey: "interaction.settings", path: "/settings" }] : []), ...definition.breadcrumbs].map((breadcrumb) => ({
      label: i18n.t(breadcrumb.labelKey),
      path: breadcrumb.path,
    })),
  }
}

const workspaceResourcePath = /^\/workspace\/[^/]+\/objects(?:\/|$)/

export function getRouteMeta(pathname: string) {
  if (workspaceResourcePath.test(pathname)) {
    return {
      kind: "resource" as const,
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

// Unknown business/deep routes are global, never contextual merely because they are not chat.
export function getRouteKind(pathname: string): RouteKind {
  if (workspaceResourcePath.test(pathname)) return "resource"
  return routeMetaMap.get(pathname)?.kind ?? "global"
}
