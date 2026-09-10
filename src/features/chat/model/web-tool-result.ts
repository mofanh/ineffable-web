import { parseLeadingJsonObject } from "./leading-json-object"

export function safeWebSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : null
  } catch { return null }
}

export function parseWebToolResult(output: string) {
  const value = parseLeadingJsonObject(output)
  if (value?.schema_version !== 1 || (value.kind !== "web_search" && value.kind !== "web_fetch")) return null
  if (typeof value.error === "string") return { kind: value.kind, error: value.error } as const
  if (value.content_origin !== "untrusted_external") return null
  if (value.kind === "web_search" && Array.isArray(value.results)) {
    return {
      kind: "web_search" as const,
      partial: value.partial === true,
      truncated: value.truncated === true,
      results: value.results.slice(0, 20).flatMap((item: unknown) => {
        if (!item || typeof item !== "object") return []
        const row = item as Record<string, unknown>
        const url = safeWebSourceUrl(row.url)
        if (!url || typeof row.title !== "string" || typeof row.snippet !== "string") return []
        return [{ url, title: row.title, snippet: row.snippet }]
      }),
    }
  }
  if (value.kind === "web_fetch" && typeof value.content === "string") {
    return {
      kind: "web_fetch" as const,
      url: safeWebSourceUrl(value.final_url),
      title: typeof value.title === "string" ? value.title : "",
      content: value.content,
      truncated: value.truncated === true,
      hasMore: typeof value.next_offset === "number",
    }
  }
  return null
}
export type WebToolResult = NonNullable<ReturnType<typeof parseWebToolResult>>
