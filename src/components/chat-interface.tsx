"use client"

import * as React from "react"
import { PlusIcon, SendIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface Agent {
  name: string
  role: string
  avatar?: string
}

interface Message {
  id: string
  role: "user" | "agent"
  content: string
  senderName: string
  timestamp: string
  needsHumanInput?: boolean
}

interface ChatInterfaceProps {
  agents?: Agent[]
  initialMessages?: Message[]
  selectedAgent?: string
  onSendMessage?: (content: string) => void
  onSelectAgent?: (agent: string) => void
  className?: string
}

export function ChatInterface({
  agents: providedAgents,
  initialMessages: providedInitialMessages = [],
  selectedAgent: initialSelectedAgent = "planner-A",
  onSendMessage,
  onSelectAgent,
  className,
}: ChatInterfaceProps) {
  const defaultAgents = [
    { name: "planner-A", role: "Planner", avatar: undefined },
    { name: "worker-B", role: "Worker", avatar: undefined },
    { name: "worker-C", role: "Worker", avatar: undefined },
  ] as const

  const agents = providedAgents || defaultAgents
  const [messages, setMessages] = React.useState<Message[]>(providedInitialMessages)
  const [selectedAgent, setSelectedAgent] = React.useState(initialSelectedAgent)
  const [input, setInput] = React.useState("")
  const inputLength = input.trim().length

  const handleSend = () => {
    if (inputLength === 0) return
    
    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      senderName: "You",
      timestamp: new Date().toLocaleTimeString("zh-CN", { 
        hour: "2-digit", 
        minute: "2-digit" 
      }),
    }
    
    setMessages([...messages, newMessage])
    setInput("")
    onSendMessage?.(input)
  }

  const currentAgent = agents.find(a => a.name === selectedAgent) || agents[0]

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      {/* Header */}
      <CardHeader className="flex flex-row items-center gap-3 p-4">
        <div className="flex items-center gap-3">
          <Avatar className="border">
            <AvatarImage src={currentAgent.avatar} alt={currentAgent.name} />
            <AvatarFallback>
              {currentAgent.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium leading-none">{currentAgent.name}</p>
            <p className="text-sm text-muted-foreground">{currentAgent.role}</p>
          </div>
        </div>
        
        {/* Agent Selector */}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={selectedAgent}
            onChange={(e) => {
              setSelectedAgent(e.target.value)
              onSelectAgent?.(e.target.value)
            }}
            className="text-sm border rounded-md px-2 py-1 bg-background"
          >
            {agents.map((agent) => (
              <option key={agent.name} value={agent.name}>
                {agent.name} ({agent.role})
              </option>
            ))}
          </select>
          
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8 rounded-full"
                >
                  <PlusIcon className="size-4" />
                  <span className="sr-only">新消息</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>新消息</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">选择一个 Agent 开始对话</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex w-max max-w-[80%] flex-col gap-1 rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <div className={cn(
                  "flex items-center gap-2 text-xs",
                  message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  <span>{message.senderName}</span>
                  <span>·</span>
                  <span>{message.timestamp}</span>
                  {message.needsHumanInput && (
                    <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-500">
                      需人工处理
                    </span>
                  )}
                </div>
                <p>{message.content}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>

      {/* Input */}
      <CardFooter className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex w-full items-end gap-2"
        >
          <Textarea
            id="message"
            placeholder="输入消息..."
            className="min-h-15 resize-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={inputLength === 0}
            className="shrink-0"
          >
            <SendIcon className="size-4" />
            <span className="sr-only">发送</span>
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}

export { type Message }
