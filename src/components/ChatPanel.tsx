import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Bot, RefreshCw, MessageSquare } from 'lucide-react'
import { cn } from '../utils/cn'
import type { Server, Service, Session, SSEEvent } from '../types'
import { getSessionDetail, createSession, executeStream, cancelTask, listSessions } from '../api/services'
import '../styles/markdown.css'

import type { ContentSegment, Message, ToolCall } from './chat/types'
import {
  attachToolOutputToAssistantMsg,
  normalizeRole,
  parseMessageContent,
  parseToolMemoryMessage,
  appendToolResultAsSegment,
} from './chat/messageParsing'
import ChatHeader from './chat/ChatHeader'
import ChatMessageBubble from './chat/ChatMessageBubble'
import ChatComposer from './chat/ChatComposer'
import BackToBottomButton from './chat/BackToBottomButton'


interface Props {
  server: Server | null
  service: Service | null
  session: Session | null
  serviceUrl: string
  onSessionChange?: (session: Session) => void
  onSessionsRefresh?: () => void
}


export default function ChatPanel({ server, service, session, serviceUrl, onSessionChange, onSessionsRefresh }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const isAtBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const updateIsAtBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const thresholdPx = 80
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const nextAtBottom = distance <= thresholdPx
    if (nextAtBottom !== isAtBottomRef.current) {
      isAtBottomRef.current = nextAtBottom
      setIsAtBottom(nextAtBottom)
    }
  }, [])

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current)
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      updateIsAtBottom()
    })
  }, [updateIsAtBottom])

  // 主动初始化一次（例如加载历史后 / 首次渲染）
  useEffect(() => {
    updateIsAtBottom()
  }, [session?.id, loading, updateIsAtBottom])

  // 当 session 改变时加载历史消息
  useEffect(() => {
    if (!session || !serviceUrl) {
      setMessages([])
      return
    }

    async function loadMessages() {
      setLoading(true)
      try {
        const detail = await getSessionDetail(serviceUrl, session!.id)

        const historicalMessages: Message[] = []
        const baseNow = Date.now()
        let outIdx = 0

        // 关键：把连续的 assistant/tool/assistant... 合并成一个 assistant 气泡。
        // 目标：两条 user 消息之间，UI 只出现一条 assistant（内部用 segments 展示 tool 块）。
        for (let i = 0; i < detail.messages.length; i++) {
          const m = detail.messages[i]
          const role = normalizeRole(m.role)

          if (role === 'user' || role === 'system') {
            historicalMessages.push({
              id: `hist-${outIdx}`,
              role,
              content: m.content,
              timestamp: m.timestamp || baseNow + outIdx,
              status: 'completed' as const,
              segments: [{ type: 'text', content: m.content }],
              pendingToolCalls: new Map(),
            })
            outIdx++
            continue
          }

          // 极端：tool 出现在任何 assistant 前，兜底为一条 assistant。
          if (role === 'tool') {
            const { name, output } = parseToolMemoryMessage(m.content)
            historicalMessages.push({
              id: `hist-${outIdx}`,
              role: 'assistant',
              content: '',
              timestamp: m.timestamp || baseNow + outIdx,
              status: 'completed' as const,
              segments: [
                {
                  type: 'tool',
                  tool: {
                    id: `hist-tool-${outIdx}-0`,
                    name,
                    status: 'done',
                    output,
                  },
                },
              ],
              pendingToolCalls: new Map(),
            })
            outIdx++
            continue
          }

          // assistant：创建一个气泡，并把后续连续的 tool/assistant 都合并进来
          const merged: Message = {
            id: `hist-${outIdx}`,
            role: 'assistant',
            content: m.content,
            timestamp: m.timestamp || baseNow + outIdx,
            status: 'completed' as const,
            segments: parseMessageContent(m.content),
            pendingToolCalls: new Map(),
          }

          // 向后合并，直到遇到 user/system（下一轮对话）
          while (i + 1 < detail.messages.length) {
            const next = detail.messages[i + 1]
            const nextRole = normalizeRole(next.role)
            if (nextRole === 'user' || nextRole === 'system') break

            i++
            if (nextRole === 'tool') {
              const { name, output } = parseToolMemoryMessage(next.content)
              const attached = attachToolOutputToAssistantMsg(merged, name, output)
              if (!attached) {
                // 没有解析到对应 tool_call（比如 tool_call 标签缺失/异常），也不要拆成新气泡：直接作为一个 tool 段插入
                appendToolResultAsSegment(merged, name, output, merged.id)
              }
            } else {
              // assistant：把它的文本/工具段继续追加到同一个气泡
              merged.content += `\n\n${next.content}`
              const segs = parseMessageContent(next.content)
              // 避免 parseMessageContent 返回单个“原样文本”时仍然重复多余空白
              for (const s of segs) {
                if (s.type === 'text') {
                  if (!s.content || s.content.trim().length === 0) continue
                  merged.segments.push({ type: 'text', content: s.content })
                } else {
                  merged.segments.push(s)
                }
              }
            }
          }

          historicalMessages.push(merged)
          outIdx++
        }

        setMessages(historicalMessages)
      } catch (e) {
        console.warn('Failed to load session messages:', e)
        setMessages([])
      } finally {
        setLoading(false)
      }
    }

    loadMessages()
  }, [session?.id, serviceUrl])

  // 取消正在进行的请求（当 session 改变或组件卸载时）
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [session?.id])

  // 只有当用户当前就在底部时，才自动跟随滚动
  useEffect(() => {
    if (!isAtBottomRef.current) return
    scrollToBottom('auto')
  }, [messages, scrollToBottom])

  // 刷新会话列表（用于获取自动生成的标题）
  const refreshSessions = useCallback(async () => {
    onSessionsRefresh?.()
  }, [onSessionsRefresh])

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    console.log('SSE event:', event)
    
    setMessages(prev => {
      const newMessages = [...prev]
      const lastMsg = newMessages[newMessages.length - 1]
      
      if (!lastMsg || lastMsg.role !== 'assistant') return prev

      // 深拷贝 segments，避免直接修改原始状态
      const updatedMsg = { 
        ...lastMsg, 
        segments: lastMsg.segments.map((seg): ContentSegment => ({
          type: seg.type,
          content: seg.content,
          tool: seg.tool ? { ...seg.tool } : undefined
        })),
        pendingToolCalls: new Map(lastMsg.pendingToolCalls)
      }
      
      switch (event.type) {
        case 'delta':
        case 'assistant_message_delta': {
          const delta = event.content || event.delta || ''
          updatedMsg.content += delta
          
          // 更新最后一个文本片段，或添加新的文本片段
          const lastIndex = updatedMsg.segments.length - 1
          const lastSegment = lastIndex >= 0 ? updatedMsg.segments[lastIndex] : null
          if (lastSegment && lastSegment.type === 'text') {
            // 创建新对象而不是修改原对象
            updatedMsg.segments[lastIndex] = {
              ...lastSegment,
              content: (lastSegment.content || '') + delta
            }
          } else {
            updatedMsg.segments.push({ type: 'text', content: delta })
          }
          break
        }

        case 'task_completed':
        case 'assistant_message_completed':
          if (event.content) updatedMsg.content = event.content
          updatedMsg.status = 'completed'
          setSending(false)
          currentTaskIdRef.current = null
          // 延迟刷新会话列表，等待后端异步生成标题
          setTimeout(() => refreshSessions(), 1500)
          break

        case 'task_failed':
        case 'task_aborted': {
          updatedMsg.status = 'error'
          updatedMsg.content += `\n\n[${event.error || event.reason || '任务失败'}]`
          // 添加错误信息到最后一个文本片段
          const lastIdx = updatedMsg.segments.length - 1
          const lastSeg = lastIdx >= 0 ? updatedMsg.segments[lastIdx] : null
          if (lastSeg && lastSeg.type === 'text') {
            // 创建新对象而不是修改原对象
            updatedMsg.segments[lastIdx] = {
              ...lastSeg,
              content: (lastSeg.content || '') + `\n\n[${event.error || event.reason || '任务失败'}]`
            }
          } else {
            updatedMsg.segments.push({ type: 'text', content: `\n\n[${event.error || event.reason || '任务失败'}]` })
          }
          setSending(false)
          currentTaskIdRef.current = null
          break
        }

        case 'tool_start':
          if (event.call_id && event.tool) {
            const args = event.arguments as Record<string, unknown> | undefined
            
            const toolCall: ToolCall = { 
              id: event.call_id, 
              name: event.tool, 
              status: 'running',
              arguments: args,
            }
            // 添加工具调用片段到内容中
            updatedMsg.segments.push({ type: 'tool', tool: toolCall })
            updatedMsg.pendingToolCalls.set(event.call_id, toolCall)
          }
          break

        case 'tool_complete':
          if (event.call_id) {
            const tool = updatedMsg.pendingToolCalls.get(event.call_id)
            if (tool) {
              const completedTool = { 
                ...tool, 
                status: 'done' as const, 
                output: event.output 
              }
              // 更新 segments 中对应的工具调用（使用 map 创建新数组）
              updatedMsg.segments = updatedMsg.segments.map(segment => {
                if (segment.type === 'tool' && segment.tool?.id === event.call_id) {
                  return { ...segment, tool: completedTool }
                }
                return segment
              })
              updatedMsg.pendingToolCalls.delete(event.call_id)
            }
          }
          break

        case 'tool_call_progress':
          // 处理工具调用的实时进度/日志
          if (event.call_id) {
            const tool = updatedMsg.pendingToolCalls.get(event.call_id)
            if (tool) {
              const updatedTool = { ...tool }
              
              if (event.progress_type === 'log' || event.progress_type === 'output') {
                // 添加日志
                if (event.message) {
                  updatedTool.logs = [...(tool.logs || []), event.message]
                }
              } else if (event.progress_type === 'progress') {
                // 更新进度
                updatedTool.progress = event.progress
                updatedTool.total = event.total
              }
              
              // 更新 pendingToolCalls
              updatedMsg.pendingToolCalls.set(event.call_id, updatedTool)
              
              // 更新 segments 中对应的工具调用（使用 map 创建新数组）
              updatedMsg.segments = updatedMsg.segments.map(segment => {
                if (segment.type === 'tool' && segment.tool?.id === event.call_id) {
                  return { ...segment, tool: updatedTool }
                }
                return segment
              })
            }
          }
          break
          
        case 'warning':
          console.warn('Server warning:', event.message)
          break
      }
      
      newMessages[newMessages.length - 1] = updatedMsg
      return newMessages
    })
  }, [refreshSessions])

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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || !session || !serviceUrl || sending) return

    const currentPrompt = input
    setInput('')
    setSending(true)

    // 创建 AbortController 用于取消
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // 添加用户消息
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentPrompt,
      timestamp: Date.now(),
      segments: [{ type: 'text', content: currentPrompt }],
      pendingToolCalls: new Map(),
    }

    // 添加助手消息占位
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
      segments: [],
      pendingToolCalls: new Map(),
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])

    try {
      // 使用流式执行
      await executeStream(
        serviceUrl,
        { prompt: currentPrompt },
        handleSSEEvent,
        abortController.signal
      )
    } catch (err) {
      // 检查是否是用户主动取消
      if ((err as Error).name === 'AbortError') {
        console.log('Request cancelled by user')
        return
      }
      
      console.error('Execute error:', err)
      setMessages(prev => {
        const newMessages = [...prev]
        const last = newMessages[newMessages.length - 1]
        if (last && last.role === 'assistant') {
          last.status = 'error'
          last.content = `发送失败: ${(err as Error).message}`
        }
        return newMessages
      })
    } finally {
      setSending(false)
      abortControllerRef.current = null
      currentTaskIdRef.current = null
    }
  }

  async function handleCancel() {
    // 取消当前请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // 同时调用服务端取消 API
    if (serviceUrl) {
      try {
        await cancelTask(serviceUrl)
      } catch (e) {
        console.warn('Failed to cancel task on server:', e)
      }
    }
    
    setSending(false)
    setMessages(prev => {
      const newMessages = [...prev]
      const last = newMessages[newMessages.length - 1]
      if (last && last.role === 'assistant') {
        last.status = 'error'
        last.content += '\n\n[已取消]'
      }
      return newMessages
    })
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
        <div ref={messagesEndRef} />
        </main>

        {/* 未在底部时：悬浮“回到底部”按钮 */}
        {!isAtBottom && session && (
          <BackToBottomButton
            onClick={() => {
              isAtBottomRef.current = true
              setIsAtBottom(true)
              scrollToBottom('smooth')
            }}
          />
        )}
      </div>

      {/* Input Area */}
      {session && (
        <ChatComposer input={input} setInput={setInput} sending={sending} onSubmit={handleSubmit} onCancel={handleCancel} />
      )}
    </div>
  )
}
