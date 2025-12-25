# Service API 文档

说明：本服务在 `127.0.0.1:5173` 提供 HTTP 接口与 SSE 实时事件推送，Agent 在独立线程中运行并从 `ineffable.toml` 加载配置。

**公共前缀**: /api

---

**端点概览**

- POST /api/execute  — 提交执行请求（启动任务）
- GET  /api/status   — 查询 Agent 状态
- GET  /api/health   — 健康检查
- GET  /api/stream   — SSE 实时事件流（Server-Sent Events）

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
