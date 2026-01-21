/**
 * Skills API - 与 Service 的 skills 端点交互
 */

import type { SkillsListRequest, SkillsListResponse } from '../types'

/**
 * 列出所有可用技能
 * @param serverUrl - Service URL (e.g., "http://localhost:8080")
 * @param request - 请求参数
 */
export async function listSkills(
  serverUrl: string,
  request: SkillsListRequest = {}
): Promise<SkillsListResponse> {
  const res = await fetch(`${serverUrl}/api/skills/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch skills: ${res.status}`)
  }

  return res.json()
}
