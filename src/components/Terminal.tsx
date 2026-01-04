import React, { useEffect, useRef, useCallback, useState } from 'react'
import { cn } from '../utils/cn'

interface TerminalProps {
  /** Agent ID */
  agentId: string
  /** WebSocket URL 基础路径 */
  wsBaseUrl?: string
  /** Session ID（可选，用于生命周期绑定） */
  sessionId?: string
  /** 终端高度 */
  height?: string
  /** 额外的 className */
  className?: string
  /** 连接状态变化回调 */
  onConnectionChange?: (connected: boolean) => void
  /** 进程退出回调 */
  onExit?: (code: number) => void
}

interface WsMessage {
  type: 'output' | 'started' | 'exit' | 'pong' | 'error'
  data?: string
  agent_id?: string
  code?: number
  message?: string
}

/**
 * 终端组件 - 显示 CLI 的实时终端输出
 * 
 * 使用 WebSocket 连接到 Hub，接收 PTY 终端输出
 * 支持 ANSI 颜色代码显示
 */
export default function Terminal({
  agentId,
  wsBaseUrl = '',
  sessionId,
  height = '400px',
  className,
  onConnectionChange,
  onExit,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [connected, setConnected] = useState(false)
  const [output, setOutput] = useState<string>('')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 构建 WebSocket URL
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = wsBaseUrl || window.location.host
    let url = `${protocol}//${host}/api/agents/${agentId}/terminal`
    if (sessionId) {
      url += `?session_id=${sessionId}`
    }
    return url
  }, [agentId, wsBaseUrl, sessionId])

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    const url = getWsUrl()
    console.log('Connecting to terminal WebSocket:', url)

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Terminal WebSocket connected')
      setConnected(true)
      onConnectionChange?.(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        
        switch (msg.type) {
          case 'output':
            if (msg.data) {
              setOutput(prev => prev + msg.data)
            }
            break
          case 'started':
            setOutput(prev => prev + '\r\n[Process started]\r\n')
            break
          case 'exit':
            setOutput(prev => prev + `\r\n[Process exited with code ${msg.code}]\r\n`)
            onExit?.(msg.code ?? 0)
            break
          case 'error':
            setOutput(prev => prev + `\r\n[Error: ${msg.message}]\r\n`)
            break
        }
      } catch (e) {
        // 可能是纯文本输出
        setOutput(prev => prev + event.data)
      }
    }

    ws.onclose = () => {
      console.log('Terminal WebSocket closed')
      setConnected(false)
      onConnectionChange?.(false)
      
      // 自动重连
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null
          connect()
        }, 3000)
      }
    }

    ws.onerror = (error) => {
      console.error('Terminal WebSocket error:', error)
    }
  }, [getWsUrl, onConnectionChange, onExit])

  // 发送输入到终端
  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }))
    }
  }, [])

  // 调整终端大小
  const resize = useCallback((rows: number, cols: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', rows, cols }))
    }
  }, [])

  // 关闭终端
  const close = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'close' }))
    }
  }, [])

  // 初始化连接
  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  // 自动滚动到底部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [output])

  // 简单的 ANSI 颜色解析（基础实现）
  const renderOutput = useCallback(() => {
    // 简单实现：移除 ANSI 转义码，后续可以增强为真正的颜色支持
    // 这里保留原始输出，让 CSS 处理
    return output
  }, [output])

  return (
    <div
      ref={containerRef}
      className={cn(
        'bg-black text-green-400 font-mono text-sm p-4 overflow-auto rounded-lg',
        'whitespace-pre-wrap break-all',
        className
      )}
      style={{ height }}
    >
      {/* 连接状态指示器 */}
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            connected ? 'bg-green-500' : 'bg-red-500'
          )}
        />
        <span className="text-gray-400">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      
      {/* 终端输出 */}
      <div className="terminal-output">
        {renderOutput()}
      </div>
      
      {/* 光标 */}
      {connected && (
        <span className="animate-pulse">▋</span>
      )}
    </div>
  )
}

// 导出工具函数
export { Terminal }
export type { TerminalProps }
