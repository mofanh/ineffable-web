import React, { useState } from 'react'
import type { Server } from '../types'
import ServerList from '../components/ServerList'
import ServiceList from '../components/ServiceList'

export default function HomePage() {
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)

  return (
    <div className="h-full flex">
      {/* 左侧 - 服务器列表 */}
      <div className="w-80 border-r border-border flex-shrink-0">
        <ServerList onServerSelect={setSelectedServer} selectedServerId={selectedServer?.id} />
      </div>

      {/* 右侧 - 服务列表 */}
      <div className="flex-1">
        {selectedServer ? (
          <ServiceList server={selectedServer} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <p>请选择一个服务器</p>
          </div>
        )}
      </div>
    </div>
  )
}
