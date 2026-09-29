import * as React from "react"

/** Freeze ownership of UI effects across awaits; the server operation can still settle. */
export function useActionScope(scope: string) {
  const active = React.useRef<object | null>(null)
  React.useLayoutEffect(() => {
    active.current = {}
    return () => { active.current = null }
  }, [scope])
  return React.useCallback(() => {
    const owner = active.current
    return () => owner !== null && active.current === owner
  }, [])
}
