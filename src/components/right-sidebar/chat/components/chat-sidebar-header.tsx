import { Button } from "@/components/ui/button"
import { SidebarHeader } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { ChevronRightIcon, Link2Icon, PlusIcon } from "lucide-react"

type ChatSidebarHeaderProps = {
  isBound: boolean
  bindStatus: string
  onStartNewChat: () => void
  onCollapseSidebar: () => void
}

export function ChatSidebarHeader({
  isBound,
  bindStatus,
  onStartNewChat,
  onCollapseSidebar,
}: ChatSidebarHeaderProps) {
  return (
    <SidebarHeader className="p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onStartNewChat}
            aria-label="Start new chat"
            title="新对话"
          >
            <PlusIcon />
          </Button>

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={bindStatus}
            title={bindStatus}
            className={cn(
              "pointer-events-none",
              isBound ? "text-emerald-600" : "text-foreground/45"
            )}
          >
            <Link2Icon />
          </Button>
        </div>

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          onClick={onCollapseSidebar}
          aria-label="Collapse right sidebar"
          title="收起右侧栏"
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </SidebarHeader>
  )
}
