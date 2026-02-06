# Service API 文档

说明：本服务在 `127.0.0.1:5173` 提供 HTTP 接口与 SSE 实时事件推送，Agent 在独立线程中运行并从 `ineffable.toml` 加载配置。

**公共前缀**: /api

---

**端点概览**

- POST /api/execute  — 提交执行请求（启动任务）
- GET  /api/status   — 查询 Agent 状态
- GET  /api/health   — 健康检查
- GET  /api/stream   — SSE 实时事件流（Server-Sent Events）
- GET  /api/sessions — 列出非归档会话（分页）
- POST /api/sessions — 创建新会话
- GET  /api/sessions/{id} — 获取会话详情
- PUT  /api/sessions/{id} — 更新会话标题
- DELETE /api/sessions/{id} — 归档会话（软删除）
- GET  /api/sessions/archived — 列出归档会话
- POST /api/sessions/{id}/restore — 恢复归档会话
- GET  /api/sessions/{id}/messages — 获取会话消息
- DELETE /api/sessions/{id}/permanent — 永久删除会话

---

**POST /api/execute**
- 描述：提交一个文本 prompt，Agent 异步执行并返回 task id。模型推理增量通过 SSE 推送。
- 请求头：`Content-Type: application/json`
- 请求体示例：

```json
{
  "prompt": "hello from test script"
}
```

- 成功响应（HTTP 200）示例：

```json
{
  "success": true,
  "data": {
    "task_id": "19b50f2e-...",
    "status": "started",
    "timestamp": 1766669025
  },
  "error": null
}
```

- 失败响应：HTTP 500，`error` 字段返回错误描述。

返回类型说明（常见字段）：
- `task_id`：任务 UUID
- `status`：`started` 等
- `timestamp`：UNIX 秒级时间戳

---

**GET /api/status**
- 描述：返回当前 Agent 状态信息。
- 成功响应（HTTP 200）示例：

```json
{
  "success": true,
  "data": {
    "session_id": "...",
    "is_running": false,
    "state": "Idle"
  },
  "error": null
}
```

字段说明：
- `session_id`：Agent 会话 ID
- `is_running`：是否处于运行中
- `state`：字符串化的状态枚举

---

**GET /api/health**
- 描述：简单健康检查，返回版本与时间戳。
- 成功响应示例：

```json
{
  "success": true,
  "data": {
    "status":"healthy",
    "version":"0.1.0",
    "timestamp": 1766669025
  },
  "error": null
}
```

---

**GET /api/stream** (SSE)
- 描述：订阅 Agent 运行时事件（包括模型增量、工具调用事件、任务开始/完成等）。
- 调用方法：
  - curl: `curl -N http://127.0.0.1:5173/api/stream`
  - 浏览器：创建 EventSource 指向 `http://127.0.0.1:5173/api/stream`
- SSE 协议：每条事件以 `data: JSON\n\n` 格式发出；客户端需解析 JSON。

事件示例（经 SSE 包裹后的 `data:` 内容为以下 JSON）：

1) 任务开始

```json
{"type":"task_started","task_id":"19b50f2e-...","task_kind":"execute"}
```

2) 用户消息（回显）

```json
{"type":"user_message","content":"hello from test script"}
```

3) 模型增量（delta）

```json
{"type":"assistant_message_delta","delta":"Hello"}
```

多个 delta 会连续发送，客户端应拼接直到收到 `assistant_message_completed` 或 `task_completed`。

4) 模型完成（最终内容）

```json
{"type":"assistant_message_completed","content":"Hello! ..."}
```

5) 任务完成

```json
{"type":"task_completed","task_id":"...","success":true,"turns":0,"duration_ms":0}
```

6) 流错误

```json
{"type":"stream_error","error":"..."}
```

7) 工具调用事件（示例）

```json
{"type":"tool_call_started","call_id":"...","name":"read","args":{...}}
{"type":"tool_call_completed","call_id":"...","name":"read","output":"...","duration_ms":0}
```

注意：实际 `type` 字段与服务中 `Event` 类型对应；客户端可按 `type` 分派处理逻辑。

---

**GET /api/sessions**
- 描述：列出所有非归档会话（分页）。
- 成功响应（HTTP 200）示例：

```json
{
  "items": [
    {
      "id": "6cc01d9b-c9fb-49d1-8867-7cbc6b627e54",
      "title": "My Session",
      "created_at": 1770308851,
      "updated_at": 1770308858,
      "archived": 0,
      "archived_at": null
    }
  ],
  "total": 1
}
```

字段说明：
- `id`：会话 UUID
- `title`：会话标题
- `created_at`：创建时间（UNIX 时间戳）
- `updated_at`：更新时间（UNIX 时间戳）
- `archived`：是否归档（0=否，1=是）
- `archived_at`：归档时间（未归档为 null）
- `total`：会话总数

---

**POST /api/sessions**
- 描述：创建新会话。
- 请求体（可选）：

```json
{
  "title": "新会话标题"
}
```

- 成功响应（HTTP 200）示例：

```json
{
  "id": "6cc01d9b-c9fb-49d1-8867-7cbc6b627e54",
  "title": "新会话标题",
  "created_at": 1770308851,
  "updated_at": 1770308851,
  "archived": 0,
  "archived_at": null
}
```

---

**GET /api/sessions/{id}**
- 描述：获取会话详情（包含消息）。
- 成功响应（HTTP 200）示例：

```json
{
  "id": "6cc01d9b-c9fb-49d1-8867-7cbc6b627e54",
  "title": "My Session",
  "created_at": 1770308851,
  "updated_at": 1770308858,
  "archived": 0,
  "archived_at": null,
  "messages": [
    {
      "id": "msg-1",
      "session_id": "6cc01d9b-c9fb-49d1-8867-7cbc6b627e54",
      "role": "user",
      "content": "Hello",
      "created_at": 1770308852
    }
  ]
}
```

---

**PUT /api/sessions/{id}**
- 描述：更新会话标题。
- 请求体：

```json
{
  "title": "新的标题"
}
```

- 成功响应（HTTP 200）：返回更新后的会话对象。

---

**DELETE /api/sessions/{id}**
- 描述：归档会话（软删除）。会话不会被删除，只是标记为 archived=1。
- 成功响应（HTTP 200）示例：

```json
true
```

---

**GET /api/sessions/archived**
- 描述：列出所有归档会话。
- 成功响应（HTTP 200）示例：

```json
[
  {
    "id": "6cc01d9b-c9fb-49d1-8867-7cbc6b627e54",
    "title": "Old Session",
    "created_at": 1770308851,
    "updated_at": 1770308858,
    "archived": 1,
    "archived_at": 1770308860
  }
]
```

---

**POST /api/sessions/{id}/restore**
- 描述：恢复归档的会话。
- 成功响应（HTTP 200）：返回恢复后的会话对象。

---

**GET /api/sessions/{id}/messages**
- 描述：获取会话的所有消息。
- 成功响应（HTTP 200）示例：

```json
[
  {
    "id": "msg-1",
    "session_id": "6cc01d9b-c9fb-49d1-8867-7cbc6b627e54",
    "role": "user",
    "content": "Hello",
    "created_at": 1770308852
  }
]
```

---

**DELETE /api/sessions/{id}/permanent**
- 描述：永久删除会话（不可恢复）。建议先使用普通 DELETE 进行软删除。
- 成功响应（HTTP 200）示例：

```json
true
```

---

**示例：完整本地测试（SSE + Execute）**
1) 在一终端订阅 SSE：

```bash
curl -N http://127.0.0.1:5173/api/stream > /tmp/ineffable_stream.out
```

2) 在另一终端提交任务：

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"prompt":"hello from test script"}' \
  http://127.0.0.1:5173/api/execute
```

3) 查看 `/tmp/ineffable_stream.out` 中的 SSE `data: ...` 行，解析 JSON 即可得到实时增量与事件。

---

**备注与扩展**
- 配置：Agent 会从 `ineffable.toml`（或环境变量如 `SPARK_API_KEY`）读取模型提供器配置。
- 任务取消、历史查询等接口：仓库中 `agent_service` 支持 `Cancel`、`GetStatus` 等消息类型，如需暴露更多 HTTP 路由，可在 `crates/service/src/main.rs` 中添加对应 handler 并映射到 `AgentService` 方法。
- SSE 的事件历史/重放：当前实现为实时广播，晚订阅者不会自动获得历史。如需历史，请实现事件缓存并在订阅时回放。

---

文件：`crates/service/API.md`（由脚本生成），如需我将其格式化为 OpenAPI/Swagger（YAML/JSON），我可以基于上面描述生成对应文件。
