// ============ 服务器选择器组件 ============

import React from 'react'
import { 
  Server as ServerIcon, 
  Plus, 
  ChevronDown, 
  Wifi, 
  WifiOff,
  Link2
} from 'lucide-react'
import { cn } from '../../../utils/cn'
import type { Server, ConnectionType } from '../../types'
import type { ServerSelectorProps } from './types'

export function ServerSelector({ 
  servers, 
  selectedServer, 
  loadingServers, 
  showDropdown, 
  onToggleDropdown, 
  onSelectServer, 
  onAddServer 
}: ServerSelectorProps) {
  return (
    <div className="p-3 border-b border-border/50">
      <div className="relative">
        <button
          onClick={onToggleDropdown}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-2">
            <ServerIcon className="size-4 text-muted-foreground" />
            {selectedServer ? (
              <>
                <span className="text-sm font-medium truncate max-w-35">{selectedServer.name}</span>
                {selectedServer.status === 'online' ? (
                  <Wifi className="size-3 text-success" />
                ) : (
                  <WifiOff className="size-3 text-destructive" />
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">选择服务器</span>
            )}
          </div>
          <ChevronDown className={cn("size-4 transition-transform", showDropdown && "rotate-180")} />
        </button>

        {/* Server Dropdown */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
            {servers.map(server => (
              <button
                key={server.id}
                onClick={() => onSelectServer(server)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors text-left",
                  selectedServer?.id === server.id && "bg-muted"
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {server.connectionType === 'direct' ? (
                    <Link2 className="size-3 text-primary shrink-0" />
                  ) : (
                    <ServerIcon className="size-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm truncate">{server.name}</span>
                </div>
                {server.status === 'online' ? (
                  <Wifi className="size-3 text-success shrink-0" />
                ) : (
                  <WifiOff className="size-3 text-muted-foreground shrink-0" />
                )}
              </button>
            ))}
            <div className="border-t border-border">
              <button
                onClick={onAddServer}
                className="w-full flex items-center gap-2 px-3 py-2 text-primary hover:bg-muted transition-colors text-sm"
              >
                <Plus className="size-4" />
                添加服务器
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
