"use client"

import * as React from "react"

import { NavSecondary } from "@/components/nav-secondary"
import { defaultPath, navigation } from "@/routes/navigation"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { Link } from "react-router-dom"
import { IneffableLogo } from "@/components/ineffable-logo"
import { useAppSession } from "@/contexts/app-session"
import { getLogoName, useLogoVariant } from "@/hooks/use-logo"
import {
  BadgeCheckIcon,
  BellIcon,
  BotIcon,
  BrainIcon,
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CreditCardIcon,
  FileCodeIcon,
  FileTextIcon,
  LogOutIcon,
  PackageIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react"

type SidebarEntry = {
  id: string
  title: string
  kind: "folder" | "markdown" | "html"
  depth?: number
  expanded?: boolean
  accent?: "team" | "file" | "html"
}

const primaryNavItems = [
  { id: "ai-teammates", title: "AI Teammates", icon: BotIcon },
  { id: "automation", title: "Automation", icon: ZapIcon },
  { id: "skills-rules-memory", title: "Skills, Rules, Memory", icon: BrainIcon },
]

const teamSpaceEntries: SidebarEntry[] = [
  { id: "team-root", title: "team", kind: "folder", accent: "team" },
  { id: "team-system", title: "System", kind: "folder", depth: 1, expanded: true },
  { id: "team-skills", title: "Skills", kind: "folder", depth: 2 },
  { id: "team-agents", title: "AGENTS.md", kind: "markdown", depth: 1 },
]

const personalSpaceEntries: SidebarEntry[] = [
  { id: "personal-help", title: "帮助文档", kind: "folder" },
  { id: "personal-drafts", title: "drafts", kind: "folder" },
  { id: "personal-system", title: "System", kind: "folder" },
  {
    id: "personal-douyin",
    title: "抖音猫咪知识视频-配音方案调...",
    kind: "markdown",
  },
  { id: "personal-quick-html", title: "快速开始.html", kind: "html" },
  { id: "personal-quick-md", title: "快速开始.md", kind: "markdown" },
  { id: "personal-agents", title: "AGENTS.md", kind: "markdown" },
]

function EntryIcon({ item }: { item: SidebarEntry }) {
  if (item.accent === "team") {
    return (
      <span className="flex size-5 items-center justify-center rounded-md bg-indigo-500 text-xs font-medium text-white">
        T
      </span>
    )
  }

  if (item.kind === "folder") {
    return item.expanded ? (
      <ChevronDownIcon className="text-sidebar-foreground/60" />
    ) : (
      <ChevronRightIcon className="text-sidebar-foreground/60" />
    )
  }

  if (item.kind === "html") {
    return <FileCodeIcon className="text-orange-500" />
  }

  return <FileTextIcon className="text-sky-500" />
}

function SidebarEntryButton({
  item,
  selectedEntryId,
  onSelectEntry,
}: {
  item: SidebarEntry
  selectedEntryId: string
  onSelectEntry: (entryId: string) => void
}) {
  const depthClass =
    item.depth === 2 ? "pl-12" : item.depth === 1 ? "pl-7" : undefined

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={selectedEntryId === item.id}
        tooltip={item.title}
        className={depthClass}
        onClick={() => onSelectEntry(item.id)}
      >
        <EntryIcon item={item} />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function PrimaryNav({
  selectedEntryId,
  onSelectEntry,
}: {
  selectedEntryId: string
  onSelectEntry: (entryId: string) => void
}) {
  return (
    <SidebarGroup className="pt-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {primaryNavItems.map((item) => {
            const Icon = item.icon

            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  type="button"
                  size="lg"
                  isActive={selectedEntryId === item.id}
                  tooltip={item.title}
                  onClick={() => onSelectEntry(item.id)}
                >
                  <Icon className="text-sidebar-foreground/70" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SpaceSection({
  title,
  entries,
  selectedEntryId,
  onSelectEntry,
}: {
  title: string
  entries: SidebarEntry[]
  selectedEntryId: string
  onSelectEntry: (entryId: string) => void
}) {
  return (
    <SidebarGroup className="gap-2">
      <SidebarGroupLabel className="h-auto px-2 py-1 text-sm font-normal tracking-[0.12em] text-sidebar-foreground/50">
        {title}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {entries.map((item) => (
            <SidebarEntryButton
              key={item.id}
              item={item}
              selectedEntryId={selectedEntryId}
              onSelectEntry={onSelectEntry}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function WorkspaceMenuItem({
  title,
  description,
  active,
}: {
  title: string
  description?: string
  active?: boolean
}) {
  return (
    <DropdownMenuItem className="items-start gap-2 py-2">
      <Building2Icon className="mt-0.5 text-muted-foreground" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate font-medium">{title}</span>
        {description ? (
          <span className="truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </div>
      {active ? <CheckIcon className="mt-0.5 text-muted-foreground" /> : null}
    </DropdownMenuItem>
  )
}

function WorkspaceAccountSwitcher({
  user,
  onLogout,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onLogout?: () => void
}) {
  const { isMobile } = useSidebar()
  const fallback = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-8 w-8 rounded-lg">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs">{user.email}</span>
          </div>
          <ChevronDownIcon className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 min-w-64"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Current Workspace</DropdownMenuLabel>
        <WorkspaceMenuItem
          title="team"
          description="Team workspace · 6 members"
          active
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 pb-0 pt-1 text-[11px] uppercase tracking-normal">
            Personal
          </DropdownMenuLabel>
          <WorkspaceMenuItem
            title="lier's Workspace"
            description="Private workspace"
          />
          <DropdownMenuLabel className="px-2 pb-0 pt-1 text-[11px] uppercase tracking-normal">
            Team
          </DropdownMenuLabel>
          <WorkspaceMenuItem
            title="team"
            description="Team workspace · 6 members"
            active
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <PlusIcon />
          <span>Create Workspace</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <PackageIcon />
          <span>Integrations</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <SettingsIcon />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <SparklesIcon />
            <span>Upgrade to Pro</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/account">
              <BadgeCheckIcon />
              <span>Account</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings/billing">
              <CreditCardIcon />
              <span>Billing</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings/general">
              <BellIcon />
              <span>Notifications</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="p-0">
          <ThemeToggle />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/login"
            onClick={(event) => {
              if (!onLogout) {
                return
              }

              event.preventDefault()
              onLogout()
            }}
          >
            <LogOutIcon />
            <span>Sign out</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const logoVariant = useLogoVariant({ mode: "rotate" })
  const { currentUser, logout } = useAppSession()
  const [selectedEntryId, setSelectedEntryId] = React.useState("skills-rules-memory")

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
      <SidebarContent className="px-0">
        <PrimaryNav
          selectedEntryId={selectedEntryId}
          onSelectEntry={setSelectedEntryId}
        />
        <SidebarSeparator />
        <SpaceSection
          title="Team Spaces"
          entries={teamSpaceEntries}
          selectedEntryId={selectedEntryId}
          onSelectEntry={setSelectedEntryId}
        />
        <SpaceSection
          title="Personal Space"
          entries={personalSpaceEntries}
          selectedEntryId={selectedEntryId}
          onSelectEntry={setSelectedEntryId}
        />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <SidebarSeparator className="mx-0" />
        <SidebarMenu>
          <SidebarMenuItem>
            <WorkspaceAccountSwitcher
              user={{
                name: currentUser?.display_name || currentUser?.email || "Workspace User",
                email: currentUser?.email || "未登录",
                avatar: currentUser?.avatar_url || "",
              }}
              onLogout={() => {
                void logout()
              }}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
