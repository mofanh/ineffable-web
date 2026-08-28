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
