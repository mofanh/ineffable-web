import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Plus, Bot, AlertCircle, RefreshCw, StopCircle, Wrench, Paperclip, Mic, MessageSquare, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../utils/cn'
import type { Server, Service, Session, SessionDetail as SessionDetailType, SSEEvent, MessageInfo } from '../types'
import { getSessionDetail, createSession, executeStream, cancelTask, listSessions } from '../api/services'
import MarkdownRenderer from './MarkdownRenderer'
import '../styles/markdown.css'

interface ToolCall {
  id: string
  name: string
  status: 'running' | 'done'
  output?: string
  logs?: string[]  // 实时输出日志
  progress?: number
  total?: number
  arguments?: Record<string, unknown>  // 工具参数
}

// 内容片段：可以是文本或工具调用
interface ContentSegment {
  type: 'text' | 'tool'
  content?: string
  tool?: ToolCall
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string  // 保留用于兼容
  timestamp: number
  status?: 'streaming' | 'completed' | 'error'
  segments: ContentSegment[]  // 按顺序的内容片段
  pendingToolCalls: Map<string, ToolCall>  // 正在等待的工具调用
}

function parseToolMemoryMessage(content: string): { name: string; output: string } {
  const trimmed = (content ?? '').trim()
  const m = trimmed.match(/^\[([^\]]+?)\]:\s*([\s\S]*)$/)
  if (m) {
    return { name: m[1].trim() || 'tool', output: (m[2] ?? '').trim() }
  }
  return { name: 'tool', output: trimmed }
}

function attachToolOutputToAssistantMsg(msg: Message, toolName: string, output: string): boolean {
  // 从后往前找最近的“未填 output 的 tool 段”，优先 name 匹配
  for (let j = msg.segments.length - 1; j >= 0; j--) {
    const seg = msg.segments[j]
    if (seg.type !== 'tool' || !seg.tool) continue
    if (seg.tool.output != null) continue
    if (toolName && seg.tool.name !== toolName) continue
    seg.tool.output = output
    seg.tool.status = 'done'
    return true
  }

  // name 不匹配时，退化为“填最近一个未完成 tool 段”
  for (let j = msg.segments.length - 1; j >= 0; j--) {
    const seg = msg.segments[j]
    if (seg.type !== 'tool' || !seg.tool) continue
    if (seg.tool.output != null) continue
    seg.tool.output = output
    seg.tool.status = 'done'
    return true
  }

  return false
}

function appendToolResultAsSegment(msg: Message, toolName: string, output: string, idSeed: string) {
  msg.segments.push({
    type: 'tool',
    tool: {
      id: `hist-tool-${idSeed}-${msg.segments.length}`,
      name: toolName || 'tool',
      status: 'done',
      output,
    },
  })
}

function normalizeRole(role: string | undefined): 'user' | 'assistant' | 'system' | 'tool' {
  const r = (role || '').toLowerCase()
  if (r === 'user') return 'user'
  if (r === 'system') return 'system'
  if (r === 'tool') return 'tool'
  return 'assistant'
}

interface Props {
  server: Server | null
  service: Service | null
  session: Session | null
  serviceUrl: string
  onSessionChange?: (session: Session) => void
  onSessionsRefresh?: () => void
}

function parseToolCallPayload(payload: string): { name?: string; arguments?: Record<string, unknown> } {
  const trimmed = payload.trim()

  // JSON 格式：{"name":"bash","arguments":{...}}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const json = JSON.parse(trimmed) as { name?: string; arguments?: Record<string, unknown> }
      return { name: json.name, arguments: json.arguments }
    } catch {
      return {}
    }
  }

  // XML 格式：<name>bash</name><arguments>...</arguments>
  const nameMatch = trimmed.match(/<name>\s*([^<]+?)\s*<\/name>/i)
  const argsMatch = trimmed.match(/<arguments>([\s\S]*?)<\/arguments>/i)
  const name = nameMatch?.[1]?.trim()
  if (!argsMatch) {
    return { name }
  }

  // 不做复杂 XML->Object 解析，保留原始 XML 片段，避免误解析造成“乱”
  const argsXml = argsMatch[1].trim()
  return { name, arguments: argsXml ? ({ _xml: argsXml } as Record<string, unknown>) : undefined }
}

// 过滤掉 <tool_call> 标签的原始文本（因为工具调用已通过 tool_start 事件单独渲染）
function filterToolCallTags(content: string): string {
  if (!content) return ''
  // 移除完整的 <tool_call>...</tool_call> 标签
  let filtered = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
  // 移除未闭合的 <tool_call> 标签（流式渲染中可能出现）
  filtered = filtered.replace(/<tool_call>[\s\S]*$/g, '')
  // 清理多余的空行
  filtered = filtered.replace(/\n{3,}/g, '\n\n')
  return filtered.trim()
}

// 解析消息内容（历史消息）：仅识别明确的 MCP 标签 <tool_call>/<tool_result>
function parseMessageContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  const pendingByName = new Map<string, ToolCall[]>()

  const tagRegex = /<tool_call>[\s\S]*?<\/tool_call>|<tool_result\s+name="[^"]+"\s*>[\s\S]*?<\/tool_result>/g
  let lastIndex = 0

  const pushText = (text: string) => {
    if (!text) return
    if (text.trim().length === 0) return
    segments.push({ type: 'text', content: text })
  }

  const attachResult = (name: string, output: string): boolean => {
    const queue = pendingByName.get(name)
    if (!queue || queue.length === 0) return false
    const idx = queue.findIndex(t => t.output == null)
    if (idx < 0) return false
    queue[idx].output = output
    return true
  }

  for (const match of content.matchAll(tagRegex)) {
    const full = match[0]
    const start = match.index ?? 0
    const end = start + full.length

    if (start > lastIndex) {
      pushText(content.slice(lastIndex, start))
    }

    if (full.startsWith('<tool_call>')) {
      const inner = full.replace(/^<tool_call>/, '').replace(/<\/tool_call>$/, '')
      const parsed = parseToolCallPayload(inner)
      const tool: ToolCall = {
        id: `hist-tool-${segments.length}`,
        name: parsed.name || 'tool',
        status: 'done',
        arguments: parsed.arguments,
      }

      const key = tool.name
      pendingByName.set(key, [...(pendingByName.get(key) ?? []), tool])
      segments.push({ type: 'tool', tool })
    } else {
      const nameMatch = full.match(/<tool_result\s+name="([^"]+)"/)
      const name = nameMatch?.[1] || 'tool'
      const output = full
        .replace(/^<tool_result\s+name="[^"]+"\s*>/, '')
        .replace(/<\/tool_result>$/, '')
        .replace(/^\n+|\n+$/g, '')

      const attached = attachResult(name, output)
      if (!attached) {
        segments.push({
          type: 'tool',
          tool: {
            id: `hist-tool-${segments.length}`,
            name,
            status: 'done',
            output,
          },
        })
      }
    }

    lastIndex = end
  }

  if (lastIndex < content.length) {
    pushText(content.slice(lastIndex))
  }

  if (segments.length === 0) {
    return [{ type: 'text', content }]
  }

  return segments
}

// MCP 工具调用块组件（可折叠，支持实时日志 / 最终输出）
function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(tool.status === 'running')
  const logsEndRef = useRef<HTMLDivElement>(null)
  
  // 当有新日志时自动滚动到底部
  useEffect(() => {
    if (expanded && tool.status === 'running' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [tool.logs, expanded, tool.status])
  
  // 当运行时自动展开
  useEffect(() => {
    if (tool.status === 'running' && tool.logs && tool.logs.length > 0) {
      setExpanded(true)
    }
  }, [tool.status, tool.logs])
  
  const hasArgs = Boolean(tool.arguments && Object.keys(tool.arguments).length > 0)
  const hasContent = (tool.logs && tool.logs.length > 0) || tool.output || hasArgs
  const showProgress = tool.status === 'running' && tool.progress !== undefined && tool.total !== undefined
  
  return (
    <div className="my-2 bg-muted/30 rounded-lg border border-border/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {tool.status === 'running' ? (
          <RefreshCw className="size-3 animate-spin text-primary" />
        ) : expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        <Wrench className="size-3" />
        <span className="flex-1 text-left">
          {tool.status === 'running' ? '正在调用' : '已调用'}: <span className="text-foreground">{tool.name}</span>
        </span>
        {showProgress && (
          <span className="text-[10px] text-primary">
            {Math.round((tool.progress! / tool.total!) * 100)}%
          </span>
        )}
        {tool.status === 'done' && hasContent && (
          <span className="text-[10px] text-muted-foreground/60">点击{expanded ? '折叠' : '展开'}</span>
        )}
      </button>
      
      {/* 进度条 */}
      {showProgress && (
        <div className="px-3 pb-2">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(tool.progress! / tool.total!) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      {/* 实时日志 / 参数 / 最终输出 */}
      {expanded && hasContent && (
        <div className="px-3 py-2 text-xs font-mono bg-background/50 border-t border-border/30 max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
          {/* arguments */}
          {hasArgs && (
            <div className={(tool.logs && tool.logs.length > 0) || tool.output ? 'mb-2 pb-2 border-b border-border/30' : ''}>
              <div className="text-muted-foreground/70 mb-1">arguments:</div>
              <pre className="whitespace-pre-wrap wrap-break-word text-muted-foreground">
                            {JSON.stringify(tool.arguments, null, 2)}
              </pre>
            </div>
          )}
          {/* 实时日志 */}
          {tool.logs && tool.logs.length > 0 && (
            <div className={tool.output ? 'mb-2 pb-2 border-b border-border/30' : ''}>
              {tool.logs.map((log, idx) => (
                <div key={idx} className="text-green-400/80">{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
          {/* 最终输出 */}
          {tool.output && (
            <div>{tool.output}</div>
          )}
        </div>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <span className="typing-dots text-muted-foreground" aria-label="模型输出中">
      <span className="typing-dot" aria-hidden="true">·</span>
      <span className="typing-dot" aria-hidden="true">·</span>
      <span className="typing-dot" aria-hidden="true">·</span>
    </span>
  )
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
      <header className="flex-none h-14 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 flex items-center justify-center z-10">
        <div className="flex flex-col items-center text-center">
          <h1 className="font-medium text-base text-foreground">
            {session?.name || (session ? `会话 ${session.id.slice(0, 8)}` : service.name)}
          </h1>
          <span className="text-xs text-muted-foreground">
            {service.name} • {server.name}
          </span>
        </div>
      </header>

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
          messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-4 max-w-3xl mx-auto", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "flex-1",
                msg.role === 'user' ? "max-w-[85%] flex justify-end" : "max-w-full"
              )}>
                <div className={cn(
                  "px-0 py-2 text-sm leading-relaxed",
                  msg.role === 'user' 
                    ? "bg-primary/10 text-foreground px-4 py-3 rounded-2xl rounded-tr-sm" 
                    : msg.role === 'system'
                    ? "bg-destructive/10 text-destructive px-4 py-3 rounded-2xl"
                    : "text-foreground"
                )}>
                  {/* 按顺序渲染内容片段 */}
                  {msg.role === 'user' ? (
                    // 用户消息：简单文本
                    <div className="whitespace-pre-wrap wrap-break-word">
                      {msg.content}
                    </div>
                  ) : msg.segments.length === 0 && msg.status === 'streaming' ? (
                    // 正在等待响应
                    <TypingDots />
                  ) : (
                    // 助手消息：按片段渲染
                    <>
                      {msg.segments.map((segment, idx) => (
                        segment.type === 'text' ? (
                          // 文本片段：使用 Markdown 渲染（过滤掉 tool_call 标签）
                          <MarkdownRenderer 
                            key={`text-${idx}`} 
                            content={filterToolCallTags(segment.content || '')} 
                          />
                        ) : segment.type === 'tool' && segment.tool ? (
                          // 工具调用片段
                          <ToolCallBlock key={`tool-${segment.tool.id}`} tool={segment.tool} />
                        ) : null
                      ))}
                      {msg.role === 'assistant' && msg.status === 'streaming' && (
                        <div className="mt-1">
                          <TypingDots />
                        </div>
                      )}
                    </>
                  )}

                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
        </main>

        {/* 未在底部时：悬浮“回到底部”按钮 */}
        {!isAtBottom && session && (
          <button
            type="button"
            onClick={() => {
              isAtBottomRef.current = true
              setIsAtBottom(true)
              scrollToBottom('smooth')
            }}
            className="absolute bottom-4 right-4 size-9 rounded-full border border-border/60 bg-background shadow-sm hover:bg-muted transition-colors flex items-center justify-center"
            title="回到底部"
          >
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Input Area */}
      {session && (
        <footer className="flex-none p-4 bg-background">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="relative bg-background rounded-3xl border border-primary/20 shadow-sm transition-all duration-200">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder="开始吧..."
                className="w-full min-h-13 max-h-50 bg-transparent border-none px-5 py-4 text-sm resize-none focus:ring-0 focus:outline-none placeholder:text-muted-foreground/40"
                rows={1}
                disabled={sending}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1">
                  <button type="button" className="p-2 text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded-full transition-colors">
                    <Paperclip className="size-5" />
                  </button>
                  <button type="button" className="p-2 text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded-full transition-colors">
                    <Mic className="size-5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {sending && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                      title="取消"
                    >
                      <StopCircle className="size-5" />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!input.trim() || sending}
                    className={cn(
                      "p-2 rounded-full transition-all duration-200",
                      input.trim() && !sending
                        ? "bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/90"
                        : "bg-transparent text-muted-foreground/30 cursor-not-allowed"
                    )}
                  >
                    <Send className="size-5" />
                  </button>
                </div>
              </div>
            </form>
            <div className="text-center mt-3">
              <p className="text-[11px] text-muted-foreground/40">
                Ineffable © 2026. Built with lazy by LBJ.
              </p>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
