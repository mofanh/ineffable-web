import type { ContentSegment, Message, ToolCall } from './types'

export function parseToolMemoryMessage(content: string): { name: string; output: string } {
  const trimmed = (content ?? '').trim()
  const m = trimmed.match(/^\[([^\]]+?)\]:\s*([\s\S]*)$/)
  if (m) {
    return { name: m[1].trim() || 'tool', output: (m[2] ?? '').trim() }
  }
  return { name: 'tool', output: trimmed }
}

export function attachToolOutputToAssistantMsg(msg: Message, toolName: string, output: string): boolean {
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

export function appendToolResultAsSegment(msg: Message, toolName: string, output: string, idSeed: string) {
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

export function normalizeRole(role: string | undefined): 'user' | 'assistant' | 'system' | 'tool' {
  const r = (role || '').toLowerCase()
  if (r === 'user') return 'user'
  if (r === 'system') return 'system'
  if (r === 'tool') return 'tool'
  return 'assistant'
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
export function filterToolCallTags(content: string): string {
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
export function parseMessageContent(content: string): ContentSegment[] {
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
