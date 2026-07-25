# 聊天追加输入确认式入队计划

## 目标

活跃会话追加输入等待后端确认后再显示为 queued；请求期间只展示等待效果，失败不制造
短暂的乐观队列项。

## 实施

- [x] 增加 enqueueing 状态并阻止同一输入重复提交。
- [x] 普通追加输入不再预插入 `pending` 队列项。
- [x] 收到后端 queued envelope 后使用 `pending_id` 插入正式队列项。
- [x] 成功后清空输入框；失败时保留或恢复输入并显示 Toast。
- [x] 响应绑定发起时的 conversation，避免切换会话后误写当前队列。
- [x] 空 sandbox 选择明确显示为“不使用沙箱”，不再暗示自动选择。
- [x] active 判定同时使用目标会话的本地 SSE 与后端 `current_run.is_live`。
- [x] 非 active 分支也等待首个非 queued envelope 后再渲染 user message。
- [x] 后端返回 queued 时不创建 user/assistant 气泡，只保留正式队列项。
- [x] 无 live run 时禁用 guided promotion，避免无效 409。
- [x] 普通 send 与活跃会话追加输入统一在点击后立即显示提交中图标，首个后端
      envelope 到达后切换为正常流式状态。

## 验收

- 请求未完成时显示等待效果且队列不变。
- 普通 send 点击后立即显示提交中图标，不等待首个 SSE 事件才反馈。
- 失败时队列不变、输入保留、Toast 可见。
- 成功时只出现一个服务端确认的 queued 项。
- lint、build、聊天 runtime/resume 与 i18n 检查通过。

## 验证记录

- `npm run lint`
- `npm run build`
- `npm run i18n:check`
- `npm run check:chat-runtime`
- `npm run check:chat-resume`
- `npm run check:polling`
