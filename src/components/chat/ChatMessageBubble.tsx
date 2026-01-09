import MarkdownRenderer from '../MarkdownRenderer'
import { cn } from '../../utils/cn'
import type { Message } from './types'
import { filterToolCallTags } from './messageParsing'
import ToolCallBlock from './ToolCallBlock'
import TypingDots from './TypingDots'

export default function ChatMessageBubble({ msg }: { msg: Message }) {
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
          {/* 按顺序渲染内容片段 */}
          {msg.role === 'user' ? (
            // 用户消息：简单文本
            <div className="whitespace-pre-wrap wrap-break-word">{msg.content}</div>
          ) : msg.segments.length === 0 && msg.status === 'streaming' ? (
            // 正在等待响应
            <TypingDots />
          ) : (
            // 助手消息：按片段渲染
            <>
              {msg.segments.map((segment, idx) =>
                segment.type === 'text' ? (
                  // 文本片段：使用 Markdown 渲染（过滤掉 tool_call 标签）
                  <MarkdownRenderer key={`text-${idx}`} content={filterToolCallTags(segment.content || '')} />
                ) : segment.type === 'tool' && segment.tool ? (
                  // 工具调用片段
                  <ToolCallBlock key={`tool-${segment.tool.id}`} tool={segment.tool} />
                ) : null
              )}
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
  )
}
