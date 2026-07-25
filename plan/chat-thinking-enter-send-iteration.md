# 聊天首包反馈与回车发送迭代计划

## 目标

右侧聊天栏提交新任务后立即显示模型正在处理的反馈，并将输入框调整为聊天产品常见的
Enter 发送、Shift+Enter 换行。

## 边界

- 思考占位属于 `features/chat` 的瞬时展示状态，不写入会话历史，也不改变 Gateway 事件模型。
- 键盘行为由聊天 feature 负责，不修改通用 `Textarea` / `InputGroup` primitive。
- 用户可见提示同步维护中英文资源。

## 实施

- [x] 流已开始但真实 assistant 条目尚未出现时，显示“正在思考”占位。
- [x] 首个 assistant 条目出现、发送失败或流结束后，自动移除占位。
- [x] Enter 发送，Shift+Enter 保留换行。
- [x] 输入法组合输入期间按 Enter 不触发发送。
- [x] 同步中英文文案。

## 验收

### 自动化

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm run check:chat-runtime`
- [x] `npm run check:chat-resume`

### 手工

- [ ] 使用真实 Gateway 验证首包到达前显示“正在思考”，首包到达后无重复占位。
- [ ] 验证 Enter 发送、Shift+Enter 换行以及中文输入法候选确认不误发送。
