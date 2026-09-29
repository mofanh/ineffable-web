import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowRight, Bot, Cable, GitBranch, Shield, User } from "lucide-react"
import { AppPage } from "@/components/app"
import { useAuthSession } from "@/features/auth/app-session"

export default function SettingsPage() {
  const { t } = useTranslation()
  const { currentUser } = useAuthSession()
  const groups = [
    { title: t("interaction.account"), items: [{ to: "/account", label: t("sidebar.account.accountDevices"), icon: User }] },
    { title: t("interaction.models"), items: [{ to: "/models", label: t("shell.routes.models"), icon: Bot }] },
    { title: t("interaction.connections"), items: [{ to: "/channels", label: t("channels.title"), icon: Cable }] },
    { title: t("interaction.advanced"), items: [{ to: "/agent-nodes", label: t("nodeManagement.title"), icon: GitBranch }] },
    ...(currentUser?.role === "admin" ? [{ title: t("shell.routes.systemManagement"), items: [
      { to: "/system/models", label: t("shell.routes.modelManagement"), icon: Shield },
      { to: "/system/plans", label: t("shell.routes.planManagement"), icon: Shield },
      { to: "/system/secrets", label: t("shell.routes.secretManagement"), icon: Shield },
      { to: "/system/users", label: t("shell.routes.userManagement"), icon: Shield },
    ] }] : []),
  ]
  return <AppPage title={t("interaction.settings")} description={t("interaction.settingsHint")}>
    <div className="max-w-3xl space-y-6">
      {groups.map(group => <section key={group.title} className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{group.title}</h2>
        <div className="divide-y rounded-xl border">{group.items.map(item => <Link key={item.to} to={item.to} className="flex min-h-12 items-center gap-3 rounded-lg px-4 py-3 text-sm hover:bg-accent focus-visible:outline focus-visible:outline-ring"><item.icon className="size-4 shrink-0" /><span className="min-w-0 flex-1">{item.label}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></Link>)}</div>
      </section>)}
    </div>
  </AppPage>
}
