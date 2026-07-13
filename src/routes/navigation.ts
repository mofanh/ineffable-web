import {
  BookOpenIcon,
  BotIcon,
  FrameIcon,
  LifeBuoyIcon,
  MapIcon,
  PieChartIcon,
  SendIcon,
  Settings2Icon,
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

export const defaultPath = "/automation"

export const navigation = {
  main: [
    {
      title: "模型中心",
      path: "/models",
      icon: BotIcon,
      items: [],
    },
    {
      title: "文档中心",
      path: "/docs",
      icon: BookOpenIcon,
      items: [
        { title: "产品介绍", path: "/docs/introduction" },
        { title: "快速开始", path: "/docs/get-started" },
        { title: "使用教程", path: "/docs/tutorials" },
        { title: "更新记录", path: "/docs/changelog" },
      ],
    },
    {
      title: "系统设置",
      path: "/settings",
      icon: Settings2Icon,
      items: [
        { title: "通用设置", path: "/settings/general" },
        { title: "团队设置", path: "/settings/team" },
        { title: "账单与套餐", path: "/settings/billing" },
        { title: "使用限制", path: "/settings/limits" },
      ],
    },
  ] as MainNavGroup[],
  projects: [
    {
      title: "设计工程",
      path: "/projects/design-engineering",
      icon: FrameIcon,
    },
    {
      title: "销售与市场",
      path: "/projects/sales-marketing",
      icon: PieChartIcon,
    },
    {
      title: "差旅",
      path: "/projects/travel",
      icon: MapIcon,
    },
  ] as SimpleNavItem[],
  secondary: [
    {
      title: "帮助支持",
      path: "/support",
      icon: LifeBuoyIcon,
    },
    {
      title: "提交反馈",
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
