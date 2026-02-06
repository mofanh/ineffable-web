import React, { useEffect, useState } from 'react'

import { getConfig } from '../../api/services'
import type { ConfigResponse } from '../../types'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import McpManager from './McpManager'

interface ConfigPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceUrl?: string
}

export default function ConfigPanel({ open, onOpenChange, serviceUrl }: ConfigPanelProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<ConfigResponse | null>(null)

  useEffect(() => {
    if (!open) return

    if (!serviceUrl) {
      setConfig(null)
      setError('请先选择一个会话以加载配置。')
      return
    }

    let mounted = true
    setLoading(true)
    setError(null)

    getConfig(serviceUrl)
      .then((data) => {
        if (!mounted) return
        setConfig(data)
      })
      .catch((err) => {
        if (!mounted) return
        setError((err as Error).message)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [open, serviceUrl])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>配置面板</SheetTitle>
          <SheetDescription>查看当前服务的运行配置与 MCP 状态。</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 px-4 pb-6">
          {loading && (
            <div className="text-sm text-muted-foreground">加载配置中…</div>
          )}
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {config && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>项目信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">名称</span>
                    <span className="text-foreground">{config.project.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">版本</span>
                    <span className="text-foreground">{config.project.version}</span>
                  </div>
                  <div className="text-muted-foreground">{config.project.description}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>LLM 配置</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Provider</span>
                    <span className="text-foreground">{config.llm.provider}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Model</span>
                    <span className="text-foreground">{config.llm.model}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Streaming</span>
                    <span className="text-foreground">{config.llm.stream ? '启用' : '关闭'}</span>
                  </div>
                </CardContent>
              </Card>

              <McpManager mcpEnabled={config.mcp_enabled} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
