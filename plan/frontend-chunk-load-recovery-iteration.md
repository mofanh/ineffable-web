# 前端动态模块加载恢复迭代计划

## 问题

前端路由使用带哈希文件名的动态模块。发布新版本、静态资源网络波动或浏览器仍运行旧入口时，
旧页面可能请求已经不存在的 chunk，并落入 React Router 默认错误页。

生产地址检查结果：

- `index.html` 和 `/assets/*` 均未设置明确的 `Cache-Control`。
- Nginx 的 SPA fallback 会把不存在的 asset 回退到 `index.html`。
- 路由未配置应用自己的 `errorElement`。

## 边界

- `lib/app` 负责 Vite 动态模块加载失败的全局恢复策略。
- `components/app` 负责路由级错误展示，不泄漏异常堆栈给用户。
- `routes` 只挂载错误边界。
- Nginx 负责 HTML 与带哈希 asset 的缓存和缺失资源响应策略。

## 实施

- [x] 首次 `vite:preloadError` 自动刷新，获取最新入口和资源清单。
- [x] 使用 session 级冷却标记阻止连续自动刷新。
- [x] 路由挂载双语自定义错误页，并提供显式刷新操作。
- [x] `index.html` 与 SPA fallback 使用 `no-cache`。
- [x] `/assets/*` 使用长期 immutable 缓存，缺失文件直接返回 404。

## 验收

### 自动化

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm run check:chat-runtime`
- [x] `npm run check:chat-resume`
- [x] `npm run check:polling`
- [x] `npm run check:auth-session`
- [x] 动态模块错误识别针对性运行检查

### 手工

- [ ] 部署后确认 `index.html` 响应包含 `Cache-Control: no-cache`。
- [ ] 确认带哈希 asset 响应包含长期 immutable 缓存。
- [ ] 确认不存在的 `/assets/*.js` 返回 404，而不是 `index.html`。
- [ ] 模拟 chunk 加载失败，确认最多自动刷新一次，随后显示自定义恢复页。

当前开发环境没有 Nginx 二进制或已缓存的 Nginx 容器镜像，Nginx 配置相关验收需随部署执行。
