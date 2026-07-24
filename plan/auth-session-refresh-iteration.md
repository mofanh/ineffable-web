# 认证会话静默续期迭代计划

## 背景

当前 access token 到期后，基础请求层会弹出提示、调用 refresh 接口并强制刷新页面。该行为存在以下问题：

- refresh 成功后只更新 localStorage，没有同步 React session。
- 登录接口返回的 `access_expires_at` / `refresh_expires_at` 未持久化和使用。
- 普通 JSON、SSE、conversation stream 和 sandbox preview 分别直接请求，续期行为不统一。
- 多个并发请求同时遇到 token 到期时，缺少共享的 in-flight refresh。
- 页面从后台恢复时只能等业务请求失败，无法提前静默续期。

## 架构边界

```text
AppSessionProvider
  -> 注册 token snapshot / refresh / persist / expire adapter
    -> auth-session-runtime（单飞、到期判断、运行时最新 token）
      -> base-client requestApi（统一认证请求与一次重试）
        -> JSON API / SSE / conversation stream / sandbox preview
```

- `auth-session-runtime` 归属 `lib/api`，不依赖 React、通知或业务 feature。
- `AppSessionProvider` 负责 token 状态、持久化、主动续期和最终失效清理。
- API 请求层只负责使用最新 access token、识别认证失败、触发一次续期并重试一次。
- refresh endpoint 自身不携带 access token，不进入递归续期。
- refresh token 失败后清理会话并进入登录页，不再强制刷新浏览器页面。

## Phase 1：认证运行时与普通请求重试

### 实现

- [x] 建立认证运行时 adapter 和单飞 refresh Promise。
- [x] 统一秒级/毫秒级 token 到期时间。
- [x] 普通 JSON 请求优先使用运行时最新 token。
- [x] 401 或明确 token 过期响应触发一次 refresh，并使用新 token 重试一次。
- [x] 删除基础请求层的通知、延时器和 `window.location.reload()`。
- [x] 增加认证运行时专项检查脚本。

### 验收标准

- [x] 多个并发过期请求只调用一次 refresh。
- [x] 已被其他请求刷新的旧 token 不重复 refresh。
- [x] refresh 失败只触发一次 session expired 回调。
- [x] 公共登录、注册和 refresh 请求不进入认证重试。

## Phase 2：React session 与全部请求链路

### 实现

- [ ] AppSession 持久化 access/refresh 到期时间。
- [ ] refresh 成功同步更新 React token state 和 localStorage。
- [ ] 页面激活、网络恢复及到期前触发静默续期。
- [ ] conversation SSE、发送流、旧 Gateway stream 和 sandbox preview 接入统一请求。
- [ ] 跨标签页 token 更新和登出同步到当前 React session。

### 验收标准

- [ ] 页面闲置后恢复不会因为 access token 正常到期而强制刷新。
- [ ] 普通 API 和新建 SSE 请求都能在认证失败后静默续期一次。
- [ ] refresh token 失效时清理会话并由路由进入登录页。
- [ ] 主动续期和被动 401 续期复用同一个 in-flight Promise。

## Phase 3：规范、验证与人工回归

### 文档

- [ ] 在前端开发指南和 AGENTS 记录认证请求与静默续期规则。

### 自动验证

- [ ] `npm run check:auth-session`
- [ ] `npm run i18n:check`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `git diff --check`

### 人工验证

- [ ] 缩短 access token TTL，页面保持前台时确认无感续期。
- [ ] 页面进入后台并跨过 access token 到期时间，恢复后确认不刷新页面。
- [ ] 同时触发多个 API 请求，确认服务端只收到一次 refresh。
- [ ] 进行中 SSE 跨过 access token 到期时间后保持连接；断线恢复使用新 token。
- [ ] 让 refresh token 失效，确认清理会话并进入登录页。
