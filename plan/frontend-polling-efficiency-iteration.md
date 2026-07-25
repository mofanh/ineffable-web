# 前端轮询效率迭代计划

## 背景

当前会话已有实时 SSE，但后台活跃会话仍以 2.5 秒固定频率刷新；页面隐藏时也可能继续
轮询。sandbox 选项会在 focus、online、visibility 等多个事件上重复刷新，事件连发时
会产生重叠请求。

## Phase 1：活动事件合并与请求去重（已完成）

- 在 app 公共层提供页面可见、在线状态与最小刷新间隔策略。
- sandbox 选项只在初始化和用户打开选择器时刷新，并复用同一个进行中请求。
- focus、online、visibility 的 catch-up 刷新合并，避免事件连发产生重复请求。

验收：

- 活动状态策略有独立契约检查。
- 页面恢复时仍会立即补拉一次。

## Phase 2：自适应后台会话刷新（已完成）

- 当前会话继续以 SSE 为权威实时通道。
- 后台活跃会话仅在页面可见且在线时以有上限的较低频率刷新。
- 页面隐藏时停止 interval，恢复可见后立即补拉。
- 保留现有 in-flight 去重和 conversation event cursor 分区。

验收：

- 前端 lint、类型检查/构建与 i18n 校验通过。
- 静态契约检查确认轮询间隔、可见性门控和恢复补拉行为。

## 验证记录

- `npm run lint`
- `npm run build`
- `npm run check:polling`
- `npm run check:chat-runtime`
- `npm run check:chat-resume`
- `npm run check:auth-session`
- `npm run i18n:check`
