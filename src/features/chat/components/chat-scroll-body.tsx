import * as React from "react"
import { ArrowDownIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useChatScrollBoundary, type ChatScrollDirection } from "./chat-scroll-boundary"
import "./chat-scroll-body.css"

/** One scroll seat for the transcript and composer. Reading/following and history
 * remain commands of the existing conversation owner, not a second scroll model. */
export function ChatScrollBody({ children, composer, empty, scrollViewportRef,
  onViewportScroll, onViewportScrollIntent, hasOlderEntries, isLoadingOlderEntries,
  olderEntriesError, onLoadOlderConversationMessagesPage, showScrollToBottom,
  onScrollToBottomClick, onStreamingContentProgress,
}: {
  children: React.ReactNode
  composer: React.ReactNode
  empty: boolean
  scrollViewportRef: React.RefObject<HTMLDivElement | null>
  onViewportScroll: () => boolean | void
  onViewportScrollIntent: (direction: ChatScrollDirection) => void
  hasOlderEntries: boolean
  isLoadingOlderEntries: boolean
  olderEntriesError: string | null
  onLoadOlderConversationMessagesPage: () => void
  showScrollToBottom: boolean
  onScrollToBottomClick: () => void
  onStreamingContentProgress: () => void
}) {
  const { t } = useTranslation()
  const boundaryRef = useChatScrollBoundary(scrollViewportRef, onViewportScrollIntent)
  const seatRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const seat = seatRef.current
    if (!seat) return
    const observer = new ResizeObserver(onStreamingContentProgress)
    observer.observe(seat)
    return () => observer.disconnect()
  }, [onStreamingContentProgress])
  return <div ref={boundaryRef} data-chat-scroll-region data-empty={empty} className="chat-scroll-body"
    onScroll={event => {
      const following = onViewportScroll() === true
      if (!following && hasOlderEntries && !isLoadingOlderEntries && !olderEntriesError && event.currentTarget.scrollTop < 96) {
        onLoadOlderConversationMessagesPage()
      }
    }}>
    <div data-chat-reading-message className="chat-reading-message">{children}</div>
    <div ref={seatRef} data-chat-composer-seat className="chat-composer-seat">
      {showScrollToBottom && <div className="chat-scroll-latest">
        <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="outline"
          aria-label={t("chat.messages.latest")} onClick={onScrollToBottomClick}
          className="pointer-events-auto rounded-full bg-background text-muted-foreground shadow-sm hover:text-foreground">
          <ArrowDownIcon aria-hidden="true" />
        </Button></TooltipTrigger><TooltipContent side="top" sideOffset={8}>{t("chat.messages.latest")}</TooltipContent></Tooltip>
      </div>}
      <div className="chat-reading-composer">{composer}</div>
    </div>
  </div>
}
