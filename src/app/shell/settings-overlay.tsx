import { useId } from "react"
import { Dialog } from "radix-ui"
import { ArrowUpRightIcon, BotIcon, CableIcon, GitBranchIcon, SettingsIcon, ShieldIcon, UserIcon, XIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuthSession } from "@/features/auth/app-session"
import { normalizeLanguage } from "@/lib/i18n/i18n"
import "./settings-overlay.css"

export function SettingsOverlay({ open, onClose, onCloseAutoFocus }: {
  open: boolean
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const { t, i18n } = useTranslation()
  const { currentUser } = useAuthSession()
  const { pathname } = useLocation()
  const { theme, setTheme } = useTheme()
  const themeId = useId(), languageId = useId()
  const links = [
    { to: "/account", label: t("sidebar.account.accountDevices"), icon: UserIcon },
    { to: "/models", label: t("shell.routes.models"), icon: BotIcon },
    { to: "/channels", label: t("channels.title"), icon: CableIcon },
    { to: "/agent-nodes", label: t("nodeManagement.title"), icon: GitBranchIcon },
    ...(currentUser?.role === "admin" ? [
      { to: "/system/models", label: t("shell.routes.modelManagement"), icon: ShieldIcon },
      { to: "/system/plans", label: t("shell.routes.planManagement"), icon: ShieldIcon },
      { to: "/system/secrets", label: t("shell.routes.secretManagement"), icon: ShieldIcon },
      { to: "/system/users", label: t("shell.routes.userManagement"), icon: ShieldIcon },
    ] : []),
  ]
  return <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="settings-overlay-mask" />
      <Dialog.Content data-slot="settings-overlay" className="settings-overlay-panel" aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
        <Dialog.Title className="settings-overlay-title">{t("interaction.settings")}</Dialog.Title>
        <header className="settings-overlay-header">
          <Dialog.Close asChild><Button variant="ghost" size="icon-sm" aria-label={t("common.close")}><XIcon /></Button></Dialog.Close>
        </header>
        <nav aria-label={t("interaction.settings")} className="settings-overlay-nav">
          <button type="button" aria-current="page" className="settings-overlay-cell bg-accent"><SettingsIcon /><span>{t("interaction.general")}</span></button>
          {links.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className="settings-overlay-cell" onClick={() => { if (pathname === to) onClose() }}>
            <Icon /><span>{label}</span><ArrowUpRightIcon className="ml-auto text-muted-foreground" />
          </Link>)}
        </nav>
        <section aria-label={t("interaction.general")} className="settings-overlay-options">
          <h2 className="mb-4 text-base font-medium">{t("interaction.general")}</h2>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b py-4">
            <label htmlFor={themeId} className="text-sm">{t("theme.appearance")}</label>
            <Select value={theme ?? "system"} onValueChange={setTheme}>
              <SelectTrigger id={themeId} className="min-w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{["light", "dark", "system"].map(value => <SelectItem key={value} value={value}>{t(`theme.${value}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b py-4">
            <label htmlFor={languageId} className="text-sm">{t("language.label")}</label>
            <Select value={normalizeLanguage(i18n.resolvedLanguage || i18n.language)} onValueChange={value => void i18n.changeLanguage(value)}>
              <SelectTrigger id={languageId} className="min-w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="zh-CN">{t("language.chinese")}</SelectItem><SelectItem value="en-US">{t("language.english")}</SelectItem></SelectContent>
            </Select>
          </div>
        </section>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
