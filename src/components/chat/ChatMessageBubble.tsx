import React, { useState } from 'react'
import MarkdownRenderer from '../MarkdownRenderer'
import DiffRenderer from '../DiffRenderer'
import { cn } from '../../utils/cn'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import type { Message, ContentSegment, DiffFile } from './types'
import { filterToolCallTags } from './messageParsing'
import ToolCallBlock from './ToolCallBlock'
import TypingDots from './TypingDots'

// 生成片段的唯一键
function getSegmentKey(segment: ContentSegment, idx: number): string {
  return segment.id || `${segment.type}-${idx}`
}

// 推理内容组件
function ReasoningPart({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(true)
  
  if (!content.trim()) return null
  
  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="size-3.5" />
        <span>推理过程</span>
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
      </button>
      
      {expanded && (
        <div className="mt-2 pl-5 border-l-2 border-primary/20">
          <div className="text-xs text-muted-foreground/80 leading-relaxed">
            <MarkdownRenderer content={content} />
          </div>
          {isStreaming && (
            <div className="mt-1">
              <TypingDots />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 思考内容组件
function ThinkingPart({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(true)
  
  if (!content.trim()) return null
  
  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="size-3.5" />
        <span>思考</span>
        {expanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
      </button>
      
      {expanded && (
        <div className="mt-2 pl-5 border-l-2 border-primary/20">
          <div className="text-xs text-muted-foreground/80 leading-relaxed">
            <MarkdownRenderer content={content} />
          </div>
          {isStreaming && (
            <div className="mt-1">
              <TypingDots />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 消息部分映射（OpenCode 风格的组件注册表模式）
const PART_MAPPING: Record<string, React.FC<{ segment: ContentSegment; isLastStreaming: boolean }>> = {
  'text': function TextPart({ segment }) {
    return (
      <MarkdownRenderer 
        key={getSegmentKey(segment, 0)} 
        content={filterToolCallTags(segment.content || '')} 
      />
    )
  },
  
  'reasoning': function ReasoningPartDisplay({ segment, isLastStreaming }) {
    return (
      <ReasoningPart 
        key={getSegmentKey(segment, 0)} 
        content={segment.content || ''} 
        isStreaming={isLastStreaming} 
      />
    )
  },
  
  'thinking': function ThinkingPartDisplay({ segment, isLastStreaming }) {
    return (
      <ThinkingPart 
        key={getSegmentKey(segment, 0)} 
        content={segment.content || ''} 
        isStreaming={isLastStreaming} 
      />
    )
  },
  
  'diff': function DiffPart({ segment }) {
    if (!segment.diff) return null
    return <DiffRenderer key={getSegmentKey(segment, 0)} diff={segment.diff} className="my-2" />
  },
}

export default function ChatMessageBubble({
  msg,
  onToolApprove,
  onToolDeny,
}: {
  msg: Message
  onToolApprove?: (callId: string, remember?: 'session' | 'always' | null) => void
  onToolDeny?: (callId: string) => void
}) {
  const isStreaming = msg.status === 'streaming'
  
  return (
    <div
      className={cn(
        'flex gap-4 max-w-3xl mx-auto',
        msg.role === 'user' ? 'justify-end' : 'justify-start'
      )}
    >
      <div className={cn('flex-1', msg.role === 'user' ? 'max-w-[85%] flex justify-end' : 'max-w-full')}>
        <div
          className={cn(
            'px-0 py-2 text-sm leading-relaxed',
            msg.role === 'user'
              ? 'bg-primary/10 text-foreground px-4 py-3 rounded-2xl rounded-tr-sm'
              : msg.role === 'system'
                ? 'bg-destructive/10 text-destructive px-4 py-3 rounded-2xl'
                : 'text-foreground'
          )}
        >
          {/* 用户消息 */}
          {msg.role === 'user' ? (
            <div className="whitespace-pre-wrap wrap-break-word">{msg.content}</div>
          ) 
          // 等待响应
          : msg.segments.length === 0 && isStreaming ? (
            <TypingDots />
          ) 
          // 助手消息：按片段渲染
          : (
            <>
              {msg.segments.map((segment, idx) => {
                const isLastStreaming = isStreaming && idx === msg.segments.length - 1
                const PartComponent = PART_MAPPING[segment.type]
                
                if (PartComponent) {
                  return (
                    <PartComponent
                      key={getSegmentKey(segment, idx)}
                      segment={segment}
                      isLastStreaming={isLastStreaming}
                    />
                  )
                }
                
                // 未知类型回退到默认处理
                if (segment.type === 'text') {
                  return (
                    <MarkdownRenderer 
                      key={getSegmentKey(segment, idx)}
                      content={filterToolCallTags(segment.content || '')} 
                    />
                  )
                }
                
                if (segment.type === 'tool' && segment.tool) {
                  return (
                    <ToolCallBlock
                      key={`tool-${segment.tool.id}`}
                      tool={segment.tool}
                      onApprove={onToolApprove}
                      onDeny={onToolDeny}
                    />
                  )
                }
                
                return null
              })}
              
              {/* 流式输出中的光标 */}
              {msg.role === 'assistant' && isStreaming && msg.segments.length > 0 && (
                <div className="mt-1">
                  <TypingDots />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
