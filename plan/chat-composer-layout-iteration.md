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

真实页面验证：使用本地 Gateway 与测试账号在 1440px 视口检查 368px 右侧栏；工具栏按
两行自然换行，页面 `scrollWidth` 与视口一致，无横向溢出。正文仍保持两行、56px 最小
高度与 128px 最大高度，内容超出后在输入区内滚动。
