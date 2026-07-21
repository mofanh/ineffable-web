# 右栏输出与路由恢复体验迭代

## 目标

- 为右侧 Agent 会话中正在生成的 LLM 正文增加平滑打字机效果。
- token 过期刷新、认证恢复或重新登录后，返回用户刷新前正在使用的站内页面，而不是统一进入默认首页。
- 保持 chat 流式状态机、认证 localStorage key、路由保护和既有页面行为兼容。

## 边界

- 打字机效果归属 `src/features/chat/components`，只影响流式正文的展示节奏，不修改 SSE 事件聚合、会话恢复或工具调用顺序。
- 路由记忆归属 `src/lib/app`，认证 guard 和基础 API 客户端只调用统一策略，不各自复制 sessionStorage 规则。
- 只恢复同源站内路径，并排除登录、注册等认证入口，避免开放重定向和认证循环。

## Phase 1：流式正文打字机效果

### 实现

- [x] 为 Agent 正文块增加可追赶增量内容的打字机展示逻辑。
- [x] 仅对当前流式主 Agent / 子 Agent 输出启用，历史内容保持即时展示。
- [x] 流结束后平滑补齐剩余正文，并支持 `prefers-reduced-motion` 直接展示完整内容。

### 验收

- [x] 自动验证：`npm run i18n:check`。
- [x] 自动验证：`npm run lint`。
- [x] 自动验证：`npm run build`。
- [ ] 手动验证：真实 SSE 输出逐步呈现，Markdown 与自动滚动体验正常（需要运行中的 Gateway/Agent）。

## Phase 2：刷新与登录后的页面恢复

### 实现

- [x] 新增同源受保护路径记忆策略，保留 pathname、search 和 hash。
- [x] 受保护路由持续记录当前位置，未认证跳转登录时携带返回目标。
- [x] token 刷新 reload 前记录当前位置，登录或认证恢复后优先返回原页面。

### 验收

- [x] 自动验证：`npm run i18n:check`。
- [x] 自动验证：`npm run lint`。
- [x] 自动验证：`npm run build`。
- [ ] 手动验证：手机端在 Agent 使用中触发真实 token 过期，刷新/登录后恢复原路由（需要可控 token 或 Gateway 环境）。
