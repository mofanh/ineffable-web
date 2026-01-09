import type { Server, Service, Session } from '../../types'

export default function ChatHeader({
  server,
  service,
  session,
}: {
  server: Server
  service: Service
  session: Session | null
}) {
  return (
    <header className="flex-none h-14 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 flex items-center justify-center z-10">
      <div className="flex flex-col items-center text-center">
        <h1 className="font-medium text-base text-foreground">
          {session?.name || (session ? `会话 ${session.id.slice(0, 8)}` : service.name)}
        </h1>
        <span className="text-xs text-muted-foreground">
          {service.name} • {server.name}
        </span>
      </div>
    </header>
  )
}
