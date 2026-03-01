import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type AgentInfo,
  type AgentState,
  type EventLog,
  type Message,
  type StreamEvent,
  connectWorldStream,
  listAgents,
  listEvents,
  listPendingHumanMessages,
} from "@/lib/world-api"

type WorldDashboardState = {
  isLoading: boolean
  error: string | null
  agents: AgentInfo[]
  events: EventLog[]
  pendingHumanMessages: Message[]
  streamEvents: StreamEvent[]
  streamConnected: boolean
  refresh: () => Promise<void>
}

function getAgentState(agent: AgentInfo): AgentState | null {
  return agent.status ?? null
}

function isToday(isoDate: string) {
  const date = new Date(isoDate)
  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function useWorldDashboardData(): WorldDashboardState {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [events, setEvents] = useState<EventLog[]>([])
  const [pendingHumanMessages, setPendingHumanMessages] = useState<Message[]>([])
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [streamConnected, setStreamConnected] = useState(false)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const [agentsResult, eventsResult, messagesResult] = await Promise.allSettled([
      listAgents(),
      listEvents(),
      listPendingHumanMessages(),
    ])

    if (agentsResult.status === "fulfilled") {
      setAgents(agentsResult.value)
    }

    if (eventsResult.status === "fulfilled") {
      setEvents(eventsResult.value)
    }

    if (messagesResult.status === "fulfilled") {
      setPendingHumanMessages(messagesResult.value)
    }

    const errors = [agentsResult, eventsResult, messagesResult]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason)

    if (errors.length > 0) {
      setError("部分 World 数据加载失败，请确认后端服务与接口可用。")
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const disconnect = connectWorldStream({
      onEvent: (event) => {
        setStreamConnected(true)
        setStreamEvents((prev) => [event, ...prev].slice(0, 30))

        if (event.event === "AgentCreated" || event.event === "AgentDeleted") {
          void listAgents().then(setAgents).catch(() => undefined)
        }

        if (event.event === "NewMessage") {
          void listPendingHumanMessages().then(setPendingHumanMessages).catch(() => undefined)
        }

        if (event.event === "AgentStatusChanged") {
          void listEvents().then(setEvents).catch(() => undefined)
        }
      },
      onError: () => {
        setStreamConnected(false)
      },
    })

    return () => {
      disconnect()
    }
  }, [])

  return useMemo(
    () => ({
      isLoading,
      error,
      agents,
      events,
      pendingHumanMessages,
      streamEvents,
      streamConnected,
      refresh,
    }),
    [agents, error, events, isLoading, pendingHumanMessages, refresh, streamConnected, streamEvents]
  )
}

export function useWorldDashboardSummary() {
  const state = useWorldDashboardData()

  const summary = useMemo(() => {
    const states = state.agents
      .map(getAgentState)
      .filter((value): value is AgentState => value !== null)

    const totalAgents = state.agents.length
    const runningAgents = states.filter((value) => value === "running").length
    const busyAgents = states.filter((value) => value === "busy").length
    const idleAgents = states.filter((value) => value === "idle").length
    const errorAgents = states.filter((value) => value === "error").length
    const persistentAgents = state.agents.filter((item) => item.run_mode === "persistent").length
    const onDemandAgents = state.agents.filter((item) => item.run_mode === "on_demand").length
    const plannerAgents = state.agents.filter((item) => item.agent_type === "planner").length
    const workerAgents = state.agents.filter((item) => item.agent_type === "worker").length

    const totalEvents = state.events.length
    const todayEvents = state.events.filter((item) => isToday(item.created_at)).length
    const latestEvent = state.events[0]
    const latestStream = state.streamEvents[0]
    const pendingHumanMessages = state.pendingHumanMessages.length

    return {
      totalAgents,
      runningAgents,
      busyAgents,
      idleAgents,
      errorAgents,
      persistentAgents,
      onDemandAgents,
      plannerAgents,
      workerAgents,
      totalEvents,
      todayEvents,
      latestEvent,
      latestStream,
      pendingHumanMessages,
    }
  }, [
    state.agents,
    state.events,
    state.pendingHumanMessages.length,
    state.streamEvents,
  ])

  return {
    ...state,
    summary,
  }
}
