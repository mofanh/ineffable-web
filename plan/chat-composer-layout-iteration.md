# Chat Composer 一体式布局迭代

## 目标

参考 DeepSeek Harness 与用户提供的输入框样式，把 Chat Composer 从多层分隔栏收敛为
一体式输入卡片。保持现有发送、停止、排队、模型、Sandbox、Node 迭代和 Agent 文件引用
行为不变。

## 非目标

- 不新增附件等尚未接入的能力。
- 不修改 SSE、Conversation Runtime 或 Gateway API。
- 不改变模型、Sandbox 与 Node 迭代的业务语义。

## Phase 1：一体式 Composer

- [x] 保持正文输入区域原有高度并移除内部横向分隔线。
- [x] 将模型、Sandbox 和 Node 迭代收敛为底部紧凑工具栏。
- [x] 将发送按钮强化为唯一圆形主操作，保留运行中的停止与排队入口。
- [x] 保证窄侧栏、全屏、明暗主题和键盘可访问性。

## 验收

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm run i18n:check`
- [x] 现有 Chat Runtime/Web Runtime 高信号检查通过。

真实页面验证：使用本地 Gateway 与测试账号在 1440px 视口检查 368px 右侧栏；页面
`scrollWidth` 与视口一致，无横向溢出。正文仍保持两行、56px 最小高度与 128px 最大
高度，内容超出后在输入区内滚动。

## Phase 2：工具栏单行约束

- [x] 工具栏固定为单行且禁止换行。
- [x] 模型与 Sandbox 按内容自然宽度展示，仅在空间不足或名称过长时收缩截断。
- [x] Node 迭代收敛为图标与开关，完整模式信息保留在 title 与 aria-label。
- [x] 停止与发送保持固定点击尺寸和原有行为。

真实页面验证：368px 右侧栏下工具栏宽 366px，模型、Sandbox、Node 开关与发送按钮的
垂直中心均为 959px；最右控件距工具栏右边界 12px，页面无横向溢出。将输入卡片模拟
扩宽到 700px 后，模型与 Sandbox 仍分别保持约 135px、100px，没有随容器拉伸。

## Phase 3：模型空选择语义

- [x] 移除前端虚构的 Auto 模型选项，空选择不再伪装成自动路由能力。
- [x] 有可用模型但尚未选择时显示“未选择模型”；没有可用模型时显示“无可使用的模型”。
- [x] 保持已选择模型、历史恢复和请求提交语义不变。
- [x] 会话切换时按已加载目录清理失效缓存模型，避免提交已删除的模型 ID。
- [x] canonical 历史恢复先校验模型目录再写缓存，请求只携带已确认可用的模型 ID。
- [x] 区分目录尚未加载与权威空目录，加载期间不误报“无可使用的模型”。
- [x] 架构检查、i18n、lint 与生产构建通过。

## Phase 4：运行时选择器体验统一

- [x] 抽取 Chat Composer 内复用的单选面板骨架，统一 Model 与 Sandbox 的展开层级、选中反馈和滚动行为。
- [x] Model 面板展示推理与工具调用能力，不再浪费已经加载的模型元数据。
- [x] Sandbox 面板用语义状态徽标展示环境状态，并在面板内反馈刷新过程。
- [x] 保持底部工具栏单行、自然宽度和现有输入区高度，不改变模型与 Sandbox 的提交语义。
- [x] 搜索型选择器使用 Popover + listbox 焦点模型，支持键盘进入搜索、上下导航与返回搜索框。
- [x] 补齐中英文文案，并通过 i18n、lint、build 与 Chat Runtime/Web Runtime 高信号检查。

### 非目标

- 不修改 Gateway API、模型或 Sandbox 选择持久化逻辑。
- 不把能力模式、Model 和 Sandbox 合并为同一份业务状态。
- 不在基础 UI primitive 中引入 Chat 领域文案或状态判断。

真实页面验证：使用本地 Gateway 与测试账号在 1200×900 视口分别展开 Model 与
Sandbox 面板。两个面板均保持在右侧对话栏内，工具栏仍为单行；Model 正确展示模型能力
标签与当前选中项，Sandbox 正确展示无环境说明与当前选中项。
Model 搜索面板打开后焦点进入 combobox，`ArrowDown` 进入第一个选项、首项
`ArrowUp` 返回搜索框；trigger 的可访问名称同时包含动作与当前模型。
