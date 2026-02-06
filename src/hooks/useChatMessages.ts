import { useCallback, useEffect, useRef, useState } from 'react'

import type { Session, SSEEvent, ToolApprovalRequest } from '../types'
import { cancelTask, executeStream, getSessionMessages } from '../api/services'

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

              const existingTool = updatedMsg.pendingToolCalls.get(event.call_id)
              const toolCall: ToolCall = existingTool
                ? { ...existingTool, status: 'running', arguments: args ?? existingTool.arguments }
                : {
                    id: event.call_id,
                    name: event.tool,
                    status: 'running',
                    arguments: args,
                  }

              if (!existingTool) {
                updatedMsg.segments.push({ type: 'tool', tool: toolCall })
              } else {
                updatedMsg.segments = updatedMsg.segments.map(segment => {
                  if (segment.type === 'tool' && segment.tool?.id === event.call_id) {
                    return { ...segment, tool: toolCall }
                  }
                  return segment
                })
              }
              updatedMsg.pendingToolCalls.set(event.call_id, toolCall)
            }
            break

          case 'tool_complete':
            if (event.call_id) {
              const tool = updatedMsg.pendingToolCalls.get(event.call_id)
              if (tool) {
                const completedTool = {
                  ...tool,
                  status: 'completed' as const,
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
        const messages = await getSessionMessages(serviceUrl, sessionId)

        const historicalMessages: Message[] = []
        const baseNow = Date.now()
        let outIdx = 0

        for (let i = 0; i < messages.length; i++) {
          const m = messages[i]
          const role = normalizeRole(m.role)
          // 兼容新旧 API：优先使用 created_at，回退到 timestamp
          const msgTimestamp = m.created_at || m.timestamp

          if (role === 'user' || role === 'system') {
            historicalMessages.push({
              id: `hist-${outIdx}`,
              role,
              content: m.content,
              timestamp: msgTimestamp || baseNow + outIdx,
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
              timestamp: msgTimestamp || baseNow + outIdx,
              status: 'completed' as const,
              segments: [
                {
                  type: 'tool',
                  tool: {
                    id: `hist-tool-${outIdx}-0`,
                    name,
                    status: 'completed',
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
            timestamp: msgTimestamp || baseNow + outIdx,
          }

          while (i + 1 < messages.length) {
            const next = messages[i + 1]
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
        await executeStream(
          serviceUrl,
          { prompt, session_id: session.id },
          handleSSEEvent,
          abortController.signal,
        )
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

  const handleToolApprovalRequest = useCallback((request: ToolApprovalRequest) => {
    setMessages(prev => {
      const newMessages = [...prev]
      let targetIndex = newMessages.length - 1
      const lastMsg = newMessages[targetIndex]

      if (!lastMsg || lastMsg.role !== 'assistant') {
        const assistantMsg: Message = {
          id: `${Date.now()}-approval`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          status: 'streaming',
          segments: [],
          pendingToolCalls: new Map(),
        }
        newMessages.push(assistantMsg)
        targetIndex = newMessages.length - 1
      }

      const targetMsg = newMessages[targetIndex]
      const existing = targetMsg.pendingToolCalls.get(request.call_id)

      const toolCall: ToolCall = existing
        ? {
            ...existing,
            status: 'awaiting',
            riskLevel: request.risk_level,
            description: request.description,
            requiresApproval: true,
            arguments: request.args,
          }
        : {
            id: request.call_id,
            name: request.name,
            status: 'awaiting',
            riskLevel: request.risk_level,
            description: request.description,
            requiresApproval: true,
            arguments: request.args,
          }

      if (!existing) {
        targetMsg.segments.push({ type: 'tool', tool: toolCall })
      } else {
        targetMsg.segments = targetMsg.segments.map(segment => {
          if (segment.type === 'tool' && segment.tool?.id === request.call_id) {
            return { ...segment, tool: toolCall }
          }
          return segment
        })
      }

      targetMsg.pendingToolCalls.set(request.call_id, toolCall)
      newMessages[targetIndex] = targetMsg
      return newMessages
    })
  }, [])

  const handleToolApprovalDecision = useCallback((callId: string, approved: boolean) => {
    setMessages(prev => {
      const newMessages = [...prev]
      for (let i = newMessages.length - 1; i >= 0; i--) {
        const msg = newMessages[i]
        if (msg.role !== 'assistant') continue
        const tool = msg.pendingToolCalls.get(callId)
        if (!tool) continue

        const updatedTool: ToolCall = {
          ...tool,
          status: approved ? 'pending' : 'denied',
        }

        msg.pendingToolCalls.set(callId, updatedTool)
        msg.segments = msg.segments.map(segment => {
          if (segment.type === 'tool' && segment.tool?.id === callId) {
            return { ...segment, tool: updatedTool }
          }
          return segment
        })
        newMessages[i] = { ...msg }
        break
      }
      return newMessages
    })
  }, [])

  return {
    messages,
    setMessages,
    loading,
    sending,
    sendMessage,
    cancel,
    handleToolApprovalRequest,
    handleToolApprovalDecision,
  }
}
