import React from 'react'
import { Mic, Paperclip, Send, StopCircle } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function ChatComposer({
  input,
  setInput,
  sending,
  onSubmit,
  onCancel,
}: {
  input: string
  setInput: (value: string) => void
  sending: boolean
  onSubmit: (e?: React.FormEvent) => void
  onCancel: () => void
}) {
  return (
    <footer className="flex-none p-4 bg-background">
      <div className="max-w-3xl mx-auto">
        <form onSubmit={onSubmit} className="relative bg-background rounded-3xl border border-primary/20 shadow-sm transition-all duration-200">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit()
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
                  onClick={onCancel}
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
                  'p-2 rounded-full transition-all duration-200',
                  input.trim() && !sending
                    ? 'bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:bg-primary/90'
                    : 'bg-transparent text-muted-foreground/30 cursor-not-allowed'
                )}
              >
                <Send className="size-5" />
              </button>
            </div>
          </div>
        </form>
        <div className="text-center mt-3">
          <p className="text-[11px] text-muted-foreground/40">Ineffable © 2026. Built with lazy by LBJ.</p>
        </div>
      </div>
    </footer>
  )
}
