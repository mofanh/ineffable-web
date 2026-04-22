"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { defaultPath, navigation } from "@/routes/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Link, useLocation } from "react-router-dom"
import { IneffableLogo } from "@/components/ineffable-logo"
import { getLogoName, useLogoVariant } from "@/hooks/use-logo"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation()
  const logoVariant = useLogoVariant({ mode: "rotate" })

  const navMain = navigation.main.map((group) => ({
    title: group.title,
    url: group.path,
    icon: <group.icon />,
    isActive:
      pathname === group.path || group.items.some((item) => item.path === pathname),
    items: group.items.map((item) => ({
      title: item.title,
      url: item.path,
    })),
  }))

  const projects = navigation.projects.map((item) => ({
    name: item.title,
    url: item.path,
    icon: <item.icon />,
  }))

  const navSecondary = navigation.secondary.map((item) => ({
    title: item.title,
    url: item.path,
    icon: <item.icon />,
  }))

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={`Ineffable · ${getLogoName(logoVariant)}`}
            >
              <Link to={defaultPath} className="flex w-full justify-center">
                <IneffableLogo variant={logoVariant} className="h-8 max-w-[132px] w-auto" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavProjects projects={projects} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{
          name: "shadcn",
          email: "m@example.com",
          avatar: "/avatars/shadcn.jpg",
        }} />
      </SidebarFooter>
    </Sidebar>
  )
}
