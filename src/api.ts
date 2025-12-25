export type ApiResponse<T> = {
  success: boolean
  data: T | null
  error: any
}

export async function execute(prompt: string) {
  const res = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const json = (await res.json()) as ApiResponse<any>
  if (!res.ok || !json.success) throw new Error(json.error?.message || 'execute failed')
  return json.data
}

export async function getStatus() {
  const res = await fetch('/api/status')
  const json = (await res.json()) as ApiResponse<any>
  return json
}

export async function getHealth() {
  const res = await fetch('/api/health')
  const json = (await res.json()) as ApiResponse<any>
  return json
}
