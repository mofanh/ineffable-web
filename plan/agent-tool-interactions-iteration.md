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

## Phase 3：文件工具调用摘要

### 实现

- [x] 为工作区与本地文件工具建立集中式展示标题映射。
- [x] 从结构化输入中提取路径，并在读取、写入、创建、移动、删除和目录查看摘要中展示目标。
- [x] 工具参数尚未完整时使用通用动作标题，参数完整后自动显示目标路径。
- [x] 未识别工具继续显示原始工具名，输入与输出详情保持原有折叠展示。
- [x] 同步中英文资源。

### 验收标准

- [x] `workspace_read_file` / `read_file` 显示“读取 {path}”。
- [x] `workspace_write_file` / `write_file` 显示“写入 {path}”。
- [x] 工作区目录、产物、创建、移动和删除操作显示对应动作摘要。
- [x] 摘要解析不影响 tool 状态、折叠行为、专用 renderer 或 raw input/output。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check`

### 人工验证

- [ ] 使用真实 Agent 执行文件读取、写入和移动，确认流式参数阶段与完成阶段的标题切换及窄栏截断表现。

## Phase 4：选择结果刷新回显

### 实现

- [x] 历史重建时将 waiting `request_user_input` 与紧随其后的用户消息重新关联。
- [x] 使用恢复出的答案初始化选项与“其他”输入，避免刷新后回退为未选择状态。
- [x] 仅问题等待选择时默认展开，其他状态默认折叠。
- [x] 未提交的问题仍保持 waiting 和可交互状态。

### 验收标准

- [x] 提交预设选项后刷新，问题卡显示原选择和已提交状态。
- [x] 提交“其他”内容后刷新，问题卡显示“其他”和原输入内容。
- [x] 成功状态默认折叠，用户仍可手动展开查看原问题和答案。
- [x] 没有后续用户消息的 waiting 问题不会被误标记为已回答。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check`
