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

### Workspace upload proxy

`nginx.conf` allows a 40 MiB request body under `/gateway/`, including multipart
encoding overhead around the backend's 32 MiB file limit. The host reverse proxy
must allow at least this request size too. Rebuild the frontend image after changing
this configuration; editing only a running container is not persistent. Sandbox
`exports/upload` uses Provider credentials and a bound single-use upload grant,
not the user's login token. Preserve request headers through both proxy layers.

## 对话信息展示

- 回答底栏保留常用操作和模型名；Sandbox、Agent 版本、能力和耗时等运行信息按需展开，窄屏不依赖横向滚动条。
- 文件产物卡片默认显示文件类型和大小，完整 MIME 与版本在详情中保留。
- 自动任务仅依据 Gateway `input_progress.automation_source` 折叠为名称、摘要与可展开的原始指令；普通用户文本不能通过文字前缀冒充任务来源。实时与历史共用输入进度投影。
- 回答和代码复制共用剪贴板反馈；用户可见标签使用中英文资源，日期遵循应用语言。
- `npm run check:chat-browser` 包含移动端信息栏、自动任务原文、产物详情、复制反馈及语言切换回归。

## 可选前端观测

OpenPanel 浏览器配置见 [.env.example](.env.example)，完整事件口径、隐私边界和测试方式见
[前端观测包](src/lib/telemetry/README.md)。默认关闭；只填公开 client ID，禁止将后端 secret 放进 VITE 变量。
