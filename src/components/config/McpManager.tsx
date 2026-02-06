import React from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

export default function McpManager({ mcpEnabled }: { mcpEnabled: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle> M C P 管理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-foreground">状态</span>
          <span className={mcpEnabled ? 'text-green-600' : 'text-muted-foreground'}>
            {mcpEnabled ? '已启用' : '未启用'}
          </span>
        </div>
        <p>
          当前版本仅支持查看 MCP 开关状态。服务列表与权限策略请在配置文件中管理，
          后续将补充前端管理能力。
        </p>
      </CardContent>
    </Card>
  )
}
