import { GatewayChatSidebar } from "./right-sidebar/chat/gateway-chat-sidebar"
import { Sidebar } from "@/components/ui/sidebar"

export function RightSidebar() {
  return (
    <Sidebar side="right" variant="sidebar" mobileMode="full">
      <GatewayChatSidebar />
    </Sidebar>
  )
}
