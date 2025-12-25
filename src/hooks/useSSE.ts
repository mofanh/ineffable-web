import { useEffect, useRef, useState } from 'react'

export function useSSE(onEvent: (evt: any) => void, url = '/api/stream') {
  const esRef = useRef<EventSource | null>(null)
  const reconRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let closed = false

    function connect() {
      if (closed) return
      const es = new EventSource(url)
      esRef.current = es
      es.onopen = () => {
        reconRef.current = 0
        setConnected(true)
      }
      es.onmessage = (e) => {
        try { onEvent(JSON.parse(e.data)) } catch (err) { /* ignore */ }
      }
      es.onerror = () => {
        setConnected(false)
        // close and attempt reconnect
        try { es.close() } catch (_) {}
        esRef.current = null
        if (closed) return
        const attempt = ++reconRef.current
        const delay = Math.min(30000, 500 * Math.pow(2, attempt))
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      closed = true
      if (timerRef.current) window.clearTimeout(timerRef.current)
      if (esRef.current) try { esRef.current.close() } catch (_) {}
    }
  }, [onEvent, url])

  return { connected }
}
