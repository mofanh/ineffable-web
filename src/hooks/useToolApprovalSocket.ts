import { useCallback, useEffect, useRef, useState } from 'react'

import type { ToolApprovalRequest, ToolApprovalResponse } from '../types'

interface UseToolApprovalSocketOptions {
  serviceUrl: string
  onRequest: (event: ToolApprovalRequest) => void
}

interface UseToolApprovalSocketReturn {
  connected: boolean
  sendApproval: (callId: string, approved: boolean, remember?: ToolApprovalResponse['remember']) => boolean
}

function buildWsUrl(serviceUrl: string): string {
  const url = new URL(serviceUrl)
  const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProtocol}//${url.host}/api/ws`
}

export function useToolApprovalSocket({
  serviceUrl,
  onRequest,
}: UseToolApprovalSocketOptions): UseToolApprovalSocketReturn {
  const socketRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!serviceUrl) return

    const wsUrl = buildWsUrl(serviceUrl)
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onopen = () => setConnected(true)
    socket.onclose = () => setConnected(false)
    socket.onerror = () => setConnected(false)
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ToolApprovalRequest
        if (payload.type === 'tool_approval_request') {
          onRequest(payload)
        }
      } catch (err) {
        console.warn('Failed to parse WS message:', err)
      }
    }

    return () => {
      socket.close()
      socketRef.current = null
      setConnected(false)
    }
  }, [onRequest, serviceUrl])

  const sendApproval = useCallback(
    (callId: string, approved: boolean, remember?: ToolApprovalResponse['remember']) => {
      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) return false
      const payload: ToolApprovalResponse = {
        type: 'tool_approval_response',
        call_id: callId,
        approved,
        remember,
      }
      socket.send(JSON.stringify(payload))
      return true
    },
    []
  )

  return { connected, sendApproval }
}
