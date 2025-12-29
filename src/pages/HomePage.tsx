import React from 'react'
import { Bot, Sparkles, Zap, Shield } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-background/50">
      <div className="max-w-2xl space-y-8">
        <div className="flex justify-center">
          <div className="p-4 bg-primary/10 rounded-2xl">
            <Bot className="size-16 text-primary" />
          </div>
        </div>
        
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Ineffable Agent System
          </h1>
          <p className="text-lg text-muted-foreground">
            您的智能体管理中心。从左侧侧边栏选择一个智能体开始对话，或者创建一个新的智能体来扩展您的工作流。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
          <div className="p-6 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-all">
            <Sparkles className="size-8 text-warning mb-4 mx-auto" />
            <h3 className="font-semibold mb-2">智能对话</h3>
            <p className="text-sm text-muted-foreground">
              与 AI 智能体进行自然语言交互，完成各种任务。
            </p>
          </div>
          <div className="p-6 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-all">
            <Zap className="size-8 text-success mb-4 mx-auto" />
            <h3 className="font-semibold mb-2">工具集成</h3>
            <p className="text-sm text-muted-foreground">
              智能体可调用多种工具，实现自动化操作。
            </p>
          </div>
          <div className="p-6 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-all">
            <Shield className="size-8 text-primary mb-4 mx-auto" />
            <h3 className="font-semibold mb-2">安全可靠</h3>
            <p className="text-sm text-muted-foreground">
              本地运行或中心化管理，数据安全可控。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
