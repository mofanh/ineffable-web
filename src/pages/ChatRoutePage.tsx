import React from 'react'
import { useParams } from 'react-router-dom'
import MainPage from './MainPage'

export default function ChatRoutePage() {
  const { serverId, serviceId, sessionId } = useParams<{
    serverId?: string
    serviceId?: string
    sessionId?: string
  }>()

  return (
    <MainPage
      initialServerId={serverId}
      initialServiceId={serviceId}
      initialSessionId={sessionId}
    />
  )
}
