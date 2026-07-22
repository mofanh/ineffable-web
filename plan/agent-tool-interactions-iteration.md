# Agent 工具交互迭代计划

## 背景

当前 chat feature 将所有工具统一交给通用 `ToolCallCard`，导致：

- `update_plan` 只显示原始 JSON，无法作为会话级执行进度被持续感知。
- `request_user_input` 退化为普通工具参数展示，问题、选项和推荐项语义丢失。
- 前端已有 sandbox approval resume 流程；`request_user_input` 的工具结果已经进入会话上下文，答案应复用下一轮普通用户输入。

## 架构边界

```text
Gateway events / history
  -> chat pane tool state
    -> ToolCallShell (通用状态与折叠外壳)
      -> tool renderer registry (feature-specific body)
      -> generic fallback

chat entries
  -> latest update_plan selector
    -> AgentPlanPanel (composer 上方的会话级计划)
```

- `ToolCallShell` 只负责工具通用视觉和状态，不解析具体工具参数。
- 专用 renderer 归属 `features/chat/components`，不进入全局 app/UI primitive。
- `update_plan` 在消息流中不重复展示，最新计划提升到 composer 上方。
- `request_user_input` 的结构化选择转换为可读答案，通过现有 conversation send 作为下一条普通用户消息提交；approval resume 保持独立。
- 未识别工具继续走 generic fallback；终端与 sandbox preview 现有行为保持不变。

## Phase 1：工具交互闭环

### 实现

- [x] 新增组合式 `ToolCallShell`，统一 pending/running/waiting/success/error/cancel 状态。
- [x] 建立 tool renderer registry，接入 `request_user_input`，保留 generic fallback。
- [x] 解析 waiting blocking need，支持每题互斥选择、推荐项、其他输入和提交状态。
- [x] 复用普通 conversation send 提交用户选择，保留 approval 专用 run resume adapter。
- [x] 从当前会话最新 `update_plan` 派生计划，在 composer 上方展示步骤与进度。
- [x] 消息流隐藏重复的 `update_plan` 原始工具调用。
- [x] 同步中英文资源与本计划状态。

### 验收标准

- [x] plan 更新后，无需展开 tool call 即可在输入框上方看到当前步骤和总体进度。
- [x] `request_user_input` 显示问题 header、问题正文、选项描述与推荐标记。
- [x] 多个问题可分别选择；每题选项互斥；支持“其他”文本。
- [x] 所有必答题完成后可提交，并以可读用户消息进入下一轮对话。
- [x] 未知工具、terminal tool 和 sandbox preview 不回归。
- [x] 历史 waiting 工具在不再是当前 run 时不可误提交。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`

### 人工验证

- [ ] 真实 Agent 调用 `update_plan` 后检查 composer 上方计划位置、折叠和流式更新。
- [ ] 真实 Agent 调用 `request_user_input`，选择推荐项与“其他”并提交，确认创建下一轮正常对话。
- [ ] 刷新等待中的会话，确认问题仍可恢复展示并提交。

## 同类产品参考结论

- Codex、Claude Code、Gemini CLI 和 VS Code Plan agent 都把 plan 视为会话模式或独立计划产物，而不是普通工具日志。
- Claude Code、Gemini CLI 的用户提问采用阻塞式结构化交互；具体续接方式取决于产品运行时的会话模型。
- 本项目的工具结果已进入会话历史，因此采用“composer 邻近 plan + 消息内问题卡 + 普通用户消息续接”的信息架构。

## Phase 2：提交链路联调修正

### 运行时证据

- [x] 日志确认 `request_user_input` 工具已完成并进入 `after_turn`，没有创建可供 `/gateway/v1/runs/resume` 恢复的 awaiting run。
- [x] 原实现提交到 `/gateway/v1/runs/resume` 后返回 `run not found`，说明前端错误复用了 approval 的恢复语义。

### 修正

- [x] 移除 user input resolution 与通用 resume adapter，仅保留 approval resume。
- [x] 选择结果转换为可读文本，并复用普通 conversation send。
- [ ] 完成真实会话回归，确认答案气泡、下一轮响应与刷新后的历史展示。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check`
