# Ineffable Frontend 开发文档（基于 frontend channel）

## 1. 目标与范围

本文件面向 Web 前端开发，说明在对接 Ineffable 网关与 frontend channel 时需要遵循的协议、推荐页面组件、以及交互效果要求。

关键结论：
- 浏览器前端应优先对接 Gateway HTTP + SSE 接口。
- frontend channel 插件是网关内部的消息 broker/runtime，不建议浏览器直接使用其进程协议。
- 前端 UI 建议采用“主流式输出 + 子代理分组输出 + 轮询补偿”的组合方案。

## 2. 后端架构中的协议分层

### 2.1 浏览器直接使用（必须实现）

1. HTTP JSON 请求协议
2. SSE 流式响应协议（text/event-stream）
3. 频道消息轮询协议（channels/poll）

### 2.2 网关内部使用（了解即可）

1. channel process 协议（stdin/stdout JSON frame）
2. frontend runtime 的 BrokerPoll/BrokerPublish 调用

说明：这层是插件进程与网关的内部边界，不是浏览器 API。

### 2.3 认证请求与静默续期

1. 需要登录态的 HTTP JSON、SSE、流式发送和沙箱预览请求必须通过 `requestApi` / `requestApiJson` 发起，不在 feature 或 page 中直接调用 `fetch`。
2. 请求层始终读取认证运行时中的最新 access token；收到 401 或明确的 access token 过期响应时，只触发一次 refresh，并使用新 token 重试原请求一次。
3. 同一标签页的并发续期复用一个 in-flight Promise；支持 Web Locks 的浏览器还会在标签页之间串行化 refresh，避免 refresh token 轮换竞态。
4. `AppSessionProvider` 持久化 access/refresh token 的到期时间，并在 access token 到期前、页面重新可见、窗口重新聚焦或网络恢复时静默续期。
5. refresh 成功必须同时更新 React session 和 localStorage。access token 最后写入 localStorage，作为其他标签页读取完整 token 集合的同步信号。
6. refresh token 明确无效或续期后重试仍然未授权时才清理会话。网络中断、超时或服务端临时错误不得清理本地登录态，应在页面恢复或网络恢复后重试。
7. 认证过期流程不得调用 `window.location.reload()`；页面状态由 session 与路由自然恢复或进入登录页。
8. 流式连接建立时支持静默续期；已经建立的 SSE 连接不因本地 token 到期主动断开，断线重连时使用最新 token 和原有事件游标。

## 3. 前端必须包含的组件与效果

### 3.1 会话绑定区（Session Bind Panel）

组件建议：
1. peer_id 输入框
2. 绑定按钮
3. 当前状态标签（未绑定/等待首条回复/已获得 session_key）

效果要求：
1. 用户输入 peer_id 后，进入绑定状态。
2. 在流式事件中收到 session_key 事件后，自动记录 session_key。
3. 状态栏实时显示当前会话上下文。

### 3.2 输入与发送区（Composer）

组件建议：
1. 多行文本输入框
2. 发送按钮
3. 清空日志按钮

效果要求：
1. 点击发送后调用 /gateway/v1/chat，并在请求体中传 stream=true。
2. 在请求进行期间保持可视化反馈（发送中、失败提示）。
3. 清空日志后不影响会话绑定状态，除非用户切换 peer_id。

### 3.3 主代理输出区（Main Agent Panels）

组件建议：
1. Token 流面板
2. Tool 调用流面板
3. Tool 结果/最终消息面板

效果要求：
1. 按事件类型分流显示：text_delta/reasoning_delta、tool_call*、final/message。
2. 对 delta 类事件进行增量拼接，而不是逐行刷屏。
3. 在流读取结束或收到 message 事件后，关闭对应流片段的增量拼接状态。

### 3.4 子代理输出区（Sub Agent Groups）

组件建议：
1. 按 subagent_id 动态分组容器
2. 每组内三栏日志：Token、Tool、Final

效果要求：
1. 当 metadata.scope=sub 或 metadata.subagent_id 存在时自动归组。
2. 同一 subagent 的流式片段应连续追加。
3. 不同 subagent 互不串流。

### 3.5 轮询补偿机制（Poll Recovery）

组件建议：
1. 页面可见性监听（visibilitychange/focus）
2. 网络恢复监听（online）
3. 轮询状态指示

效果要求：
1. 初次绑定 session_key 后拉取一次 session_key::main 与 session_key::sub。
2. 用户回到页面或网络恢复后再触发一次补偿拉取。
3. 对重复消息做幂等处理（按 event/tool_call_id/time 组合键去重）。

### 3.6 会话优先工作台

默认 `/chat` 以会话为中心，不另设 Agent mode；文件深链和后端执行链保持不变。

#### 3.6.1 页面信息架构

1. 左栏优先展示会话搜索、新建和既有 runtime 状态，保留工作区树、管理导航与账户入口。
2. 中央会话承载 transcript、执行过程与 composer；导航 portal 复用唯一 Gateway runtime 的 guarded selection/new/refresh 回调，不建立第二份状态或订阅。
3. 文件深链 `/workspace/:workspaceId/objects/:objectId?` 打开旁侧资源，管理路由默认专注资源。切换会话不隐式停止后台 run。
4. 同一认证 session 内聊天始终在同一位置挂载；资源 Outlet 隐藏或专注切换也不卸载，保留聊天草稿、附件与未保存文件编辑。

结构：

```
App Shell
|- Navigation
|  |- Conversations (portal from the single runtime)
|  |- Workspace Tree / Management / Account
|- Central Conversation (persistent)
|  |- Transcript / Execution / Composer
|- Contextual Resource (persistent Outlet)
   |- File editor / Management routes
```

#### 3.6.2 布局规格

1. 视口高度使用 svh；紧凑布局跟随 visualViewport 高度与偏移，保证软键盘下输入区可见。
2. 桌面左栏沿用 256px 可折叠导航；资源约占内容区 44%，可专注资源或隐藏；会话使用剩余宽度。
3. 小于 1024px 时会话与资源互斥显示，导航使用抽屉；选择会话时关闭抽屉并显露同一聊天实例。跨断点保留最近交互的会话/资源面，确保设置等 portal 不悬在已隐藏的所属面板之外；新资源路由仍先展示目标资源。
4. 不读取旧右栏 open/width 偏好决定会话可用性，不保留另一套 Agent mode。
5. check:workbench-layout 在开发和 --production 下验证单实例、草稿、路由/专注/宽度切换、EN/ZH 与 light/dark。真实后端/provider 和真实移动端软键盘仍需人工验收。

#### 3.6.3 组件职责与状态边界

- AppShell 只拥有路由资源的显示/专注和导航容器，不持有 run 或会话副本。
- ChatWorkbench 延迟加载 GatewayChatSidebar；会话导航通过 portal 放入 AppSidebar。导航只过滤和展示，选择/新建/刷新调用既有受控命令。
- AppSidebar 继续拥有唯一工作区树与管理入口；文件、自动化、设置和系统管理继续使用既有路由组件。
- Gateway runtime、canonical timeline reducer、run store 和 renderer registry 继续独占聊天投影。不得按布局建立额外订阅、全会话详情 N+1 或第二个 composer。
- 选中会话与执行所有权不同。导航、隐藏、专注和窗口变化不能隐式 Stop；会话身份变化仍使用原 generation/session fence。
- 图片引用沿用 request/probe、preventDefault 和接收端 readiness 协议；只在接收端确认后显露中央会话，壳层不缓存待投递附件。

#### 3.6.4 交互、视觉与验证

- EN/ZH 文案使用同构 i18n key；light/dark 沿用现有语义主题变量。浏览器 fixture 使用主题提供者的 `theme` 存储键，并断言实际根节点主题。
- 显示资源、隐藏资源、专注资源和返回会话均有明确可访问名称。会话/编辑器不应为了布局动效重新挂载；紧凑导航沿用既有 Sheet 的焦点恢复与 Escape 行为。
- 资源标题保留完整 breadcrumb 投影及祖先 path 链接，不以最后一级 label 替代目录导航；工作区生命周期门禁覆盖父目录跳转、权限失效、归档/恢复和未保存编辑保护。
- `check:workbench-layout` 在开发和 production 下验证视口边界、单实例、草稿、路由、导航搜索/选择/新建及主题；`check:shell-performance` 保留导航开合预算与图片引用在延迟加载、换会话、换身份、源卸载和超时下的 fencing 回归。
- `check:automation-runtime` 验证窄资源列，`check:toast` 验证中央会话及紧凑导航模态层的通知可操作性；管理端 editor/mobile fixture 禁用 watcher/HMR，避免源文件编辑触发页面刷新干扰行为断言。
- `npm run check:conversation-workbench` 串行执行本工作台确定性门禁（含 production artifacts 和受影响的认证/工作区检查），避免多个浏览器门禁争抢帧预算。
- 本地 HTTP fixture 不代替真实后端/provider、生产部署、移动设备软键盘及后台长任务的端到端人工验收。

## 4. 网关接口规范（前端必读）

## 4.1 POST /gateway/v1/chat（stream=true）

用途：主聊天入口，返回 SSE 流。

请求体：
- channel: string，建议 web
- account_id: string | null，建议 default
- peer_id: string | null，会话绑定维度
- guild_id: string | null
- content: string，用户输入
- stream: bool，必须为 true
- auto_reply: bool | null，前端建议 false（由前端自己渲染回复）
- reply: object | null（通常前端无需传）

响应：
- Content-Type: text/event-stream
- 每个 SSE 事件 data 为 JSON 字符串

SSE data 结构：
1. 增量事件
   - type: delta
   - event: GatewayChatStreamEvent
2. 异常事件
   - type: error
   - error: string

GatewayChatStreamEvent 字段：
- event: string，例如 message、text_delta、reasoning_delta、tool_call_delta、final
- scope: string，main 或 sub
- role: string，assistant、tool_call、tool 等
- content: string
- metadata: object | null

状态码：
- 200: 成功建立流
- 流内 error 事件: 业务失败（例如 chat pipeline failed）

## 4.2 POST /gateway/v1/chat

用途：非流式聊天（一次性返回）。

请求体：同 4.1，但 stream=false。

响应体：
- output: string
- session_key: string
- agent_id: string
- send_result: ChannelSendResult | null

常见错误：
- 501: 未配置 chat handler
- 502: chat pipeline failed

## 4.3 GET /gateway/v1/channels/poll

用途：轮询 frontend channel 消息。

查询参数：
- channel: string，必填
- max: number，可选，默认 50，最大 200

响应体：
- messages: FrontendMessage[]

FrontendMessage 字段：
- channel: string
- to: string | null
- content: string
- metadata: object | null
- timestamp_ms: number

建议频道命名：
- 主流: session_key::main
- 子代理: session_key::sub

## 4.4 POST /gateway/v1/channels/send

用途：通过网关向指定 channel runtime 发送消息。

请求体 ChannelSendRequest：
- channel: string | null，建议显式传 frontend
- mode: string，平台模式（frontend 相关场景可由后端约定）
- target_id: string，目标频道或目标实体
- content: string
- metadata: object | null
- dry_run: bool
- msg_id: string | null
- event_id: string | null
- msg_seq: number | null

响应体 ChannelSendResult：
- ok: bool
- detail: string
- event_message: string | null

状态码：
- 200: ok=true
- 502: ok=false 或 channel sender 调用失败

## 4.5 GET /events

用途：网关全局事件总线（SSE）。

事件类型（type 字段）：
- session_changed
- subagent_spawned
- subagent_progress
- subagent_ended
- agent_message
- agent_completed
- agent_error
- ping

建议：该流用于全局状态看板，不替代 /gateway/v1/chat (stream=true) 主数据流。

## 5. frontend channel 插件行为约束

1. 队列模型
- 每个 channel 独立队列。
- 超过 queue_limit 后丢弃最旧消息（FIFO 截断）。

2. queue_limit 默认值
- 默认 100（runtime config 未提供时）。

3. poll 语义
- poll 会消费队列消息（取出即移除）。

4. 插件别名
- builtin:frontend
- frontend

5. 插件进程协议（内部）
- frame.type: request/response
- method: init/start/stop/send/health/broker_poll/broker_publish

## 6. 前端实现建议（可直接落地）

### 6.1 状态模型

建议至少维护：
1. peerId
2. sessionKey
3. mainLogs: token/tool/final
4. subLogs: Map<subagent_id, token/tool/final>
5. streamStatus: idle/streaming/error
6. pollStatus: active/stopped

### 6.2 事件归类规则

建议优先级：
1. event 以 text_delta/reasoning_delta 结尾 -> Token 面板
2. event 以 tool_call 开头 -> Tool 面板
3. 其他 -> Final 面板
4. metadata.scope=sub -> 子代理分组
5. metadata.tool_call_id 存在 -> 按 tool_call_id 聚合增量

### 6.3 可靠性与体验

1. SSE 断线后，在页面回到前台或网络恢复时触发一次补偿轮询。
2. 轮询与流式并行时做去重。
3. 在流结束（reader done）或收到 message 事件后将本轮状态标记为 completed。
4. 对错误事件提供可重试入口。

### 6.4 Agent 内建交互工具

1. 通用工具调用使用统一 shell 承担名称、状态、折叠和未知工具 fallback；工具专用内容通过 chat feature 内的 renderer registry 注入，不在通用 shell 中堆叠工具名判断。
2. `update_plan` 是会话级执行状态：从当前会话最新工具状态派生并展示在 composer 上方，不按普通工具 JSON 在消息流中重复展示。
3. `request_user_input` 使用结构化问题卡收集答案；提交后将可读答案作为下一条普通用户消息走现有 conversation send。工具调用及结果已经保留问题上下文，不调用 `/gateway/v1/runs/resume`；该接口仅用于 approval 等真正可恢复的 run。
4. waiting 状态应优先读取 tool result content 中的 `status=waiting` / `blocking_need`；transport metadata 的 success 只表示工具成功产生了等待状态，不能覆盖 human need。
5. 历史消息中的 waiting 工具只有在当前会话仍允许继续输入时才可提交；本地提交后立即标记已回答，历史重建时将紧随问题工具的下一条用户消息恢复为答案，避免重复发送或刷新后丢失选择状态。

## 7. 联调检查清单

1. 能否从 /gateway/v1/chat (stream=true) 收到 delta/error（event 内可含 message）。
2. 是否在 session_key 事件中拿到 session_key 并持久化。
3. 是否成功轮询到 session_key::main 与 session_key::sub。
4. 工具调用是否被正确归档到 Tool 面板。
5. 子代理输出是否按 subagent_id 正确分组。
6. 当后端返回 502/501 时，前端是否给出可读错误。

## 8. 代码依据

协议与行为来自以下实现：
- crates/plugin/channels/frontend/src/lib.rs
- crates/plugin/channels/frontend/src/bin/ineffable-channel-frontend.rs
- crates/plugin/plugin/src/process_protocol.rs
- crates/gateway/gateway-traits/src/lib.rs
- crates/gateway/gateway/src/methods.rs
- crates/gateway/gateway/src/event.rs
