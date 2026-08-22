type JsonObject = Record<string, unknown>

function parseJsonObject(value: string | null | undefined): JsonObject | null {
  if (!value?.trim()) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : null
  } catch {
    return null
  }
}

export function parseLeadingJsonObject(value: string | null | undefined) {
  const direct = parseJsonObject(value)
  if (direct || !value) return direct

  const source = value.trimStart()
  if (!source.startsWith("{")) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === "{") depth += 1
    else if (character === "}") {
      depth -= 1
      if (depth === 0) return parseJsonObject(source.slice(0, index + 1))
    }
  }
  return null
}
