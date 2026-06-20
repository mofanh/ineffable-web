import { GatewayChatSidebar } from "@/features/chat/gateway-chat-sidebar"
import { Sidebar } from "@/components/ui/sidebar"

export function RightSidebar() {
  return (
    <Sidebar side="right" variant="inset" mobileMode="full" className="p-0">
      <GatewayChatSidebar />
    </Sidebar>
  )
}
