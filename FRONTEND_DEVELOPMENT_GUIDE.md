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

### 3.6 基于 moxt.ai 的 UI 设计方案（建议稿）

本节是基于页面 https://moxt.ai/w/hvsb8xkr 的结构观察，结合本仓库现有组件体系给出的落地设计方案。

#### 3.6.1 页面信息架构

1. 全局采用三栏工作台模型。
2. 左栏承担导航与工作区上下文。
3. 中栏承担主内容视图切换。
4. 右栏承担聊天与会话输入，不随左侧菜单切换而消失。

建议结构：

```
App Shell
|- Left Sidebar
|  |- Main Menu (AI Teammates / Automation / Skills, Rules, Memory / Inbox)
|  |- Workspace Tree (Team Space / Personal Space / GitHub)
|- Center Workspace
|  |- Active View Header
|  |- Active View Content
|- Right Chat Panel
   |- Top Actions (New Chat)
   |- Conversation Area
   |- Composer
```

#### 3.6.2 桌面布局规格

1. 视口高度：100vh。
2. 左栏宽度：256px（固定）。
3. 中栏宽度：flex-1，最小 520px。
4. 右栏宽度：380px（固定，允许 340px 到 420px 之间可调）。
5. 主栏之间使用 1px 分隔线，颜色为边框弱对比色。

建议 Tailwind 栅格表达：

```
grid-cols-[256px_minmax(520px,1fr)_380px]
```

#### 3.6.3 视觉风格与 Token

建议保留轻量、信息密度高的工作台风格，避免大面积高饱和色块。

建议 Token：
1. --bg-app: #f6f8fb
2. --bg-panel: #ffffff
3. --bg-subtle: #f1f4f8
4. --border-soft: #e6ebf2
5. --text-primary: #0f172a
6. --text-secondary: #475569
7. --text-muted: #64748b
8. --accent: #0ea5e9
9. --accent-soft: #e0f2fe
10. --success: #10b981
11. --warning: #f59e0b
12. --danger: #ef4444

排版建议：
1. 主字体使用 Inter Variable（与现有依赖一致）。
2. 导航项字号 13 到 14px，行高 20 到 22px。
3. 日志正文 13px，代码与元信息 12px。

#### 3.6.4 组件清单与职责（按 moxt 结构映射）

1. AppShell
   - 职责：三栏容器、全局背景、响应式切换。
2. LeftNavMenu
   - 职责：顶部四个主菜单切换。
3. WorkspaceTree
   - 职责：分组树与文件条目展示（含行级按钮）。
4. CenterViewSwitcher
   - 职责：根据主菜单切换中栏内容。
5. TeammatesView
   - 职责：展示 Agent 模板卡片与创建入口。
6. AutomationView
   - 职责：Cron/Webhook 子筛选和任务列表。
7. SkillsRulesMemoryView
   - 职责：三段式切换（可先用分段按钮实现）。
8. InboxDrawer
   - 职责：通知抽屉（空态、加载态、错误态）。
9. RightChatPanel
   - 职责：会话区 + New Chat 触发 + 输入区。
10. NewChatPicker
    - 职责：会话检索与快速切换（Combobox）。
11. MainAgentLogs
    - 职责：主代理 token/tool/final 三路日志。
12. SubAgentGroups
    - 职责：按 subagent_id 动态分组展示日志。

#### 3.6.5 关键交互流程

1. 主菜单切换
   - 点击左栏主菜单后，中栏视图切换，右栏保持不变。
2. Inbox 交互
   - 采用左侧滑出抽屉，不打断中栏上下文。
3. New Chat
   - 右栏顶部按钮触发会话选择弹层。
4. 流式日志
   - text_delta 和 reasoning_delta 采用追加拼接。
5. 工具调用日志
   - tool_call_start、tool_call_delta、tool_call_done 三阶段聚合展示。
6. 子代理分组
   - 根据 metadata.subagent_id 自动创建分组容器。

#### 3.6.6 响应式策略

1. >= 1280px
   - 三栏常驻布局。
2. 1024px 到 1279px
   - 左栏可折叠为 icon rail，右栏可切换为覆盖层。
3. < 1024px
   - 左栏改为 Drawer，右栏改为底部 Sheet 或全屏会话页。
4. < 768px
   - 中栏日志改为单列分段，降低并行信息密度。

#### 3.6.7 动效方案

1. 菜单切换
   - 中栏内容采用 140ms 到 180ms 的淡入上移动画。
2. 抽屉开合
   - 左右抽屉采用 180ms ease-out 平移。
3. 流式输出
   - 日志追加不做逐字符动画，仅做行级出现动画，避免性能抖动。

#### 3.6.8 可访问性与可观测性

1. 交互组件需要明确 aria-label。
2. 主菜单支持键盘上下移动和 Enter 触发。
3. 右栏输入区支持 Cmd/Ctrl+Enter 发送。
4. 日志区按类型上报指标：delta 量、tool call 次数、final 延迟。

#### 3.6.9 基于现有组件的实现映射

1. 左栏与壳层：优先复用 SidebarProvider、Sidebar、SidebarInset。
2. 抽屉：复用 Sheet。
3. 检索选择：复用 Combobox。
4. 输入区：复用 InputGroup + Textarea + Button。
5. 日志卡片：复用 Card、Badge、Avatar。
6. Skills/Rules/Memory 分段：短期用 Button Group，后续可补 Tabs Primitive。

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
