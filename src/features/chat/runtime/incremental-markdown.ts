export type IncrementalMarkdownSegment = {
  id: string
  content: string
  stable: boolean
}

const UNSTABLE_TAIL_SEGMENTS = 2

export function splitIncrementalMarkdown(
  content: string,
  settled: boolean
): IncrementalMarkdownSegment[] {
  if (!content) return []
  if (settled) {
    return [{ id: "document", content, stable: true }]
  }

  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  let offset = 0
  let fence: "`" | "~" | null = null

  for (const lineWithEnding of content.match(/.*(?:\n|$)/g) ?? []) {
    if (!lineWithEnding) continue
    const line = lineWithEnding.replace(/\n$/, "")
    const trimmed = line.trimStart()
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~"
      if (fence === marker) fence = null
      else if (fence === null) fence = marker
    }

    offset += lineWithEnding.length
    if (fence === null && line.trim().length === 0 && offset > start) {
      ranges.push({ start, end: offset })
      start = offset
    }
  }

  if (start < content.length) ranges.push({ start, end: content.length })
  if (ranges.length === 0) ranges.push({ start: 0, end: content.length })

  const stableBefore = Math.max(0, ranges.length - UNSTABLE_TAIL_SEGMENTS)
  return ranges.map((range, index) => ({
    id: `segment-${range.start}`,
    content: content.slice(range.start, range.end),
    stable: index < stableBefore,
  }))
}
