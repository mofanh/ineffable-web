import { BotIcon } from "lucide-react"
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

export const defaultPath = "/automation"

export const navigation = {
  main: [
    {
      title: "模型中心",
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

routeMetaMap.set("/docs", {
  path: "/docs",
  title: "产品文档",
  breadcrumbs: [{ label: "产品文档" }],
})

routeMetaMap.set("/support", {
  path: "/support",
  title: "帮助支持",
  breadcrumbs: [{ label: "帮助支持" }],
})

routeMetaMap.set("/feedback", {
  path: "/feedback",
  title: "提交反馈",
  breadcrumbs: [{ label: "提交反馈" }],
})

routeMetaMap.set("/admin/llm", {
  path: "/admin/llm",
  title: "模型管理",
  breadcrumbs: [{ label: "系统管理" }, { label: "模型管理" }],
})

routeMetaMap.set("/system/models", {
  path: "/system/models",
  title: "模型管理",
  breadcrumbs: [{ label: "系统管理" }, { label: "模型管理" }],
})

routeMetaMap.set("/system/plans", {
  path: "/system/plans",
  title: "套餐管理",
  breadcrumbs: [{ label: "系统管理" }, { label: "套餐管理" }],
})

routeMetaMap.set("/system/secrets", {
  path: "/system/secrets",
  title: "密钥管理",
  breadcrumbs: [{ label: "系统管理" }, { label: "密钥管理" }],
})

routeMetaMap.set("/system/users", {
  path: "/system/users",
  title: "用户管理",
  breadcrumbs: [{ label: "系统管理" }, { label: "用户管理" }],
})

routeMetaMap.set("/automation", {
  path: "/automation",
  title: "自动任务",
  breadcrumbs: [{ label: "自动任务" }],
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
      title: "工作区文件",
      breadcrumbs: [{ label: "工作区" }, { label: "文件" }],
    }
  }

  return routeMetaMap.get(pathname)
}
