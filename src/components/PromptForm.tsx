import React, { useState } from 'react'
import { execute } from '../api'

type Props = {
  onStarted: (taskId: string, prompt: string) => void
}

export default function PromptForm({ onStarted }: Props) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const data = await execute(prompt)
      onStarted(data.task_id, prompt)
      setPrompt('')
    } catch (err) {
      console.error(err)
      alert('启动任务失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="输入 prompt 后回车或点击 Submit"
        className="w-full border rounded p-2"
        rows={4}
      />
      <div className="flex gap-2">
        <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit'}
        </button>
        <button type="button" className="px-3 py-1 border rounded" onClick={() => setPrompt('')}>
          Clear
        </button>
      </div>
    </form>
  )
}
