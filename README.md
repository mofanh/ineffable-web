# Ineffable Web

当前前端已切换为「仅 Gateway Chat 生效」模式：

- 控制台各页面保留路由与静态说明。
- 唯一在线后端交互能力是右侧栏 Chat。
- Chat 通过 Gateway HTTP + SSE + Poll 接口实现。

## 当前生效的数据链路

1. 发送消息：`POST /gateway/v1/chat`（`stream=true`）
2. 流式接收：SSE `text/event-stream`
3. 补偿拉取：`GET /gateway/v1/channels/poll`

与 `FRONTEND_DEVELOPMENT_GUIDE.md` 一致，浏览器前端不直接使用 channel 插件进程协议。

## 环境变量

Gateway 基地址支持以下变量（二选一）：

- `VITE_GATEWAY_API_BASE_URL`
- `VITE_API_BASE_URL`

示例：

```bash
VITE_GATEWAY_API_BASE_URL=http://localhost:8080
```

如果不设置，默认同源请求。

## 目录说明（layers）

- 视图组件：`src/components/right-sidebar/chat/`
- Gateway Chat API：`src/lib/api/chat/gateway-api.ts`

## 已下线能力说明

以下旧能力已从前端移除，不再作为当前运行依赖：

- 旧 world API 平铺接口
- 旧 CLI 直连运行时接口

如后续恢复相关功能，建议按新 feature 单独设计并接入，不回退到旧接口平铺方案。
