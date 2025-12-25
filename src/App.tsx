import React, { useEffect, useState } from 'react'
import PromptForm from './components/PromptForm'
import StreamOutput from './components/StreamOutput'
import { getHealth, getStatus } from './api'

export default function App() {
  const [status, setStatus] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(undefined)

  useEffect(() => {
    async function load() {
      try {
        const s = await getStatus()
        setStatus(s.data)
      } catch (_) {}
      try {
        const h = await getHealth()
        setHealth(h.data)
      } catch (_) {}
    }
    load()
  }, [])

  function handleStarted(taskId: string) {
    setCurrentTaskId(taskId)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="p-4 bg-white rounded shadow flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Ineffable Web — Agent 控制台</h1>
            <div className="text-sm text-gray-600">实时展示 Agent 运行与任务输出</div>
          </div>
          <div className="text-sm text-right">
            <div>State: <span className="font-medium">{status?.state ?? '—'}</span></div>
            <div>Running: <span className="font-medium">{String(status?.is_running ?? false)}</span></div>
            <div>Health: <span className="font-medium">{health?.status ?? '—'}</span></div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white rounded shadow">
            <h2 className="font-semibold mb-2">提交任务</h2>
            <PromptForm onStarted={(taskId) => handleStarted(taskId)} />
          </div>

          <div className="p-4 bg-white rounded shadow">
            <h2 className="font-semibold mb-2">实时输出（任务 {currentTaskId ?? '—'}）</h2>
            <StreamOutput filterTaskId={currentTaskId} />
          </div>
        </div>
      </div>
    </div>
  )
}
