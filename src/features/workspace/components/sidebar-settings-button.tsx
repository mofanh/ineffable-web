import { SettingsIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useSettingsOverlay } from "@/app/shell/settings-overlay-context"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"

// Keep presentation subscriptions out of the workspace tree owner.
export function SidebarSettingsButton() {
  const { t } = useTranslation()
  const { openSettings, isSettingsOpen } = useSettingsOverlay()
  const { isCompact, setOpenCompact } = useSidebar()
  return <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip={t("interaction.settings")} isActive={isSettingsOpen} onClick={event => {
    if (isCompact) {
      setOpenCompact(false)
      requestAnimationFrame(() => openSettings(document.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]') ?? undefined))
    } else openSettings(event.currentTarget)
  }}><SettingsIcon /><span>{t("interaction.settings")}</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
}
