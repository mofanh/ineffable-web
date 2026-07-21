# Sandbox Preview 一键启动迭代

## 目标

对接 Ineffable gateway 已有的 private sandbox preview 契约，使 Agent 完成 Web 应用后，
前端展示可操作的预览结果，用户点击一次即可进入页面。ticket、preview session 和 relay 对用户透明。

本迭代只完成临时开发预览，不实现公开部署或持久 `publish_web_app`。

## 业务边界

- `preview_url` 是独立 hostname 上的数据面地址，不是未经认证即可访问的公开链接。
- 前端产品入口使用 `/sandbox-preview/{exposure_id}`；该入口读取当前登录态、调用 session API，
  再跳转到 gateway 返回的一次性 `launch_url`。
- launch ticket 不进入 Agent 消息、tool result 持久化或浏览器本地存储。
- 未登录、exposure 过期、停止、tunnel 断开或跨用户访问继续由 gateway 拒绝。
- 可复制分享的公开部署链接属于后续 `publish_web_app`，不能通过取消 preview 鉴权模拟。

## 代码边界

- `src/features/sandbox-preview/api` 只封装 preview session API 和响应类型。
- `src/pages/sandbox-preview-launch-page.tsx` 是独立启动流程页，负责认证上下文、加载、错误和跳转。
- `src/lib/app/sandbox-preview.ts` 只保存跨 Chat/route 使用的 exposure URL 识别与前端入口策略。
- Chat 的 Agent pane 负责识别 `expose_sandbox_port` 结果并渲染预览卡片；不直接读取 access token，
  不调用 session API。
- router 直接引用真实启动页，不新增 page barrel，也不把启动页塞进工作台 Shell。

## Phase 1：认证启动路由

### 实现

- [x] 增加 preview session API adapter。
- [x] 增加 `/sandbox-preview/:exposureId` 独立认证路由。
- [x] 启动页自动换取 `launch_url` 并使用 `location.replace` 跳转。
- [x] 换票失败时展示可重试错误，不静默跳回工作台。

### 验收

- 已登录用户打开启动路由后只感知一次页面跳转并进入 preview。
- URL 不包含用户 Bearer；launch ticket 只存在于 gateway 返回和随后导航中。
- StrictMode 不重复签发一次性 ticket。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`

## Phase 2：Chat 预览交付物

### 实现

- [x] `expose_sandbox_port` 成功结果渲染为常驻预览卡片，而不是折叠 JSON。
- [x] 卡片展示 label、port、status、expiry，并提供一键打开入口。
- [x] Agent Markdown 中已知 preview hostname 链接转换为同一前端启动路由。
- [x] 中英文文案同步维护。

### 验收

- 用户无需展开 tool call 或理解 exposure/ticket 即可打开预览。
- 点击卡片按钮或 Agent 回复中的 preview 链接都经过认证启动路由。
- 普通外部链接和非 preview tool result 的现有渲染不回归。

### 自动验证

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`

## 手工验证

- [ ] 使用真实 `expose_sandbox_port` tool result 点击一次进入页面。
- [ ] 新标签页内完成 session 换票，preview 页面刷新后仍可访问。
- [ ] exposure 过期或 tunnel 断开时启动页展示明确错误与重试。
- [ ] Vite/Next 页面资源、SPA 路由和 HMR WebSocket 正常。
