import { GatewayChatSidebar } from "@/features/chat/gateway-chat-sidebar"
import { Sidebar } from "@/components/ui/sidebar"

export function RightSidebar() {
  return (
    <Sidebar side="right" variant="inset" mobileMode="full">
      <GatewayChatSidebar />
    </Sidebar>
  )
}
