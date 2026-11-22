import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Skeleton } from "@/components/ui/skeleton"
import { createDeferredModule } from "@/lib/app/deferred-module"

const chatModule = createDeferredModule(() => import("@/features/chat/gateway-chat-sidebar"))

type ChatWorkbenchProps = {
  navigationTarget: HTMLElement | null
  onReveal: () => void
}

const ignoreFullScreenChange = () => {}

// Keep the deferred runtime at one stable tree position for the entire auth session.
export const ChatWorkbench = memo(function ChatWorkbench(props: ChatWorkbenchProps) {
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
  return <GatewayChatSidebar {...props} workbench isFullScreen onFullScreenChange={ignoreFullScreenChange} />
})
