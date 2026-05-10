"use client"

import { Button } from "@/components/ui/button"
import { XIcon, ZapIcon } from "lucide-react"

export type PreInputItem = {
  id: string
  content: string
}

type PreInputQueueProps = {
  items: PreInputItem[]
  onPromote: (item: PreInputItem) => void
  onDelete: (item: PreInputItem) => void
}

export function PreInputQueue({ items, onPromote, onDelete }: PreInputQueueProps) {
  if (!items.length) {
    return null
  }

  return (
    <div className="px-3 pb-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        预输入队列 · {items.length} 条
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/10 px-3 py-2 group"
          >
            <p className="flex-1 text-xs text-foreground/80 line-clamp-2 break-all leading-snug">
              {item.content}
            </p>
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                title="提升为引导输入（立即注入当前对话）"
                onClick={() => onPromote(item)}
              >
                <ZapIcon className="w-3 h-3 mr-0.5" />
                引导
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                title="从队列中移除"
                onClick={() => onDelete(item)}
              >
                <XIcon className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
