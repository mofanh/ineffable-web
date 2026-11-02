import { useTranslation } from "react-i18next"
import { Sidebar } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { createDeferredModule } from "@/lib/app/deferred-module"

const chatModule = createDeferredModule(() => import("@/features/chat/gateway-chat-sidebar"))

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
  return (
    <Sidebar side="right" variant="inset" compactMode="full" className="p-0">
      {mountChat ? <ChatContent isFullScreen={isFullScreen} onFullScreenChange={onFullScreenChange} /> : null}
    </Sidebar>
  )
}

function ChatContent(props: Omit<RightSidebarProps, "mountChat">) {
  const { t } = useTranslation()
  const module = chatModule.useModule()
  if (!module) {
    return (
      <div role="status" aria-label={t("shell.assistant.loading")} className="space-y-4 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <span className="sr-only">{t("shell.assistant.loading")}...</span>
      </div>
    )
  }
  const GatewayChatSidebar = module.GatewayChatSidebar
  return <GatewayChatSidebar {...props} />
}
