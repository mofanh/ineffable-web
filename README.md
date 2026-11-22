# Ineffable Web

## 开发访问

`npm run dev` 保持 HTTP 启动。通过局域网 HTTP 地址访问时，若浏览器缺少发送所需的安全上下文功能，点击发送会显示统一 toast，提示使用 HTTPS；本机可通过 localhost 访问。检查失败时保留草稿，不创建会话或进入发送中状态。

当前前端采用会话优先工作台：

- 默认 `/chat` 展示中央会话；左侧提供会话搜索、新建、运行状态与工作区导航。
- 文件深链打开旁侧资源，保留编辑、版本与工作区管理；窄屏在会话/资源之间切换，不卸载聊天和当前资源宿主。
- 会话选择只改变查看对象，不隐式停止后台运行；聊天继续复用 Gateway 的唯一 runtime、reducer 和 store。
- 视觉参考 DSH 的低噪音导航与平整主画布，保留 Ineffable 品牌，不依赖 DSH 运行时。
- 布局与状态边界见 [工作台开发规范](FRONTEND_DEVELOPMENT_GUIDE.md#36-会话优先工作台)。本地串行门禁：`npm run check:conversation-workbench`；mock HTTP 浏览器结果不能替代真实后端/provider 或移动设备验收。

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

- 工作台壳层与路由：`src/app/`
- 会话视图、runtime 与投影：`src/features/chat/`
- 工作区树与导航：`src/features/workspace/`

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
