import React, { useMemo, useState } from 'react'
import { useSSE } from '../hooks/useSSE'

type EventRecord = {
  id?: string
  type: string
  task_id?: string
  content?: string
  delta?: string
  [k: string]: any
}

export default function StreamOutput({ filterTaskId }: { filterTaskId?: string }) {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [buffers, setBuffers] = useState<Record<string, string>>({})

  function handleEvent(evt: any) {
    const e: EventRecord = evt
    setEvents((s) => [...s, e])
    const tid = e.task_id || 'global'
    if (e.type === 'assistant_message_delta') {
      setBuffers((b) => ({ ...b, [tid]: (b[tid] || '') + (e.delta || '') }))
    } else if (e.type === 'assistant_message_completed') {
      setBuffers((b) => ({ ...b, [tid]: e.content || b[tid] || '' }))
    } else if (e.type === 'task_completed') {
      // no-op, keep buffer
    }
  }

  useSSE(handleEvent)

  const visibleEvents = useMemo(() => {
    if (!filterTaskId) return events.slice(-200)
    return events.filter((e) => (e.task_id || 'global') === filterTaskId).slice(-200)
  }, [events, filterTaskId])

  const output = (filterTaskId && buffers[filterTaskId]) || buffers['global'] || ''

  return (
    <div className="space-y-4">
      <div className="p-3 border rounded bg-gray-50">
        <div className="text-sm text-gray-500 mb-1">实时输出</div>
        <pre className="whitespace-pre-wrap text-sm">{output || '(no output yet)'}</pre>
      </div>

      <div className="p-3 border rounded bg-white">
        <div className="text-sm text-gray-500 mb-2">事件时间线（最近）</div>
        <div className="space-y-1 text-xs text-gray-700 max-h-48 overflow-auto">
          {visibleEvents.length === 0 && <div className="text-gray-400">无事件</div>}
          {visibleEvents.map((ev, i) => (
            <div key={i} className="p-1 border-b">
              <div className="font-medium">{ev.type}</div>
              <div className="text-[11px] text-gray-600">{JSON.stringify(ev)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
