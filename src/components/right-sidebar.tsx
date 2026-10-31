import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { Sidebar } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

const GatewayChatSidebar = lazy(async () => ({
  default: (await import("@/features/chat/gateway-chat-sidebar")).GatewayChatSidebar,
}))

type RightSidebarProps = {
  isFullScreen: boolean
  onFullScreenChange: (isFullScreen: boolean) => void
  mountChat: boolean
}

export function RightSidebar({
  isFullScreen,
  onFullScreenChange,
  mountChat,
}: RightSidebarProps) {
  const { t } = useTranslation()
  return (
    <Sidebar side="right" variant="inset" compactMode="full" className="p-0">
      {mountChat ? <Suspense fallback={
        <div role="status" aria-label={t("shell.assistant.loading")} className="space-y-4 p-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
          <span className="sr-only">{t("shell.assistant.loading")}...</span>
        </div>
      }>
        <GatewayChatSidebar isFullScreen={isFullScreen} onFullScreenChange={onFullScreenChange} />
      </Suspense> : null}
    </Sidebar>
  )
}
