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

## Phase 5：工具调用主题一致性

### 实现

- [x] 移除通用工具状态、request 选择卡、终端结果和 sandbox preview 的固定黄绿蓝配色。
- [x] 工具容器、选中态、推荐标记和成功状态统一使用黑白语义 token。
- [x] 失败状态保留 `destructive` 语义，确保异常仍可识别。
- [x] 计划工具的完成和进行中图标同步收敛为前景色层级。

### 验收标准

- [x] 工具调用在浅色和深色模式下不出现脱离主题的固定强调色。
- [x] request 等待态仍可通过层级、边框和状态文案识别。
- [x] 选中项、推荐项、成功项和失败项不依赖具体色板表达语义。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check`

## Phase 6：中性底色与语义强调

### 实现

- [x] 工具卡片、选项、终端详情和预览容器继续使用黑白灰语义背景。
- [x] 恢复运行、等待、成功、失败等状态文字与细边框的语义色。
- [x] 恢复 request、preview、plan 的小面积图标和推荐标记颜色。
- [x] 为彩色强调补充深色模式文字色，保持对比度。

### 验收标准

- [x] 工具调用不再出现黄色、绿色或蓝色的大面积背景。
- [x] 状态文字、图标、单选圆点等小面积元素保留清晰语义色。
- [x] 浅色与深色模式下的卡片主体仍与黑白主题一致。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check`

## Phase 7：移动端键盘视口适配

### 实现

- [x] 全屏移动 Sidebar 使用 `100dvh` 作为可见高度回退。
- [x] 监听 VisualViewport 的 resize 和 scroll，以可见高度及顶部偏移定位全屏聊天面板。
- [x] 全屏聊天限制根容器溢出，仅允许中间消息区滚动。
- [x] Composer 增加底部安全区间距。
- [x] Android Chrome viewport 声明使用 `interactive-widget=resizes-content`。

### 验收标准

- [x] 键盘弹出时 Header 和 Composer 保持在可见区域，中间消息列表缩短。
- [x] 全屏聊天面板不再继续使用键盘弹出前的布局视口高度。
- [x] 不支持 VisualViewport 的浏览器回退到动态视口单位。
- [ ] iOS Safari、iOS Chrome 和 Android Chrome 真机点击输入框时页面根节点不整体上移。
- [ ] 键盘收起后面板恢复完整高度，消息列表滚动位置无明显跳动。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check`

## Phase 8：工具折叠摘要契约

### 目标与边界

- [x] 由集中式 tool presentation 从类型化 `ToolCallView` 派生标题与单行摘要。
- [x] 摘要只解释参数和结果，不从自由文本反推 tool settlement 状态。
- [x] 运行中优先展示目标、命令或查询；终态优先展示行范围、退出码或结果首行。
- [x] 摘要必须有长度上限并归一化空白，避免长参数或输出撑开消息布局。
- [x] 不修改 Gateway/Agentic 协议，不增加 Tool WebNode 之外的渲染路径。

### 验收标准

- [x] 文件、命令、搜索与未知工具都有确定性 presentation 回归覆盖。
- [x] 参数尚未完成或结果不是 JSON 时仍能安全降级，不抛异常。
- [x] failed/cancelled 状态继续来自 canonical tool result，不做字符串嗅探。

## Phase 9：Tool WebNode 紧凑状态轨迹

### 实现

- [x] `ToolCallShell` 折叠行复用 presentation 摘要，布局与“思考过程”保持同一信息层级。
- [x] running/pending 保持稳定卡片并局部更新摘要；success 自动收起；failure 保留可见原因。
- [x] 展开区继续提供完整 input/output，专用 request、preview、terminal 与 artifact renderer 不回归。
- [x] 连续工具节点保持各自稳定 identity，不合并 canonical tool call。

### 验收标准

- [x] 窄栏下标题、摘要、状态和展开按钮不会互相挤出容器。
- [x] 折叠成功工具无需展开即可理解动作和结果。
- [x] 失败工具无需展开即可看到受控错误摘要，展开后仍可查看原始输出。

## Phase 10：集成与真实流式验收

### 自动验证

- [x] `npm run check:chat-web-runtime`
- [x] `npm run check:chat-web-integration`
- [x] `npm run check:chat-architecture`
- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check`

### 真实浏览器验证

- [x] 使用真实 Gateway 触发至少一个工具调用，确认 running 阶段摘要实时更新。
- [x] 工具结算后卡片原位切换为终态，不重复创建 Tool 节点。
- [x] 刷新历史后标题、摘要、状态与 live 路径语义一致。

### 非阻塞运行时发现

本地 `exec_command` 验收返回 `capability route not found`，但该次 canonical tool result
未携带失败 settlement，现有 projector 因而按协议默认显示 succeeded。前端保持不从
输出字符串反推状态；该 Gateway/Capability 状态契约异常不在本轮展示层范围内。

### 非目标

- 不修改后端 tool schema、事件 kind、settlement 或持久化内容。
- 不把工具调用聚合成工作流/DAG，也不隐藏诊断所需的完整 input/output。
- 不为某个 provider 建立绕过 Default Web Plugin registry 的专用消息路径。
