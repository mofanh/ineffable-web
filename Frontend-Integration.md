# 智能体调度前端集成与接口需求

本文档基于现有后端 API（见 API.md）为前端集成提供明确的页面需求、状态数据流以及后端接口清单（含已实现与建议新增）。

## 一、前端需要的能力

- 仪表盘：展示 `Agent` 当前运行状态（`session_id`、`is_running`、`state`）、健康状态。
- 任务发起：输入 `prompt` 并调用启动接口，获得 `task_id` 与初始状态。
- 实时输出：订阅 SSE 流，增量拼接 `assistant_message_delta`，在 `assistant_message_completed`/`task_completed` 时收敛最终结果。
- 事件时间线：展示 `user_message`、`tool_call_*`、`stream_error`、`task_*` 等事件。
- 控制操作：取消当前任务（若支持）、重试、（可选）选择不同 Agent/模型配置。
- 历史查看（可选）：最近任务列表、任务详情、事件回放。
- 错误与重连：SSE 断线重连、后端错误提示与重试。

## 二、与现有后端端点的映射

已实现端点（见 API.md）：
- `POST /api/execute` — 提交执行请求（启动任务），返回 `task_id`、`status`、`timestamp`。
- `GET  /api/status`  — 查询 Agent 状态（`session_id`、`is_running`、`state`）。
- `GET  /api/health`  — 健康检查（`status`、`version`、`timestamp`）。
- `GET  /api/stream`  — SSE 实时事件流（事件类型含 `task_started`、`user_message`、`assistant_message_delta`、`assistant_message_completed`、`tool_call_*`、`task_completed`、`stream_error`）。

前端数据流：
- 启动任务：表单提交 → `POST /api/execute` → 拿到 `task_id`。
- 实时订阅：页面加载或任务发起后建立 `EventSource('/api/stream')` → 按 `type` 分派处理并更新 UI。
- 状态/健康：定时或进入页面拉取 `GET /api/status`、`GET /api/health`。

## 三、前端页面/组件建议（React）

- `AgentDashboard`：状态牌（`state`/`is_running`）、健康指示、最近任务（若有）。
- `PromptForm`：输入框 + 提交按钮，调用 `POST /api/execute`。 
- `StreamOutput`：按增量事件拼接并渲染最终消息。 
- `EventTimeline`：事件列表（`tool_call_started/completed`、`user_message`、错误等）。
- `Controls`：取消/重试按钮（需要后端端点支持）。
- `StatusBadge`/`HealthBadge`：小组件显示状态与健康。
- `useSSE` Hook：统一管理 `EventSource` 建立、重连、事件分派。
- `api.ts`：封装 `fetch('/api/execute|status|health')` 与错误处理。

## 四、后端接口的建议补充（缺口）

为满足更完整的调度与可观测性，建议新增以下 HTTP 端点与约定：

- 任务管理：
  - `GET /api/tasks?limit=&status=`：任务列表（`task_id`、`prompt`、`status`、`created_at`、`duration_ms`、`success`）。
  - `GET /api/tasks/{id}`：任务详情（含最终输出、统计）。
  - `GET /api/tasks/{id}/events`：事件历史回放（用于页面刷新或晚订阅者）。
  - `POST /api/tasks/{id}/cancel`：取消运行中的任务（与服务内 `Cancel` 映射）。

- 流式订阅：
  - 支持 `GET /api/stream?task_id=...` 按任务过滤；或在事件中稳定携带 `task_id` 以便前端按需过滤。
  - 心跳事件或注入 `comment: heartbeat` 保持连接健康，支持 `Last-Event-ID`（可选）。

- Agent 管理（如未来存在多 Agent 或可控生命周期）：
  - `GET /api/agents`：列出可用的 Agent。
  - `GET /api/agents/{id}/status`：单 Agent 状态。
  - `POST /api/agents/{id}/start|stop|restart`：生命周期控制。

- 一致的错误协议：
  - 统一响应包结构：`{ success, data, error: { code, message, details } }`，并在 SSE 侧 `stream_error` 携带同样结构。

- 安全与配额（按需）：
  - `Authorization` 令牌、速率限制、请求体大小限制、队列与并发策略。

## 五、事件类型与前端处理约定

现有事件：
- `task_started`：记录任务开始时间与 `task_id`，展示任务进行中状态。
- `user_message`：显示用户提交的 `prompt`（可用于时间线）。
- `assistant_message_delta`：累积到当前输出缓冲；遇到 `assistant_message_completed` 收敛为最终输出。
- `assistant_message_completed`：写入最终输出与耗时。
- `tool_call_started/completed`：展示工具名称、参数、输出与耗时。
- `task_completed`：标记任务结束与成功/失败。
- `stream_error`：展示错误并支持重试。

前端建议：
- 维护 `currentTask` 状态，包含 `task_id`、`status`、`outputBuffer`、`events[]`。
- SSE 重连策略：指数退避，最大重试次数；刷新页面后可从 `/api/tasks/{id}/events` 回放（若后端实现）。

## 六、集成示例片段

- 启动任务：
```ts
async function startTask(prompt: string) {
  const res = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const json = await res.json();
  // json.data.task_id -> 保存到状态
}
```

- 订阅 SSE：
```ts
function subscribeStream(onEvent: (evt: any) => void) {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch (_) {}
  };
  es.onerror = () => {
    // 标记断线，执行重连策略
  };
  return () => es.close();
}
```

## 七、结论

- 以现有 `execute + status + health + stream(SSE)`，可完成最小可用的前端：任务发起、实时输出、状态与健康显示。
- 为实现更完整的调度与可观测性，建议增加任务列表/详情、事件回放与取消端点，并为 SSE 加入筛选与心跳。
- 前端应实现统一的事件分派与输出缓冲逻辑、断线重连与错误提示，并在 UI 中提供可操作性（取消/重试/过滤）。
