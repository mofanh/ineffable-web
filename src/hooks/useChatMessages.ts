import { useCallback, useEffect, useRef, useState } from 'react'

import type { Session, SSEEvent } from '../types'
import { cancelTask, executeStream, getSessionDetail } from '../api/services'

import type { Message, ToolCall, ContentSegment } from '../components/chat/types'
import {
  appendToolResultAsSegment,
  attachToolOutputToAssistantMsg,
  normalizeRole,
  parseMessageContent,
  parseToolMemoryMessage,
} from '../components/chat/messageParsing'

export function useChatMessages({
  serviceUrl,
  session,
  onSessionTitleRefresh,
}: {
  serviceUrl: string
  session: Session | null
  onSessionTitleRefresh?: (sessionId: string) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  const refreshSessionTitle = useCallback(() => {
    const sessionId = session?.id
    if (!sessionId) return
    onSessionTitleRefresh?.(sessionId)
  }, [onSessionTitleRefresh, session?.id])

  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      // console.log('SSE event:', event)

      setMessages(prev => {
        const newMessages = [...prev]
        const lastMsg = newMessages[newMessages.length - 1]

        if (!lastMsg || lastMsg.role !== 'assistant') return prev

        // 深拷贝 segments，避免直接修改原始状态
        const updatedMsg: Message = {
          ...lastMsg,
          segments: lastMsg.segments.map((seg): ContentSegment => ({
            type: seg.type,
            content: seg.content,
            tool: seg.tool ? { ...seg.tool } : undefined,
          })),
          pendingToolCalls: new Map(lastMsg.pendingToolCalls),
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
              updatedMsg.segments[lastIndex] = {
                ...lastSegment,
                content: (lastSegment.content || '') + delta,
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
            setTimeout(() => refreshSessionTitle(), 1500)
            break

          case 'task_failed':
          case 'task_aborted': {
            updatedMsg.status = 'error'
            updatedMsg.content += `\n\n[${event.error || event.reason || '任务失败'}]`
            // 添加错误信息到最后一个文本片段
            const lastIdx = updatedMsg.segments.length - 1
            const lastSeg = lastIdx >= 0 ? updatedMsg.segments[lastIdx] : null
            if (lastSeg && lastSeg.type === 'text') {
              updatedMsg.segments[lastIdx] = {
                ...lastSeg,
                content: (lastSeg.content || '') + `\n\n[${event.error || event.reason || '任务失败'}]`,
              }
            } else {
              updatedMsg.segments.push({
                type: 'text',
                content: `\n\n[${event.error || event.reason || '任务失败'}]`,
              })
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
                  output: event.output,
                }
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
                  if (event.message) {
                    updatedTool.logs = [...(tool.logs || []), event.message]
                  }
                } else if (event.progress_type === 'progress') {
                  updatedTool.progress = event.progress
                  updatedTool.total = event.total
                }

                updatedMsg.pendingToolCalls.set(event.call_id, updatedTool)

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
    },
    [refreshSessionTitle]
  )

  // session 切换时加载历史消息（含“合并 assistant/tool/assistant...”）
  useEffect(() => {
    if (!session || !serviceUrl) {
      setMessages([])
      return
    }

    const sessionId = session.id

    async function loadMessages() {
      setLoading(true)
      try {
        const detail = await getSessionDetail(serviceUrl, sessionId)

        const historicalMessages: Message[] = []
        const baseNow = Date.now()
        let outIdx = 0

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

          while (i + 1 < detail.messages.length) {
            const next = detail.messages[i + 1]
            const nextRole = normalizeRole(next.role)
            if (nextRole === 'user' || nextRole === 'system') break

            i++
            if (nextRole === 'tool') {
              const { name, output } = parseToolMemoryMessage(next.content)
              const attached = attachToolOutputToAssistantMsg(merged, name, output)
              if (!attached) {
                appendToolResultAsSegment(merged, name, output, merged.id)
              }
            } else {
              merged.content += `\n\n${next.content}`
              const segs = parseMessageContent(next.content)
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

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || !session || !serviceUrl || sending) return

      setSending(true)

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
        segments: [{ type: 'text', content: prompt }],
        pendingToolCalls: new Map(),
      }

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
        await executeStream(serviceUrl, { prompt }, handleSSEEvent, abortController.signal)
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
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
    },
    [handleSSEEvent, sending, serviceUrl, session]
  )

  const cancel = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

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
  }, [serviceUrl])

  return {
    messages,
    setMessages,
    loading,
    sending,
    sendMessage,
    cancel,
  }
}
