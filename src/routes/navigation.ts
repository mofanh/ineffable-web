import {
  BookOpenIcon,
  BotIcon,
  FrameIcon,
  LifeBuoyIcon,
  MapIcon,
  PieChartIcon,
  SendIcon,
  Settings2Icon,
  TerminalSquareIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export type BreadcrumbEntry = {
  label: string
  path?: string
}

export type MainNavItem = {
  title: string
  path: string
}

export type MainNavGroup = {
  title: string
  path: string
  icon: LucideIcon
  items: MainNavItem[]
}

export type SimpleNavItem = {
  title: string
  path: string
  icon: LucideIcon
}

export const defaultPath = "/console/world/collaboration"

export const navigation = {
  main: [
    {
      title: "World 控制台",
      path: "/console/world",
      icon: TerminalSquareIcon,
      items: [
        { title: "协作总览", path: "/console/world/collaboration" },
        { title: "实时任务", path: "/console/world/tasks" },
        { title: "资源看板", path: "/console/world/resources" },
        { title: "CLI 直连", path: "/console/world/cli-direct" },
        { title: "CLI Chat", path: "/console/world/cli-chat" },
        { title: "接口调试", path: "/console/world/api-debug" },
      ],
    },
    {
      title: "模型中心",
      path: "/models",
      icon: BotIcon,
      items: [
        { title: "Genesis", path: "/models/genesis" },
        { title: "Explorer", path: "/models/explorer" },
        { title: "Quantum", path: "/models/quantum" },
      ],
    },
    {
      title: "文档中心",
      path: "/docs",
      icon: BookOpenIcon,
      items: [
        { title: "Introduction", path: "/docs/introduction" },
        { title: "Get Started", path: "/docs/get-started" },
        { title: "Tutorials", path: "/docs/tutorials" },
        { title: "Changelog", path: "/docs/changelog" },
      ],
    },
    {
      title: "系统设置",
      path: "/settings",
      icon: Settings2Icon,
      items: [
        { title: "General", path: "/settings/general" },
        { title: "Team", path: "/settings/team" },
        { title: "Billing", path: "/settings/billing" },
        { title: "Limits", path: "/settings/limits" },
      ],
    },
  ] as MainNavGroup[],
  projects: [
    {
      title: "Design Engineering",
      path: "/projects/design-engineering",
      icon: FrameIcon,
    },
    {
      title: "Sales & Marketing",
      path: "/projects/sales-marketing",
      icon: PieChartIcon,
    },
    {
      title: "Travel",
      path: "/projects/travel",
      icon: MapIcon,
    },
  ] as SimpleNavItem[],
  secondary: [
    {
      title: "Support",
      path: "/support",
      icon: LifeBuoyIcon,
    },
    {
      title: "Feedback",
      path: "/feedback",
      icon: SendIcon,
    },
  ] as SimpleNavItem[],
}

export type RouteMeta = {
  path: string
  title: string
  breadcrumbs: BreadcrumbEntry[]
}

const routeMetaMap = new Map<string, RouteMeta>()

navigation.main.forEach((group) => {
  routeMetaMap.set(group.path, {
    path: group.path,
    title: group.title,
    breadcrumbs: [{ label: group.title }],
  })

  group.items.forEach((item) => {
    routeMetaMap.set(item.path, {
      path: item.path,
      title: item.title,
      breadcrumbs: [
        { label: group.title, path: group.path },
        { label: item.title },
      ],
    })
  })
})

navigation.projects.forEach((item) => {
  routeMetaMap.set(item.path, {
    path: item.path,
    title: item.title,
    breadcrumbs: [{ label: "项目", path: "/projects" }, { label: item.title }],
  })
})

routeMetaMap.set("/projects", {
  path: "/projects",
  title: "项目",
  breadcrumbs: [{ label: "项目" }],
})

routeMetaMap.set("/account", {
  path: "/account",
  title: "账号",
  breadcrumbs: [{ label: "账号" }],
})

routeMetaMap.set("/ai-teammates", {
  path: "/ai-teammates",
  title: "AI Teammates",
  breadcrumbs: [{ label: "AI Teammates" }],
})

routeMetaMap.set("/agent-resources", {
  path: "/agent-resources",
  title: "Skills, Rules, Memory",
  breadcrumbs: [{ label: "Skills, Rules, Memory" }],
})

routeMetaMap.set("/automation", {
  path: "/automation",
  title: "Automation",
  breadcrumbs: [{ label: "Automation" }],
})

navigation.secondary.forEach((item) => {
  routeMetaMap.set(item.path, {
    path: item.path,
    title: item.title,
    breadcrumbs: [{ label: item.title }],
  })
})

export const allRouteMeta = Array.from(routeMetaMap.values())

export function getRouteMeta(pathname: string) {
  if (pathname.startsWith("/workspace/")) {
    return {
      path: pathname,
      title: "Workspace File",
      breadcrumbs: [{ label: "Workspace" }, { label: "File" }],
    }
  }

  if (pathname.startsWith("/ai-teammates/")) {
    return {
      path: pathname,
      title: "AI Teammate Detail",
      breadcrumbs: [
        { label: "AI Teammates", path: "/ai-teammates" },
        { label: "Detail" },
      ],
    }
  }

  return routeMetaMap.get(pathname)
}
