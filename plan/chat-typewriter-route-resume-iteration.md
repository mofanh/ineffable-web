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
- [ ] 手动验证：Thinking 切正文时保持贴底，用户向上滚动后仍停止跟随（需要运行中的 Gateway/Agent）。

## Phase 7：单帧滚动追踪

### 实现

- [x] 增加默认关闭的 chat scroll 结构化调试日志，不记录消息内容或认证信息。
- [x] 记录 reasoning/text 转换、内容尺寸变化、贴底请求与 viewport scroll 判定。
- [x] 使用最多 800 条的内存环形缓冲，支持从浏览器控制台完整导出。

### 使用

```js
localStorage.setItem("ineffable.chat.scroll_debug", "true")
location.reload()
```

复现后导出：

```js
copy(JSON.stringify(window.__ineffableChatScrollTrace ?? [], null, 2))
```

关闭并清理：

```js
localStorage.removeItem("ineffable.chat.scroll_debug")
delete window.__ineffableChatScrollTrace
```

### 验收

- [x] 自动验证：`npm run i18n:check`。
- [x] 自动验证：`npm run lint`。
- [x] 自动验证：`npm run build`。
- [ ] 运行时验证：启用日志并复现 Thinking→正文未贴底，导出 trace 后定位单帧顺序。
