# Node 迭代首发状态交接

状态：Implementation complete / Audit pending

实施基线：`557c167`

## 完整合同

修复尚未持久化的新会话开启 Node 迭代后，首条消息创建会话期间开关闪回并停留在关闭
状态的问题。前端只保留一份带目标身份的临时交接状态；首发请求继续通过现有
`agent_iteration_requested` 由 Gateway 持久化，发送被接受、拒绝或异常后均重新读取
Agent Evolution projection，以 Gateway 为最终权威。

## 非目标

- 不新增第二次设置偏好的写请求，不改变 Gateway API 或数据库结构。
- 不让本地草稿长期覆盖 Gateway projection。
- 不改变已有会话直接切换 Node 迭代、套餐裁决或 AgentDefinition 选择语义。

## Phase A：身份化状态交接与权威对账

- [x] 新会话创建后把本地 requested 草稿绑定到明确的 conversation/workspace target。
- [x] projection hydration 遇到同一 pending target 时保持草稿，不先写回默认关闭。
- [x] handoff 期间锁定开关，避免首发写入与用户二次切换竞争。
- [x] 首发 accepted、queued、空响应、prime 失败和 transport 失败均触发一次 Gateway projection 对账。
- [x] projection 返回后清理 pending handoff；读取失败不伪造关闭状态，并允许后续恢复。
- [x] 会话或 workspace 切换继续使用 request generation 与 target key fencing。

## 验收

- [x] 新会话开启 Node 迭代并发送首条消息时，开关不闪回关闭。
- [x] 首发成功后 UI 与 Gateway `requested` 状态一致。
- [x] `npm run check:agent-iteration-handoff`、Chat Runtime/Architecture/Web Runtime、i18n、lint 和 build 通过。
- [ ] 完成一次独立只读审计，无 P0/P1。

真实页面验证（`001@gmail.com`）：开关发送后保持开启，交接期间禁用；Gateway 回读后
恢复可操作并显示“开放运行时”。首发请求只携带现有
`agent_iteration_requested: true`，未新增偏好写入接口。模型因账户 Token Plan 额度
返回 429，但请求接受及 projection 对账已经完成，不影响本项状态交接验证。

首次审计发现对账期间切换 target 会使全局 request generation 废弃返回值、遗留 pending
handoff。补救改为每个 handoff 使用对象身份结算：成功或失败均只清理自己创建的 pending，
导航离开时不写 UI；返回时若仍是目标会话则直接应用权威 projection。待复审确认。

补救后的真实竞态验证：人为延迟新会话 projection 2.5 秒，在 pending 期间切换到旧会话
再切回；返回结果结算后开关保持开启、解除锁定并显示“开放运行时”。
