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

export class IncrementalMarkdownProjector {
  private previousContent = ""
  private previousSegments: IncrementalMarkdownSegment[] = []
  lastScannedCharacters = 0

  project(content: string, settled: boolean) {
    if (!content) {
      this.previousContent = ""
      this.previousSegments = []
      this.lastScannedCharacters = 0
      return []
    }
    if (settled) {
      const segments = splitIncrementalMarkdown(content, true)
      this.previousContent = content
      this.previousSegments = segments
      this.lastScannedCharacters = content.length
      return segments
    }

    const canReuse =
      this.previousContent.length > 0 &&
      this.previousSegments[0]?.id !== "document" &&
      content.startsWith(this.previousContent)
    const stablePrefix = canReuse
      ? this.previousSegments.filter((segment) => segment.stable)
      : []
    const stableEnd = stablePrefix.reduce(
      (length, segment) => length + segment.content.length,
      0
    )
    const tail = content.slice(stableEnd)
    this.lastScannedCharacters = tail.length
    const tailSegments = splitIncrementalMarkdown(tail, false).map((segment) => ({
      ...segment,
      id: `segment-${stableEnd + Number(segment.id.slice("segment-".length))}`,
    }))
    const segments = [...stablePrefix, ...tailSegments]
    this.previousContent = content
    this.previousSegments = segments
    return segments
  }
}
