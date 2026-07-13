import type { Extension } from "@codemirror/state"
import CodeMirror from "@uiw/react-codemirror"
import * as React from "react"

import type { WorkspaceObject } from "@/features/workspace/api/workspace-api"

export function WorkspaceCodeEditor({
  object,
  value,
  onChange,
}: {
  object: WorkspaceObject | null
  value: string
  onChange: (value: string) => void
}) {
  const [languageExtensions, setLanguageExtensions] = React.useState<Extension[]>(
    []
  )

  React.useEffect(() => {
    let cancelled = false
    setLanguageExtensions([])

    void loadLanguageExtensions(object)
      .then((extensions) => {
        if (!cancelled) {
          setLanguageExtensions(extensions)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLanguageExtensions([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [object])

  return (
    <CodeMirror
      value={value}
      height="100%"
      basicSetup={{
        foldGutter: true,
        lineNumbers: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
      }}
      extensions={languageExtensions}
      onChange={onChange}
      className="h-full min-h-[560px] text-sm [&_.cm-editor]:min-h-[560px] [&_.cm-scroller]:font-mono"
    />
  )
}

async function loadLanguageExtensions(
  object: WorkspaceObject | null
): Promise<Extension[]> {
  const name = object?.name.toLowerCase() ?? ""
  const mimeType = object?.mime_type?.toLowerCase() ?? ""

  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    const { markdown } = await import("@codemirror/lang-markdown")
    return [markdown()]
  }
  if (name.endsWith(".html") || name.endsWith(".htm") || mimeType.includes("html")) {
    const { html } = await import("@codemirror/lang-html")
    return [html()]
  }
  if (name.endsWith(".json") || mimeType.includes("json")) {
    const { json } = await import("@codemirror/lang-json")
    return [json()]
  }
  if (
    name.endsWith(".js") ||
    name.endsWith(".jsx") ||
    name.endsWith(".ts") ||
    name.endsWith(".tsx") ||
    mimeType.includes("javascript")
  ) {
    const { javascript } = await import("@codemirror/lang-javascript")
    return [
      javascript({
        jsx: true,
        typescript: name.endsWith(".ts") || name.endsWith(".tsx"),
      }),
    ]
  }

  return []
}
