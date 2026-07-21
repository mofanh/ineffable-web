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

## Phase 3：Thinking 流式打字机效果

### 实现

- [x] Thinking 内容复用正文打字机节奏，实时呈现 reasoning delta。
- [x] Thinking 块关闭后平滑补齐剩余内容，历史 Thinking 保持即时展示。
- [x] 继续复用减少动态效果偏好，不新增并行定时策略。

### 验收

- [x] 自动验证：`npm run i18n:check`。
- [x] 自动验证：`npm run lint`。
- [x] 自动验证：`npm run build`。
- [ ] 手动验证：真实 Agent reasoning 流逐步呈现且折叠状态正常（需要运行中的 Gateway/Agent）。

## Phase 4：流式内容审计与底部跟随

### 实现

- [x] 审计正文、Thinking、tool、update、approval 与 system 等可见内容的流式展示职责。
- [x] 打字机可见内容每次增长后通知消息 viewport，在用户仍贴底时同步滚动。
- [x] “最新内容”操作立即恢复稳定贴底，避免 smooth scroll 中间状态误判为用户上滑。
- [x] 用户主动离开底部后继续保留当前位置，不由流式输出强制抢回。

### 验收

- [x] 自动验证：`npm run i18n:check`。
- [x] 自动验证：`npm run lint`。
- [x] 自动验证：`npm run build`。
- [ ] 手动验证：长正文、长 Thinking、主/子 Agent 及流结束补齐期间持续贴底；用户上滑后不被抢回（需要运行中的 Gateway/Agent）。

## Phase 5：Thinking 到正文的布局跟随

### 实现

- [x] 定位 Thinking 关闭时 160ms 折叠动画未触发逐字符进度回调的问题。
- [x] 使用消息内容容器尺寸变化统一覆盖打字、折叠、块创建和 Markdown 换行。
- [x] 移除正文与 Thinking 的重复布局回调，贴底策略继续由会话层统一控制。

### 验收

- [x] 自动验证：`npm run i18n:check`。
- [x] 自动验证：`npm run lint`。
- [x] 自动验证：`npm run build`。
- [ ] 手动验证：长 Thinking 结束并折叠、正文开始输出的整个过渡持续贴底（需要运行中的 Gateway/Agent）。

## Phase 6：贴底意图竞态修复

### 实现

- [x] 定位内容增高先触发 scroll、尺寸 observer 后执行造成的贴底状态竞态。
- [x] 结合滚动方向与底部距离判断用户是否主动离开，不再由内容增高关闭跟随。
- [x] 会话切换与新建会话时同步重置滚动位置基线。

### 验收

- [x] 自动验证：`npm run i18n:check`。
- [x] 自动验证：`npm run lint`。
- [x] 自动验证：`npm run build`。
- [x] 运行时验证：真实 Agent 会话中 Thinking 切正文保持贴底，用户确认问题已修复。

## Phase 7：打字机渲染热路径优化

### 实现

- [x] 将 reduced-motion 监听从每个消息块收敛为消息列表单例。
- [x] 降低打字机无效高频刷新，同时保持长内容追赶耗时基本稳定。
- [x] 缓存已完成的 Thinking 与 tool card，避免后续 delta 重复渲染历史块。

### 验收

- [x] 自动验证：`npm run i18n:check`。
- [x] 自动验证：`npm run lint`。
- [x] 自动验证：`npm run build`。
- [ ] 手动验证：正文与 Thinking 打字节奏、折叠和 tool 状态保持正常。

## Phase 8：流式贴底调度优化

### 实现

- [ ] 消除每个 SSE delta 的重复同步贴底，改由实际内容尺寸变化驱动。
- [ ] 历史分页继续按条目数量变化恢复滚动位置。
- [ ] 保留新消息、会话切换、用户上滑和 Thinking→正文过渡行为。

### 验收

- [ ] 自动验证：`npm run i18n:check`。
- [ ] 自动验证：`npm run lint`。
- [ ] 自动验证：`npm run build`。
- [ ] 手动验证：长流输出持续贴底，用户上滑后不被抢回。
