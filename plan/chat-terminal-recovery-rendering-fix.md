# 聊天终态恢复与消息投影修复计划

## 目标

以后端 `current_run.is_live` 和持久化终态为权威，修复已完成 run 被再次恢复、空补拉
无限循环、下一轮输入误走追加分支，以及实时条目和历史条目重复错序的问题。

## 权威边界

- `conversation.current_run.is_live/status` 与持久化终态事件是 run 生命周期的唯一权威。
- sessionStorage 仅保存 `{conversation_id, run_id, after_seq}` 恢复游标，使用前必须由
  后端 live run 校验，不能证明 run 活跃。
- `streamStatus` 仅描述浏览器传输状态，不参与普通输入的执行/入队决策，也不直接决定
  消息是否显示为 streaming。
- 普通输入统一请求后端，由后端基于同一 conversation 的权威 active run 决定立即执行
  或返回 queued；只有 guided input 保留显式模式。
- Assistant 条目的 `status` 决定流式尾点；提交请求状态决定首包前占位。

## Phase 1：终态恢复收敛

### 实施

- [x] sessionStorage 中的恢复记录只可用于后端仍 live 的同一 run。
- [x] 恢复补拉为空时查询 conversation；后端已终态则本地 finalize 并停止轮询。
- [x] 删除普通输入的前端 active 分支，所有普通输入由后端决定立即执行或入队。
- [x] `streamStatus` 不再决定“正在思考”和流式尾点。

### 验收

- [x] completed run 不再请求 `/subscribe`。
- [x] 后端终态时空补拉最多触发一次状态确认，不进入 1.2 秒无限循环。
- [x] completed/recovering 残留状态下的新输入走新流式 run。
- [x] 同一普通输入发送路径覆盖 idle、streaming 和 recovering 场景。

## Phase 2：final 与历史投影去重

### 实施

- [x] 非流式 final 响应暴露并绑定 `run_id`。
- [x] 实时临时 Assistant 与历史 Assistant 使用 run id 和内容指纹去重。
- [x] 历史同步后保持 user/assistant 时间线顺序。

### 验收

- [x] 同一回答不会同时出现在列表顶部和历史位置。
- [x] 非流式竞态回退创建的 Assistant 能被同 run 历史记录替换。

## Phase 3：后端模型流终态语义

### 实施

- [x] OpenAI-compatible provider 收到 `finish_reason` 时正常结束流。
- [x] 普通新 run 不再因内部 `run_id` 字段产生 `run_resumed`。

### 验收

- [x] MiniMax 完整响应不再记录假 `unexpected_eof`。
- [x] 新 run 事件序列不包含 `run_resumed`，真实 resume 仍保留该事件。

## 自动验证

- [x] 前端 chat runtime/resume/polling 契约。
- [x] 前端 i18n、lint、build。
- [x] 后端受影响测试、`cargo check`、fmt 和高信号 Clippy。

高信号 Clippy 已对 `ineffable-model` 与 `ineffable-cli` 改动目标通过；全量
`-D warnings` 仍被仓库既有的 `derivable_impls`、`uninlined_format_args`、
`manual_clamp` 等 lint 债务阻塞，本轮未扩散无关修改。

## 运行时验证

- [x] 已通过生产日志、PostgreSQL 事件序列和 Nginx 请求轨迹复现根因。
- [ ] 修复部署后使用 MiniMax 与 DeepSeek 分别验证新建、完成、追加和刷新恢复。

## Phase 4：首个可见响应无缝交接

### 实施

- [x] 请求等待占位在 `run_started` 等不可见协议事件后继续展示。
- [x] 文本、思考或工具卡片首次可见时，由消息列表在同一帧替换等待占位。
- [x] 视觉等待只读取当前浏览器订阅状态，不参与后端 run 活跃与输入排队判断。

### 验收

- [ ] “正在思考”与首个可见模型输出之间不再出现空白闪烁。
- [ ] 排队响应不会继续展示“正在思考”。
- [ ] 完成、失败、停止和切换会话后不会残留等待占位。

自动验证已通过 `npm run lint` 与 `npm run build`；以上视觉验收项保留到部署后的
MiniMax/DeepSeek 运行时回归。

## Phase 5：新会话选择身份原子提交

### 根因

`startNewChat` 只更新 React Context 中的 `currentConversationId`，供异步发送与
SSE 回调读取的 `currentConversationIdRef` 要等 effect 才同步。新建后立即输入时，
发送目标可能仍读取前一个会话 ID；创建接口返回后也存在 state 已切换而 ref 尚未
更新的窗口。

### 实施

- [x] 会话选择先同步更新 ref，再提交 Context state。
- [x] 新建空会话、列表切换和创建会话成功统一使用同一选择入口。
- [x] runtime 契约检查覆盖清空和绑定新会话时的同步可见性。

### 自动验收

- [x] `npm run check:chat-runtime`
- [x] `npm run check:chat-resume`
- [x] `npm run i18n:check`
- [x] `npm run lint`
- [x] `npm run build`

### 运行时验收

- [ ] 在旧会话打开时点击新建，立即输入并发送，消息只显示在新会话。
- [ ] 新会话创建后切回旧会话，两边历史与 live run 均保持独立。
