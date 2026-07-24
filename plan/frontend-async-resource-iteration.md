# 前端异步资源体验统一迭代

目标：消除路由切换和数据加载中的空态闪烁、重复请求与内容跳变；统一普通查询和 mutation 的体验，同时保留 Chat、编辑器和认证的专用状态机。

## 边界

- 普通 HTTP 查询使用缓存资源状态：`loading / success / refreshing / error`。
- mutation 保留独立运行状态，并通过资源 `setData` 或 `reload` 更新查询缓存。
- Chat 继续维护 streaming/recovering/approval/SSE cursor 状态。
- 编辑器继续维护 dirty/saving/saved/conflict，远端缓存不得覆盖未保存内容。
- 认证继续维护 bootstrapping/authenticated/unauthenticated，并作为缓存隔离边界。

## Phase 1：资源缓存底座与系统管理切片

- [x] `useApiResource` 支持资源键、短期缓存、并发 Promise 复用和后台刷新。
- [x] 缓存资源支持安全的本地 `setData`，供 mutation 回写。
- [x] 系统管理四页首帧直接进入 loading，不再先显示空态。
- [x] 系统管理四页返回访问时立即展示缓存数据，并在过期后后台刷新。
- [x] 模型、套餐、密钥和用户 mutation 同步更新各自缓存。

## Phase 2：普通资源页与路由预加载

- [x] 模型中心、账号会话、团队成员、邀请通知和自动任务配置稳定资源键。
- [x] 系统管理导航展开或聚焦时预加载页面模块。
- [x] 路由预加载失败不影响正常点击时的 Suspense 兜底。

## Phase 3：特殊资源边界

- [x] Workspace 树按 workspace 分区复用 in-flight Promise，并保留部分成功结果。
- [x] 编辑器只复用进行中的只读请求，并以最新请求提交结果，不覆盖 dirty/conflict 状态。
- [x] Chat 仅复用静态 Workspace 查询，不改流式运行状态机。
- [x] 登出或认证身份切换时隔离或清理缓存。

## 验证

### 自动化

- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`

### 手动

- [ ] 管理员冷启动只显示一次稳定 loading。
- [ ] 管理页之间重复切换立即显示最近成功数据。
- [ ] 手动刷新保留当前内容，不切换为空态。
- [ ] 创建、编辑、删除后缓存内容与服务端结果一致。
- [ ] 网络失败、登出重登、移动端导航和慢速网络行为正常。

> 需要真实管理员登录态或网络限速的项目保持未勾选，未实际执行不标记完成。
