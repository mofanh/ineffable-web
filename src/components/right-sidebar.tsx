import { GatewayChatSidebar } from "@/features/chat/gateway-chat-sidebar"
import { Sidebar } from "@/components/ui/sidebar"

type RightSidebarProps = {
  isFullScreen: boolean
  onFullScreenChange: (isFullScreen: boolean) => void
}

export function RightSidebar({
  isFullScreen,
  onFullScreenChange,
}: RightSidebarProps) {
  return (
    <Sidebar side="right" variant="inset" compactMode="full" className="p-0">
      <GatewayChatSidebar
        isFullScreen={isFullScreen}
        onFullScreenChange={onFullScreenChange}
      />
    </Sidebar>
  )
}
