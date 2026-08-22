# Conversation Web Plugin 与流式体验迭代计划

## 状态

- 状态：Planning
- 前端仓库：`/Users/bojingli/self/project/dev/Ineffable-web`
- 前端基线：`73e57e8b32cd25a5d300d98ec64e0cb622f2d922`
- 后端仓库：`/Users/bojingli/self/project/dev/Ineffable`
- 后端基线：`ac126ee1b845b9d43a451ecc14e2542c11131cbb`
- 事实参考：现有 Conversation v1 event/runtime、`plan/doubao-sse-rendering-research.md`、
  DeepSeek Harness Web 的 frame notifier、node seat、incremental Markdown、Reasoning/Tool row。

## 实现目标

把当前 Gateway Chat 从“整条消息随每个 delta 重算”的组件，升级为以稳定 Conversation
Node 为单位的 Web 渲染运行时：canonical 状态持续即时接收，视觉更新按浏览器帧合并，
稳定 Node 不因尾部流式内容重复渲染，长 Markdown 只重算不稳定尾部。

最终用户应得到以下效果：

1. 长回答、连续 Thinking 和高频工具调用期间仍保持稳定帧率，不出现逐 token 抖动或整页重排。
2. 右侧窄栏是一条可快速扫描的活动流；Thinking、Tool、Subagent 默认紧凑，必要时再展开。
3. 全屏模式成为专注阅读视图，正文宽度、代码、表格、产物与 composer 使用一致布局。
4. 所有 Web 展示统一由 Plugin renderer 处理；默认正文、Thinking、Tool、Subagent 也是
   Default Conversation Web Plugin 的 renderer，不保留组件内置的第二套分派逻辑。
5. 不认识、未安装或 payload 非法的 Plugin renderer 安全降级为通用卡片，不能阻断对话。
6. Workspace 产物以 artifact card 离开超长正文，复用现有权限、版本、预览和下载能力。

## 核心边界

### 数据与渲染边界

```text
canonical v1 event
  -> ConversationRuntimeController（连接与恢复）
  -> canonical reducer/projector（立即、完整、可对账）
  -> visual scheduler（rAF 合帧；终态/错误/审批立即 flush）
  -> keyed WebNode store（细粒度订阅）
  -> NodeSeat
  -> 唯一 renderer registry
  -> Default Conversation Web Plugin / 其他 Plugin renderer
```

- canonical fold 与视觉节奏是两层状态：不得为了动画延迟 cursor、terminal、错误或审批事实。
- `conversation-event-projector.ts` 继续是 live event 的唯一投影入口；不在 React 组件重新解析协议。
- stable entry/node 使用稳定 identity 与不可变快照；正在变化的尾部 Node 才发布新引用。
- 历史恢复、live stream 和 terminal transcript reconciliation 必须生成相同的最终可见结构。

### 单一 Plugin Web 边界

canonical projector 只生成一种版本化 `WebNodeView`；默认 Node 与扩展 Node 不建立平行
类型或平行渲染入口：

```ts
type WebNodeView = {
  schemaVersion: 1
  pluginId: string
  renderer: string
  nodeId: string
  payload: unknown
  fallback: {
    title: string
    summary?: string
  }
}
```

- `ineffable.web.default` 是必装的 Default Conversation Web Plugin，注册 text、reasoning、
  tool、subagent、approval、artifact 和 fallback renderer。
- 所有 Node 都通过 `pluginId + renderer` 从同一个 registry 解析；`NodeSeat` 外不得按
  Node kind 写 JSX 分支，旧 `AgentPane` 分派完成迁移后必须删除。
- renderer 组件代码随可信 Web 构建产物发布。
- 后端不得向浏览器下发可执行 JavaScript、任意模块 URL、任意 iframe 或样式文本。
- payload 必须在 renderer 边界做 runtime schema 校验；失败仍通过 Default Web Plugin
  注册的 fallback renderer 展示并保留诊断信息，不绕回旧组件。
- renderer 只能决定展示与明确的用户操作入口，不能修改 run phase、terminal 或 canonical transcript。
- 本轮后端生产代码只允许修改 `crates/plugin/channels/frontend/**` 中的 Web
  manifest/projection；不得修改 Agentic、Gateway service/driver/finalizer、conversation
  canonical event kind 或数据库 schema。现有 opaque metadata 若不足以表达某个扩展，
  则该扩展不在本轮伪造兼容路径，也不跨边界补第二套 Gateway 协议。

## 非目标

- 不改 AgentDefinition、Node 执行、模型/工具循环、checkpoint 或 execution slice。
- 不新增 SSE ACK、三段式 reply-end、TTS channel 或第二套 event transport。
- 不以打字机逐字符动画作为流畅目标；流畅来自有界发布和局部渲染。
- 不实现远程下载并执行 Plugin UI bundle，不实现 Plugin marketplace 或通用页面插件系统。
- 不保留 `AgentPane` 内置 switch 与 Plugin registry 并行运行，也不做 feature flag 双轨迁移。
- 不复制 DeepSeek Harness 的 Cordis 容器、主题配色或完整组件库。
- 不在本轮自动把任意长回复改写成 Workspace 文件；artifact 只消费已有、受权的对象引用。
- 不修改或冲正历史数据库消息；最终展示继续由 canonical transcript 与 terminal watermark 对账。

## Phase 0：基线、契约与可测量性能护栏

### 实现

- [x] 固定 `WebNodeView`、`VisualConversationSnapshot`、稳定 node identity、发布优先级与 terminal flush 契约。
- [x] 建立可注入的 frame/timer scheduler，支持浏览器 rAF、后台标签页 timer fallback 和测试 fake clock。
- [x] 为现有真实事件 fixture 建立 live、replay、terminal reconciliation 等价性基线。
- [x] 增加 render-count/performance harness，记录高频 delta、长 Markdown 和稳定 sibling 的改造前基线。
- [x] 明确唯一 renderer registry、Default Web Plugin 的必装 renderer 集合、允许的交互和安全 fallback；后端仅验证 frontend plugin
  现有 metadata 透传能力，不改其他 crate。

### 验收

- [x] 1000 个同帧正文 delta 不改变 canonical 事件计数，且性能测试能准确统计 visual publish 次数。
- [x] terminal/error/approval 事件在测试中不等待下一帧即可观察。
- [x] live、replay 和 canonical terminal transcript 的最终 pane fixture 深度相等。
- [x] 更新本文件 Phase 0 checkbox，并独立提交一个中文 commit。

## Phase 1：统一 WebNode renderer 与细粒度视觉调度

### 实现

- [x] 建立唯一 renderer registry 与必装 Default Conversation Web Plugin。
- [x] 将 assistant 的 text、reasoning、update、tool 与 subagent pane 全部投影为同一种 `WebNodeView`；user/system/approval 保持 canonical transcript entry，不建立第二套 Agent Node。
- [x] `NodeSeat` 成为唯一 Agent Node renderer 入口；删除 `AgentPane`/调用方对 Node kind 的 JSX 分派，不保留双轨 feature flag。
- [x] canonical reducer/projector 保持即时处理；正文、Thinking 和 tool argument delta 进入 visual buffer。
- [x] 每个 animation frame 至多发布一次当前 conversation 的视觉快照；hidden tab 使用有界 timer flush。
- [x] terminal、error、awaiting-human、approval 和用户显式 stop 先清空 buffer，再同步发布权威状态。
- [x] 当前 conversation 的 transcript 视觉状态使用稳定 node identity 与投影 cache；多 conversation canonical lifecycle 继续由 `ChatRuntimeStore` 分区。
- [x] 引入 keyed `NodeSeat`，流式尾部变化不重渲染稳定历史 sibling。
- [x] 移除与 frame scheduler 叠加的逐字符 typewriter 更新源；reduced-motion 直接消费合帧快照。

### 验收

- [x] fake rAF 中同一 conversation 每帧 visual publish `<= 1`，不同 conversation 相互隔离。
- [x] 正文尾部连续更新时，已完成 Thinking、Tool、Subagent 和历史消息 render count 不增长。
- [x] 每一种默认 Node 与扩展 Node 都能从 registry 解析；测试守卫禁止在 `NodeSeat` 外恢复 Node kind 渲染 switch。
- [x] 后台标签页在无 rAF 时仍于约定上限内显示进度，恢复可见后没有重复 delta。
- [x] disconnect/reconnect、会话切换和 terminal 对账不会丢字、重复 entry 或串 conversation。
- [x] 更新本文件 Phase 1 checkbox，并独立提交一个中文 commit。

## Phase 2：增量 Markdown 与稳定排版

### 实现

- [x] 将 assistant Markdown 拆成稳定顶层块与最多两个不稳定尾块；稳定块复用已解析结果。
- [x] streaming 阶段只解析尾部并以低成本代码展示；settled 后执行一次完整 parse 自愈未闭合 fence、表格和引用。
- [x] settled code block 按需加载语法高亮；高亮失败回退为安全纯文本代码块。
- [x] 建立 `--chat-*` Markdown 语义 token，映射现有主题 token，覆盖正文、标题、引用、列表、表格、inline code 和 code block。
- [x] 保持 Markdown HTML 禁用、链接安全属性、超宽表格/代码横向滚动与复制操作。

### 验收

- [x] 10k/100k 字符流式 fixture 中，已稳定块 identity 不变，单次更新只重算尾部块。
- [x] settled 全量解析结果覆盖未闭合 code fence、跨块引用和表格，且不丢正文。
- [x] 明暗主题、超长无空格文本、宽表格和代码块不撑破 docked/fullscreen 容器。
- [x] 新增异步高亮 chunk 不进入未登录公共入口，生产构建无大 chunk 警告回归。
- [x] 更新本文件 Phase 2 checkbox，并独立提交一个中文 commit。

## Phase 3：Reasoning、Tool、Subagent 与对话布局重构

### 实现

- [ ] docked 模式采用紧凑活动流：运行中的 Thinking 默认折叠并显示最新非空摘要行，用户可随时展开/收起。
- [ ] Tool 使用单行 disclosure 展示名称、状态和耗时；运行中也不强制展开，失败摘要保持可见。
- [ ] Subagent 以 lineage、状态、最近活动摘要呈现，详细过程按需展开。
- [ ] run header 用明确阶段与耗时替代无语义活动点；terminal 详情仅在需要时展示。
- [ ] 用户消息保持独立气泡与受控最大宽度；assistant 内容不套厚重卡片。
- [ ] fullscreen/focus 模式采用约 720–780px 居中阅读列，composer 对齐正文；表格、diff、terminal 可安全扩展。
- [ ] 修正现有 chat 视觉小缺陷，包括重复 terminal metadata 文本、运行块不可折叠和状态层级不一致。

### 验收

- [ ] 300–640px docked 宽度、390px viewport 和 fullscreen 均无横向页面溢出。
- [ ] 用户上滑后不被流式输出抢回；贴底时 Thinking 折叠、Markdown 增高和 tool 状态变化持续跟随。
- [ ] 键盘可聚焦并切换所有 disclosure；focus-visible、ARIA state 与 reduced-motion 正常。
- [ ] 更新中英文资源，`npm run i18n:check` 通过。
- [ ] 更新本文件 Phase 3 checkbox，并独立提交一个中文 commit。

## Phase 4：Plugin 扩展 renderer 与后端声明式投影

### 实现

- [ ] 复用 Phase 1 的唯一 registry 注册一个非默认 Plugin renderer，不新增另一套容器或状态模型。
- [ ] 对 `WebNodeView` 做版本、plugin/renderer identity、payload 大小与 renderer-specific schema 校验。
- [ ] unknown renderer、未安装 plugin、版本不兼容或 payload 非法时使用统一 fallback card，不抛出渲染树异常。
- [ ] backend 仅在 `crates/plugin/channels/frontend/**` 定义/验证 Web manifest 或 projection 数据，复用现有 metadata 透传。
- [ ] 禁止 remote code/module URL、任意 HTML/CSS/iframe；交互动作只映射到前端已有且鉴权的命令。
- [ ] 增加一个最小示例 renderer，证明扩展 Plugin Node 可以与 Default Web Plugin Node 混排并独立更新。

### 验收

- [ ] fixture 覆盖合法、unknown、schema mismatch、oversized payload 和 renderer exception 五类路径。
- [ ] Plugin view 失败不影响同一 turn 的正文、其他 Node、terminal reconciliation 或后续消息。
- [ ] 后端 diff 的生产代码路径严格位于 `crates/plugin/channels/frontend/**`；若无需后端变化，在计划中记录复用证据而不制造空抽象。
- [ ] frontend plugin crate 定向测试、check、Clippy 通过；前端 lint/build 通过。
- [ ] 更新本文件 Phase 4 checkbox，并在对应仓库分别提交独立中文 commit（无后端 diff 时只提交前端）。

## Phase 5：Workspace Artifact 展示闭环

### 实现

- [ ] 从已有、已授权的 canonical metadata/tool result 提取 Workspace object/version 引用，不读取或复制文件 bytes 到事件。
- [ ] finished turn 展示 artifact chips/cards：标题、类型、大小、版本/来源与打开入口；过多产物折叠为 overflow。
- [ ] 点击后复用现有 Workspace 查看/编辑路由、权限与版本能力，不新增 iframe 文档系统。
- [ ] 对对象删除、无权限、版本变化和未知 MIME 提供稳定错误/降级状态。
- [ ] artifact 作为独立 Node 保持稳定 identity，正文后续更新不重新渲染已完成卡片。

### 验收

- [ ] Markdown、代码、JSON、图片/未知类型引用均使用真实 Workspace fixture 正确展示或降级。
- [ ] 未授权或失效引用不泄露名称之外的内容，不发起未鉴权 raw/download 请求。
- [ ] 多 artifact 在 docked/fullscreen 下可扫描且不撑破消息列。
- [ ] 更新本文件 Phase 5 checkbox，并独立提交一个中文 commit。

## Phase 6：集成验收、文档收口与最终独立审计

### 实现

- [ ] 覆盖真实 SSE：长正文、Thinking→正文、并行工具、工具失败、Subagent、approval、stop、断线恢复和 terminal 对账。
- [ ] 使用 React Profiler/render counter 与浏览器 Performance trace 验证帧级发布、局部重渲染和 Markdown 长文本表现。
- [ ] 验证 docked/fullscreen、浅色/深色、桌面/390px、键盘、screen-reader label 与 reduced-motion。
- [ ] 更新前端 `AGENTS.md` 的长期渲染边界；把仍有效的 Doubao 研究结论合并到本计划或长期文档后，按 plan 生命周期清理被替代的活跃计划。
- [ ] 两个仓库 worktree 均清洁后，对各自 baseline→head 的完整 diff 启动一次只读独立审计。
- [ ] 若审计存在 P0/P1，由主 agent 一次性整改并提交；有代码变化时最多再做一次新鲜复审。
- [ ] 最后运行完整确定性 CI，并记录未执行的外部/手动验证，不以推测代替证据。

### 验收

- [ ] 高频流输出肉眼连续，无逐字符抖动；长回答增长期间 composer 输入和 disclosure 交互保持响应。
- [ ] profiler 证明稳定 sibling 不随 streaming tail 重渲染，visual publish 符合 frame 上限。
- [ ] canonical transcript、terminal watermark 与最终可见节点一致，无重复历史回答、幽灵 running card 或丢失总结。
- [ ] 最终审计无 P0/P1，确定性 CI 全部通过。
- [ ] 更新本文件 Phase 6 checkbox，并独立提交最终中文 commit。

## 确定性 CI

### 每个前端 Phase

```bash
npm run i18n:check
npm run lint
npm run build
```

同时运行该 Phase 新增的定向测试；若当前项目测试底座不足，Phase 0 必须先建立可由 CI
稳定执行的 chat runtime/component 测试命令，不能只依赖浏览器肉眼检查。

### Backend Plugin Phase（仅有后端 diff 时）

```bash
cargo fmt --all -- --check
cargo test -p ineffable-frontend -p ineffable_plugin
cargo check -p ineffable-frontend -p ineffable_plugin
cargo clippy -p ineffable-frontend -p ineffable_plugin --all-targets -- -D warnings
```

### 最终集成 Gate

- 前端：i18n check、全部 chat 定向测试、lint、production build。
- 后端：仅当 backend plugin 有 diff 时运行上述定向 fmt/test/check/clippy。
- Runtime：连接真实 Gateway 的 Conversation v1 SSE 完成至少一轮长正文 + Thinking + Tool + terminal 对账。

## 运行时与人工验证假设

- 真实 SSE 验证需要可登录账号、可用模型 route 和至少一个可执行 Tool；缺少时必须明确标为未执行。
- 浏览器 Performance trace 使用固定 fixture/模型输出规模，避免把 provider 网络波动当作渲染性能。
- Artifact 权限验证需要一个允许读取和一个禁止读取的 Workspace object；不创建或删除用户未授权的数据。
- 本轮不做数据库迁移、历史消息冲正或生产发布。

## 完成定义

- Phase 0–6 全部完成并逐 Phase 更新 checkbox、运行对应验证、提交独立 commit。
- 必装 Default Conversation Web Plugin 与扩展 Plugin 共用同一个 `WebNodeView`、registry、`NodeSeat` 和视觉 store。
- Plugin Web view 只能改变展示，不能影响 Agentic/Gateway 的权威执行与终态。
- 后端生产 diff 不越过 frontend plugin 边界。
- 最终独立审计无 P0/P1，确定性 CI 通过，两个仓库 worktree 清洁。
