import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Bot, RefreshCw, MessageSquare } from 'lucide-react'
import { cn } from '../utils/cn'
import type { Server, Service, Session, SSEEvent } from '../types'
import { createSession } from '../api/services'
import '../styles/markdown.css'

import type { ContentSegment, Message, ToolCall } from './chat/types'
import ChatHeader from './chat/ChatHeader'
import ChatMessageBubble from './chat/ChatMessageBubble'
import ChatComposer from './chat/ChatComposer'
import BackToBottomButton from './chat/BackToBottomButton'
import { useChatMessages } from '../hooks/useChatMessages'
import { useChatScrollFollow } from '../hooks/useChatScrollFollow'


interface Props {
  server: Server | null
  service: Service | null
  session: Session | null
  serviceUrl: string
  onSessionChange?: (session: Session) => void
  onSessionsRefresh?: () => void
}


export default function ChatPanel({ server, service, session, serviceUrl, onSessionChange, onSessionsRefresh }: Props) {
  const [input, setInput] = useState('')

  const { messages, setMessages, loading, sending, sendMessage, cancel } = useChatMessages({
    serviceUrl,
    session,
    onSessionsRefresh,
  })
  
  const { scrollContainerRef, isAtBottom, handleScroll, markAtBottomAndScroll } = useChatScrollFollow({
    resetDeps: [session?.id, loading],
    followDeps: [messages],
    thresholdPx: 80,
  })

  // 刷新会话列表（用于获取自动生成的标题）

  async function handleCreateSession() {
    if (!serviceUrl) return

    try {
      const newSession = await createSession(serviceUrl)
      setMessages([])
      onSessionChange?.(newSession)
    } catch (err) {
      alert(`创建会话失败: ${(err as Error).message}`)
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (sending) return
    if (!input.trim()) return
    const currentPrompt = input
    setInput('')
    void sendMessage(currentPrompt)
  }

  // 未选择服务或会话时的空状态
  if (!server || !service) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground bg-background">
        <div className="bg-muted/30 p-6 rounded-full mb-4">
          <MessageSquare className="size-12 opacity-50" />
        </div>
        <h2 className="text-lg font-medium text-foreground/70 mb-2">开始对话</h2>
        <p className="text-sm text-center max-w-xs">
          从左侧选择一个服务和会话，或创建新会话开始对话
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <RefreshCw className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <ChatHeader server={server} service={service} session={session} />

      {/* Chat Area */}
      <div className="relative flex-1 min-h-0">
        <main
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-full min-h-0 overflow-y-auto p-4 space-y-6"
        >
        {!session ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40">
            <div className="bg-muted/30 p-4 rounded-full mb-4">
              <Bot className="size-8" />
            </div>
            <p className="text-sm mb-4">请先创建一个会话</p>
            <button
              onClick={handleCreateSession}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-4" />
              创建会话
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40">
            <div className="bg-muted/30 p-4 rounded-full mb-4">
              <Bot className="size-8" />
            </div>
            <p className="text-sm">开始与 {service.name} 对话</p>
          </div>
        ) : (
          messages.map((msg) => <ChatMessageBubble key={msg.id} msg={msg} />)
        )}
        </main>

        {/* 未在底部时：悬浮“回到底部”按钮 */}
        {!isAtBottom && session && (
          <BackToBottomButton
            onClick={() => {
              markAtBottomAndScroll('smooth')
            }}
          />
        )}
      </div>

      {/* Input Area */}
      {session && (
        <ChatComposer input={input} setInput={setInput} sending={sending} onSubmit={handleSubmit} onCancel={cancel} />
      )}
    </div>
  )
}
