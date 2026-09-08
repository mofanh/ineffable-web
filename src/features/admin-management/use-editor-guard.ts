import * as React from "react"
import { getCurrentAuthSessionId } from "@/lib/api/auth-session-runtime"

/** Scope all editor loads and writes to the opening and authenticated session. */
export function useEditorGuard(sessionId: string | null) {
  const currentSession = React.useRef(sessionId)
  React.useLayoutEffect(() => { currentSession.current = sessionId }, [sessionId])
  const openingSession = React.useRef(sessionId)
  const generation = React.useRef(0)
  const busy = React.useRef(false)
  React.useEffect(() => () => { generation.current += 1 }, [])
  return React.useMemo(() => ({
    begin() { busy.current = false; openingSession.current = currentSession.current; generation.current += 1 },
    close() {
      if (busy.current) return false
      generation.current += 1
      return true
    },
    capture() {
      const expectedGeneration = generation.current
      const expectedSession = openingSession.current
      return () => expectedGeneration === generation.current && expectedSession === currentSession.current && expectedSession === getCurrentAuthSessionId()
    },
    startSave() {
      if (busy.current || openingSession.current !== getCurrentAuthSessionId()) return false
      busy.current = true
      return true
    },
    finishSave() { busy.current = false },
  }), [])
}
