import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { SidebarFooter } from "@/components/ui/sidebar"
import { ArrowUpIcon } from "lucide-react"

type ChatComposerProps = {
  composer: string
  error: string | null
  isSending: boolean
  onComposerChange: (value: string) => void
  onComposerKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  onStop: () => void
}

export function ChatComposer({
  composer,
  error,
  isSending,
  onComposerChange,
  onComposerKeyDown,
  onSend,
  onStop,
}: ChatComposerProps) {
  return (
    <SidebarFooter className="p-3">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSend()
        }}
      >
        {error ? <p className="text-destructive text-xs">{error}</p> : null}

        <InputGroup className="h-auto overflow-hidden rounded-2xl border border-sidebar-border bg-background shadow-xs">
          <InputGroupTextarea
            aria-label="Chat message"
            placeholder="给 LLM 发送消息..."
            rows={4}
            value={composer}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            disabled={isSending}
            className="min-h-28 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <InputGroupAddon
            align="block-end"
            className="justify-between border-t border-sidebar-border bg-sidebar-accent/15"
          >
            <p className="text-muted-foreground text-[11px]">Cmd/Ctrl + Enter 发送</p>
            <div className="flex items-center gap-2">
              {isSending ? (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={onStop}
                >
                  停止
                </Button>
              ) : null}

              <InputGroupButton
                type="submit"
                size="icon-sm"
                className="rounded-full"
                disabled={!composer.trim() || isSending}
              >
                <ArrowUpIcon />
                <span className="sr-only">Send</span>
              </InputGroupButton>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </SidebarFooter>
  )
}
