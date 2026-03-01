# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

## World API 配置

World 控制台页面会调用以下接口：

- `GET /api/agents`
- `GET /api/events`
- `GET /api/messages/human/pending`
- `GET /api/stream` (SSE)

可通过环境变量配置后端地址（两者任选其一）：

- `VITE_WORLD_API_BASE_URL`
- `VITE_API_BASE_URL`

示例：

```bash
VITE_WORLD_API_BASE_URL=http://localhost:8080
```

若未设置，则默认使用当前站点同源地址。
