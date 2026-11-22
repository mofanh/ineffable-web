# DSH 结构高还原工作台（Active）

## 1. 当前授权与实施基准

**用户已明确授权“那实施吧”：主 Agent 在原目录、原功能分支执行 P0–P5；不自动合并、不推送。** 采用 DSH 成熟的整体页面结构和核心交互，不以“中央聊天 + 局部换肤”作为目标。保留用户已有改动，逐阶段中文提交；全部实施后再集中独立只读审计、整改与确定性 CI。

- 实施仍在原前端目录、原分支 `feat/conversation-workbench`；当前 HEAD `57ebb24250c8c888c23cc495d477519dca152de8`，原始会话优先基线 `dc4083a`。不另开实现 worktree。
- 参考版本：运行 DSH 与 CLI/source manifest 均为 `0.2.2-rc.5`；参考 checkout HEAD `2e39e70496aa02986ca6a820c5d497e816b69d7e`。实施锁定此版本，不跟随上游漂移。
- 保留用户的 [Dockerfile.source](</Users/bojingli/self/project/dev/Ineffable-web/Dockerfile.source>)、[design.md](</Users/bojingli/self/project/dev/Ineffable-web/design.md>) 及后端改动；不暂存、重写、回滚它们。既有布局测试的一行 dialog-hidden 等待保留，不算本轮新增实现。
- 基线包含已独立复核的 breadcrumb/dirty editor 与 portal owner 修复；**57ebb24 后新目标的最终完整串行 CI 未执行**，不据旧绿灯宣称完成。
- 本方案是获准实施的布局合同。同步更新 [开发指南 §3.6](</Users/bojingli/self/project/dev/Ineffable-web/FRONTEND_DEVELOPMENT_GUIDE.md#L99-L149>) 与 [AGENTS 布局规则](</Users/bojingli/self/project/dev/Ineffable-web/AGENTS.md#L426-L453>)，明确替代旧 256px 左栏、44% 右列与 1024 以下一律抽屉规则；P1–P4 逐阶段兑现，权限、状态、identity 和无障碍规则不得削弱。用户持有的旧设计文档不改写。

## 2. 代码结论与迁移策略

### 2.1 不是换技术栈，也不是直接搬整个 DSH

DSH 是 React/TypeScript + Cordis Client Slots；Ineffable 是 React/TypeScript + React Router + Tailwind/shadcn/Radix。两者展示技术兼容，但启动、状态、服务和组件注入合同不同。

- DSH 的 [Web Client 分层](</Users/bojingli/self/project/dev/deepseek-harness/docs/subsystems/web-client.md#L9-L26>) 明确 Host → transport → client model → UI adapter → presentation/slots → React；启动依赖 `window.__DSH_BOOT__`。这部分不移植。
- 可复用的是布局算法、CSS/token 数值、纯展示 JSX、菜单/键盘交互模式；复用前去掉 Cordis props/hooks、remote 调用和特定品牌依赖。不是让 Ineffable 直接安装运行 DSH UI 插件。
- 现有 [AppShell](</Users/bojingli/self/project/dev/Ineffable-web/src/app/app-shell.tsx#L79-L137>) 已有持久 ChatWorkbench 和单一 Outlet，是可用底座；固定 44% 资源列和所有路由都归入资源的分类需要改，不推倒聊天执行链。
- [当前左栏](</Users/bojingli/self/project/dev/Ineffable-web/src/features/workspace/app-sidebar.tsx>) 混合文件树、工作区操作、账号与导航，应按职责提取展示区，但文件请求、权限、CRUD 和生命周期仍只保留一份。
- [当前设置页](</Users/bojingli/self/project/dev/Ineffable-web/src/pages/settings-page.tsx#L7-L32>) 是分组链接页，不是 DSH 的设置对话框；此处需要真实结构迁移，不只是改圆角。

### 2.2 保留与不做

保留 Ineffable 的品牌、登录、个人/团队空间、模型与环境目录、Automation、管理权限、文件/版本/编辑器、所有可用深链。整体观感和核心交互以 DSH 为准；这些是明确保留的产品差异，不做两个前端或“旧版/DSH 模式”开关。

不做 DSH 的 Cordis/plugin host、Session 数据库、设置后端、模型路由、进程管理和桌面原生壳。不为像素一致伪造本地终端、Git/patch diff、宿主文件访问、插件市场、未读/置顶/分组持久化或未知后端动作。已有的工具和子 Agent 展示纳入本轮外观/交互收敛，但不另造 renderer、执行状态机或日志协议。

### 2.3 DSH 参考组件 → Ineffable 迁移层

| 真实上游 owner | 择取内容 | 不带入的依赖/语义 |
| --- | --- | --- |
| [AppFrame](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx#L1-L66>) / [columns](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-layout/src/client/columns.ts#L11-L63>) | 三轨结构、优先级和限幅算法 | Cordis root/main/rightbar slots、客户端布局 store |
| [SidebarRoot](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-sidebar/src/client/SidebarRoot.tsx>) | rail/展开/全局入口/底栏层级、焦点恢复 | Host workspace/session actions；展开树卸载策略不照搬 |
| [ConversationRoot CSS](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css#L419-L497>) / [HeroShell CSS](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/HeroShell.module.css#L1-L60>) | 消息/输入轴、空会话 Hero、流式主轴 | Conversation controller、session 选择与输入锁定语义 |
| [InputBar](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx#L1-L65>) / [keymap](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/keymap.ts#L287-L326>) | 输入卡、chips/工具条、IME/菜单优先级 | Lexical/InputHub/accelerated delivery 协议；保留现有受控输入，不为外观换编辑器 |
| [ChatFlow](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-chat/src/client/chat/ChatFlow.tsx#L26-L99>) / [AssistantNodeView](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-chat/src/client/chat/AssistantNodeView.tsx#L17-L65>) | keyed 稳定展示、正文/思考/过程层次 | DSH node reducer/echo/turn identity |
| [ToolCallTree](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-tool/src/client/tool/ToolCallTree.tsx#L9-L101>) / [ApprovalCard](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-approval/src/client/ApprovalCard.tsx#L14-L88>) | 原子工具展示、fallback、待处理动作与局部快捷键 | DSH 工具 catalog 和 Remote promise；保留 Gateway pending_need + 原 epoch/CAS/receipt |
| [SidebarRight](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-sidebar-right/src/client/shell/SidebarRight.tsx>) / [documentpreview 注册](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-sidebar-documentpreview/src/client/index.ts#L85-L133>) | 右侧资源呈现、标题/正文分区、专注与隐藏 | 本地 cwd 解析/路径授权、另建 per-session 多 pane 域 |
| [SettingsRoot](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.tsx#L1-L71>) / [设置 CSS](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.module.css#L79-L124>) | 800/188/28 几何、分组导航、移动全屏 | ui-settings Host schema/persistence、插件设置和原生标题栏 |
| [base tokens](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-theme/src/styles/base.css#L7-L23>) / [design-platform](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css#L4-L87>) | 14px 级密度、系统字体、4/8/12/16/20/28 圆角、.1/.2/.3s 动效和语义色阶 | DeepSeek 品牌字形/鲸鱼/第三方资产；不新增 theme 配置后端 |

右侧 browser 仅在某些 profile 启用，DSH 插件 roster 不等于当前浏览器默认能力；不将内嵌浏览器、任意 Office 预览或 tab 拖放承诺为本次已具备能力。

## 3. 最终页面与交互合同

### 3.1 页面骨架

```text
Ineffable Shell（DSH 的结构与密度，Ineffable 的品牌与业务）
├─ 左导航：品牌/折叠/新会话 → 全局入口 → 会话浏览 → 设置/账号
│  └─ 工作区文件树：保留原功能，作为可折叠资源浏览区，不压住会话入口
├─ 主区域：会话为默认中心；全局业务页在中央专注显示
│  ├─ 会话头：当前标题、真实状态、现有会话动作
│  ├─ 共享阅读轴：消息 → 思考/工具/子任务/审批 → 最终答复
│  └─ 底部输入卡：附件/引用、草稿、模型/环境/设置、发送/停止/队列
├─ 上下文右面板：文件/预览/版本等真实资源，支持缩放/隐藏/专注
└─ 设置层：DSH 式导航+内容对话框；窄屏全屏；复杂管理页进入中央
```

默认进入 `/chat`，不展示仪表盘、欢迎营销块、第二个聊天窗口或常驻操作说明。左栏不再让会话区硬性受 `max-height:50%` 限制；顶/底操作固定，中部内容分区滚动，资源树默认收拢到合理层级。保留 workspace 菜单内团队创建/邀请/成员/归档等入口，不用 DSH 的“本地目录”概念替换它。

### 3.2 几何与响应式（明确替代当前固定三栏）

参照 [DSH 布局合同](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-layout/README.md#L26-L36>)：

| 区域 | 实施目标 | 边界处理 |
| --- | --- | --- |
| 展开左栏 | 默认 280px，可在 264–420px 调整 | 折叠为 56px rail；拖拽不加 transition，拖拽结束再保存纯 UI 偏好 |
| ≥1024px | 展开导航、中央会话、按需右面板 | 尽量留中央至少 400px；右面板先让步，再自动收导航/关闭并排右面板 |
| 768–1023px | 导航自动成为 56px rail，可手动展开 | 不是现有“全都抽屉”；开启右侧优先收起展开导航；空间不足资源进入专注单面，不强行压缩聊天 |
| <768px | modal drawer 导航，不占列 | 会话与资源互斥；选择后关闭抽屉；320/390px 不溢出 |
| 右面板 | 初次偏好 45% **视口**宽；像素偏好上限 70%，最小 300px | 与有效可用宽度共同夹取；用户偏好和本次计算宽度分开保存，缩窗不污染偏好；不足并排时保留选中资源、改显同一专注面 |
| 阅读轴 | 共享中心轴；消息基准宽 `B = clamp(680px, columnWidth × .64, 880px)`；实际消息宽 `M = min(B, A − 64px)`，输入卡宽 `C = M + 32px`（最大 912px） | `A` 为共同扣除 scrollbar/gutter 后的可用宽，消息每侧至少 32px、输入卡每侧至少 16px；窄屏也保持实际宽差 32px。不是把 680px 当手机最小宽度，也不能分别截断成等宽；由同一组 token/算法派生 |
| 设置 | 桌面最大约 800×800px，左导航 188px | 受视口留白约束；<768px 全屏，导航横向；长内容只滚动内容区 |

阅读轴公式适用于正常可见主列；消息的实际窄屏留白参照 [ChatView padding](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-chat/src/client/chat/ChatView.module.css#L30-L32>)，输入卡参照 [InputBar padding](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css#L6-L10>)。例如共同可用宽 `A=320px` 时，消息 256px、卡 288px；测试测的是扣除 gutter 后的同一容器，不把 viewport 宽误代入。

几何由一个 shell 布局 hook/纯函数计算；不把“是否 drawer”“聊天资源互斥”“当前 pane owner”合成一个 boolean。断点至少区分 navigation presentation 与 content layout。右面板不足空间时显式保留用户最近交互 pane：带设置/审批弹层的聊天不得隐藏在其 portal 后方；新资源导航显露真实目标，不隐式停止后台 run。

保留 Ineffable 已有 visualViewport/软键盘与 safe-area 处理，不盲搬 DSH 原生 caption、振动材质或折叠屏专用分支。先验 Chrome 实际键盘/触摸，再宣称移动体验完成。布局开关、拖拽和普通 resize 不重挂聊天、composer、资源编辑器；真正换路由/身份仍遵守既有生命周期。

### 3.3 左栏、会话头和导航

- 顶部新会话/折叠、低噪音全局入口、中部列表、底部设置/账号按 DSH 层级组织。Automation 映射成熟全局入口；管理和低频配置进入设置导航，不复制业务页面。
- 会话标题、状态、选中、新建、刷新/改名等只使用现有受控投影与命令。搜索当前若仅过滤已加载标题，必须保持这个真实范围，不标成“搜索所有消息”。缺少接口的操作不出现假按钮。
- 普通会话属于用户，不绑定浏览中的 Workspace。DSH 的目录会话分组不能硬套成团队空间的权限分组；可展示现有时间分组/搜索，Workspace 区只管资源浏览。
- 工作区树从现有 owner 提取展示区并保留唯一请求链；多空间/空态/权限失败/100 文件长树都可用。不能为重新组织左栏增加全会话详情请求或全空间递归抓取。
- 全局路由（Automation、管理等）进入中央专注页；资源路由进入右面板/资源专注；浏览器返回、前进、直接打开和刷新得到同一目标。隐藏资源不是删除，不清草稿；从全局页回会话不新建会话。
- 收起后的宽导航隐藏内容、关闭的 drawer 退出 Tab 顺序和可访问树，rail 上可见控件仍可聚焦；Escape 按最上层关闭，焦点回到仍可见的触发器。不以宽内容全部卸载的 DSH 动效做法破坏本项目持久编辑/输入。

### 3.4 消息、执行展示与输入区

- 复刻 DSH 的消息留白、正文排版、弱层级执行行、展开详情和统一输入卡；最终答复是主叙事，不把所有工具都堆成等权大卡片。
- Think、Tool、人工问题/审批、子 Agent 和最终答复从既有 WebNode 投影进入既有 registry/seat，使用同一稳定 occurrence identity。只改其呈现组件、样式和 disclosure，不从 tool 名字/输出文本再推断第二套分类。
- 正在进行、成功、失败、取消、等待人工等保留正式状态；重连不伪装思考，POST ACK 不伪装 run 已创建。审批/问题卡默认保证待处理动作可见；已折叠执行摘要仍暴露失败和等待状态。
- 文件产物沿用 Workspace 对象与版本引用打开；终端文本仅展示现有可信输出，不能添加一个假的可交互 shell。未知/坏 payload 继续单节点 fallback，不能令整条对话崩溃。
- Composer 保留单一 draft/attachments/selection；`@` 菜单、粘贴、拖图、输入法、模型/环境/能力/迭代选择和请求 readiness 使用原合同。DSH 的输入视觉不带入它的 pending 队列状态或提交协议。
- 工具条采用 DSH 密度与分区，但模型/环境是现有 Ineffable 业务控件；小宽度优先省略长名称并保留 title/可访问名称，不隐藏环境语义或将发送挤出屏幕。若需换行，先用容器断点证明，显式替代旧“所有控件永远单行”规则。
- 空会话采用 DSH 式居中的短品牌标题 + 输入卡（不是欢迎营销块）；首次发送后同一 composer 经 CSS 布局落到底部，不能 Hero 和 active 各建一个输入实例。会话头常规参考 min-height 76px，空会话 40px；输入文字区上限参考 336px，超过后内部滚动，按当前 viewport 进一步约束。
- 发送/停止/继续/预输入/引导输入均调用原命令，保留拒绝、在途禁用、幂等与操作 identity。Enter 发送、Shift+Enter 换行；菜单先消费、IME/repeat 不发送。DSH 的 Cmd/Ctrl+Enter accelerated delivery 不照搬为本项目的新执行语义；保留现有业务提交能力并把这个差异列入交付。
- Mod+B 调同一导航动作，尊重已消费事件、modal 和输入上下文，不新增全局键盘总线。DSH 的 [双 Escape 停止](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-conversation/src/client/stop-sequence.ts#L1-L53>) 可接现有 stop 命令，但须同一 session/conversation/run/epoch/聚焦区、两次独立非 repeat 按键；菜单/弹窗/审批/IME/编辑器先消费。P0 先核对间隔设置及本项目既有快捷键，P2 明确参数与断言后才启用，不能全局一次 Esc 杀 run；无法满足时保留停止按钮并记录差异。
- DSH 的 [scrollBody 与 sticky composer](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css#L444-L549>) 共用滚动区，输入卡上方有固定 36px 渐变带；不是独立锁死 footer。P2 在原 scroller/window owner 内适配这种结构，wheel 落在输入卡空白处也能滚动会话，输入内部到边界再交接；稳定 gutter 防横漂。若必须移动 DOM 层级，作为一次受测结构迁移，完成后 Hero/active/resize 不再换树。
- 滚动跟随、离底提示、历史分页、窗口化和嵌套工具滚动仍由原 owner 管；不能复制 DSH 的 use-chat-reading 再叠一套状态机。用户上翻不因 delta/resize 强拉尾，正在跟随才继续跟随；改后必须用真实流式帧和长历史验证，不能在每个展示组件里加自动滚动。

### 3.5 设置与资源不是同一种页面

- 设置采用 DSH 的对话框结构、分组导航、控件密度和窄屏全屏交互；首批是通用设置（现有外观/语言），其余为现有账号、模型、渠道、Agent Node 和权限可见的系统管理入口，不照搬 Host/plugin 设置项。**建议把外观/语言控件从账号菜单迁入通用设置，账号菜单只提供跳转，继续使用原 theme/i18n provider。** 这是对 [AGENTS:673–674](</Users/bojingli/self/project/dev/Ineffable-web/AGENTS.md#L673-L674>) 放置规则的显式替代，P0 同步更新，不双份呈现或另建状态。
- 现有 `/settings`、`/account`、`/models`、`/channels`、`/agent-nodes` 与 admin 深链保留。首期 `/account`（资料、会话偏好、改密、设备）和复杂列表/编辑页继续中央打开；设置导航给清晰跳转/返回，不把整页表格强塞进 800px modal。若后续确需内嵌轻量账号内容，再从 [account-pages](</Users/bojingli/self/project/dev/Ineffable-web/src/pages/account-pages.tsx#L217-L315>) 提取 feature 内容而不是把自带 main/scroll/padding 的 [AppPage](</Users/bojingli/self/project/dev/Ineffable-web/src/components/app/app-page.tsx#L19-L22>) 整页套进去；这不作为首期隐含重构。
- SettingsRoot 只有一个展示 owner：普通底部设置按钮打开 Shell 的 overlay，不改当前资源 pathname，关闭恢复原 pane/focus，脏编辑器仍挂载；直接 `/settings` 则由 route metadata 驱动同一个 overlay，关闭 fallback `/chat`。不能同时让路由页和全局层各渲染一个 SettingsRoot；`/settings` 路由只作入口协调。此方案保留可分享深链，但普通开合不新增浏览历史（有意的产品差异）。
- 从设置跳往 `/account` 等真实业务路由，须先通过既有未保存保护；接受导航后才是正常 route element 替换，不承诺原资源跨不同路由 keepalive。取消导航则保留原编辑器与设置上下文，不提前关层清空。业务页返回使用可信内部来源或 `/chat` fallback；不无条件 `navigate(-1)` 以免离开产品。保存中/未保存保护和请求代次继续由业务 owner 裁决。
- 资源面板保留完整 breadcrumb、leading/trailing、Save/Discard/版本操作和脏编辑保护。空间不够工具条换行，不重现祖先链接 0px 的 WB-01。
- 右侧首期用现有文件/目录/预览/版本能力，不为了像 DSH 添加无数据 Tabs。只有同一资源多种现有视图确有复用时才组合 tabs；不引入多文件工作台、独立 tab 缓存或另一份编辑器状态。

## 4. 文件级接入与状态边界

下列新文件名仅为建议，实施时按真实职责和仓库分层确定，不先建一堆空接口。

| 改动点 | 现有 owner / 落点 | 如何接入、不可越界 |
| --- | --- | --- |
| Shell/几何 | [app-shell.tsx](</Users/bojingli/self/project/dev/Ineffable-web/src/app/app-shell.tsx>)；建议 app 内 `workbench-layout.ts` | 只管 sidebar width/presentation、route kind、panel width/visibility/focus；不持有 run、message 或权限副本 |
| Sidebar primitive | [sidebar.tsx](</Users/bojingli/self/project/dev/Ineffable-web/src/components/ui/sidebar.tsx>) | 原生增加受控 rail/drawer/宽度能力；业务分类/鉴权仍在 feature；不全站机械替换 shadcn primitives |
| 业务导航/树 | [app-sidebar.tsx](</Users/bojingli/self/project/dev/Ineffable-web/src/features/workspace/app-sidebar.tsx>)、[chat-sidebar-header.tsx](</Users/bojingli/self/project/dev/Ineffable-web/src/features/chat/components/chat-sidebar-header.tsx>) | 提取展示职责，保留原工作区请求和唯一 conversation portal；新组件只收 plain data/callbacks |
| 路由/设置 | [navigation.ts](</Users/bojingli/self/project/dev/Ineffable-web/src/routes/navigation.ts>)、[settings-page.tsx](</Users/bojingli/self/project/dev/Ineffable-web/src/pages/settings-page.tsx>)、[header context](</Users/bojingli/self/project/dev/Ineffable-web/src/app/shell/app-header-context.tsx>) | route metadata 分类 conversation/global/resource/settings；延续现有路由与懒加载页面，pages 只组装 |
| 会话装配 | [gateway-chat-sidebar.tsx](</Users/bojingli/self/project/dev/Ineffable-web/src/features/chat/gateway-chat-sidebar.tsx>) | 名称可在完成后按职责统一，但本轮不为重命名造成大 diff；只替换 presentation 装配，保留现有 authority |
| 消息/输入 | [chat-message-list.tsx](</Users/bojingli/self/project/dev/Ineffable-web/src/features/chat/components/chat-message-list.tsx>)、[chat-composer.tsx](</Users/bojingli/self/project/dev/Ineffable-web/src/features/chat/components/chat-composer.tsx>)、现有 WebNode renderers | 共轴/排版/disclosure 与卡片布局；保持 props/identity/registry 和请求合同；不得另建“DSH timeline” |
| 主题 | [index.css](</Users/bojingli/self/project/dev/Ineffable-web/src/index.css>) | DSH 色值/字号/圆角/动效映射到本项目语义 token；工作台局部优先，避免 admin 等全站无意漂移；不复制整个 reset |
| 验证/文档 | [布局门禁](</Users/bojingli/self/project/dev/Ineffable-web/scripts/check-workbench-layout-browser.mjs>)、[聚合脚本](</Users/bojingli/self/project/dev/Ineffable-web/scripts/check-conversation-workbench.mjs>)、[开发指南](</Users/bojingli/self/project/dev/Ineffable-web/FRONTEND_DEVELOPMENT_GUIDE.md>)、[AGENTS](</Users/bojingli/self/project/dev/Ineffable-web/AGENTS.md>) | 先增加目标不变量/红灯用例，再变实现；旧视觉常量可改，旧保护与身份测试不能删除 |

### 4.1 单一数据流

```text
Gateway 持久事实 / AppSession bootstrap
  → 现有 reducer + run store + canonical projector
  → GatewayChatSidebar（唯一 runtime 装配）
     → headerConversations / guarded commands → 左栏与头部
     → WebNode registry → 原 Seat / presentation
     → Composer props / 原发送与队列命令
路由与布局 → 只选择可见位置、宽度和焦点；不反向裁决执行语义
```

适配原则：同步只读 snapshot + 原有 commands + 展示 children；不把 API/service 传给纯 UI，不写一个空泛 DshAdapter 全能层。左右宽度偏好只在当前登录会话存活，刷新回默认，与 DSH 对齐；计算夹取不回写用户刚拖出的像素偏好。不迁移旧右 Chat open/width 为新 panel 执行事实。保留当前导航 open 的用户偏好语义，但按账号隔离；窄屏自动折叠不永久覆盖用户桌面选择。持久 UI 值必须限幅、校验和处理旧值，身份切换清理临时 focus/width/overlay。

### 4.2 挂载与异步约束

- ChatWorkbench 和单一 RoutedSurface/Outlet 是稳定 DOM 兄弟；根据路由种类用 CSS 定位到中央或右区，不能分别在中央/右区条件渲染两个 Outlet。布局变化不通过 key 或重排父树迁移 editor/composer。
- 设置采用既有模态 primitives/焦点层；不得为了 portal 将当前聊天实例搬入对话框。真正切换到另一业务路由可走原页面生命周期，但布局开合/缩放不当作换页。
- 会话选择只是查看对象。导航、新建、隐藏、专注、Settings 和 resize 不隐式 Stop；运行观察继续遵循原后台有界刷新策略。
- 跨 await 保留 session / conversation / run / epoch / request generation fence；身份变化按原 App key 清理，不把旧 pending 或审批结果写入新选择。
- 图片投递沿用 request/probe/defaultPrevented/readiness，壳层不缓存附件、伪确认或自动重投。普通发送 Workspace disabled 的现有语义不改；文件浏览不是权限绑定。
- 任何方案若要求第二套 run state、reducer、renderer registry、HTTP/SSE 订阅或自行从文本重建工具树，应停止并回到现有展示边界解决。

## 5. 实施阶段与检查点

按 P0 → P1 → P2 → P3 → P4 → P5 推进；主 Agent 实施，研究子 Agent 只读，不并行改同一文件。每个阶段独立中文提交，不把用户已有改动纳入。

| 阶段 | 工作与产物 | 阶段退出条件 |
| --- | --- | --- |
| P0 锁定合同与参考 | 建立同版 DSH 结构/交互清单与基准截图；明确获准差异；更新布局长期规则；列出拟复制文件/依赖/许可证清单；先补几何、路由分类、焦点的红灯用例 | 参考尺寸/字体/主题/locale 可复现；每个目标有源文件和验收点；现行保护不削弱。拿不到真实 DSH 截图则明确未验证，不把源码推断写成浏览器事实 |
| P1 完整 shell 与左栏 | 280/56 rail、drawer、双断点、两侧 resize、路由分类、会话/资源浏览/账号层级；稳定单一 Outlet；真实复杂页面保留 | 首页、文件/global 路由与返回正确；专注/隐藏/断点切换保持当前 editor/composer 精确实例和草稿；真实换页先经原保护，不承诺跨路由 keepalive。首轮完整页面已是 DSH 结构而非只改背景 |
| P2 会话与输入主体验 | 头部、共享阅读轴、正文/代码/空态、输入卡/附件/选择器/队列、键盘/菜单、主题映射 | 四主题语言组合、长名称、多行/IME、流式滚动、输入与附件 exact identity、receipt/stop/resume 无变化 |
| P3 执行与上下文面板 | 既有 Think/Tool/Approval/Human/Subagent renderers 的轻量执行行、详情与状态；资源/版本/脏编辑工具条和几何 | live/replay/history/terminal 同一展示；坏 payload fallback；待人工动作不被折叠藏死；祖先真实点击和保留编辑通过 |
| P4 设置与全局页衔接 | DSH 式设置壳、权限导航、窄屏全屏、原深链/复杂管理页回跳、弹层焦点收尾 | 输入/资源设置不交叉遮盖；Back/Forward/刷新直链可用；管理/Automation/账户原编辑操作全通 |
| P5 独立审计与交付 | 主 Agent 阶段自测后，固定提交范围做一次独立只读集中审计；集中整改阻断项，独立定向复核，再串行完整门禁；更新长期文档、完成后删除本计划 | 无未关闭审计阻断，所有要求的门禁真实通过；交付对照截图与差异清单，由用户人工体验后决定合并；不自行 merge/push |

P1 是第一个结构验收检查点，P2/P3 是核心交互检查点，P4 后再做整体审计；不等到最后才发现方向仍只是换肤。检查点不要求用户反复批准每个技术整改；若发现必须新增后端权限/费用/实质功能范围，单独提出，不用前端伪实现绕过。

回滚按阶段提交反向撤销到 `57ebb24` 的已知底座，先核对实际目标与用户改动；不 reset/stash 用户工作树、不修改数据库、不留双模式兼容分支。复制的 notice 随对应代码保留或一起移除。

## 6. 验收与证据矩阵

### 6.1 视觉不是一句“像 DSH”

P0 固定 DSH 同版参考与 Ineffable 同内容 fixture：1440×900、1280×800、1024、1023、768、767、390×844、320×780；EN/ZH × light/dark（跟随系统另验实际 resolved theme）。关键截图：空会话、长会话/流式、折叠 rail、文件分屏/专注、dirty editor、工具详情/审批/子任务、设置/小屏输入。

- 对照同尺寸图逐项核对 sidebar/rail、头部、阅读轴、composer、资源面板、设置壳的坐标/密度/字体/token；明确标出 Ineffable 品牌、资源树、模型/环境、管理页等保留差异。
- 固定几何值误差目标 ≤2 CSS px，居中轴偏差 ≤2px；消息/输入卡同时测实际内容矩形，在窄列及大列断言 32px 宽差和同一中心轴，覆盖 scrollbar/gutter 出现/消失，防止两者各自限宽后等宽或横漂。内容相关换行不按跨系统字体逐像素硬判。颜色/字号/圆角/间距由锁定 token 验，不以全图相似百分比掩盖结构错位。
- 无法获得 DSH 当前 GUI DOM/截图时，只能交付源码支撑的结构基线，不能声称已完成像素对照；本轮尚未生成或检查新目标截图。
- 实际截图必须等字体、编辑器、模态关闭动画和主题就绪；记录实际显示尺寸/主题，不拿 skeleton 或遮罩覆盖截图充数。

### 6.2 行为与安全门禁

下列命令是实施门禁，实际结果只记入末节；入口以 [package scripts](</Users/bojingli/self/project/dev/Ineffable-web/package.json#L6-L60>) 为准。

| 风险/合同 | 验证方式 |
| --- | --- |
| 双断点、rail/两侧 resize、几何夹取、reduced motion、焦点/Tab/隐藏树 | 扩展 `check:responsive-layout`、`check:workbench-layout` 开发/production；新增 767/768、1023/1024、拖拽和键盘 separator、窄屏打开右 panel/收左栏/还原偏好 |
| 单实例与路由 | 原布局门禁保留 exact editor/composer identity、草稿/附件/portal owner；补全 global/resource/settings 分类、Back/Forward、刷新深链、在途 run 切换不 Stop |
| 权威投影不变 | `check:chat-architecture`、`chat-routing`、`chat-runtime`、`chat-store`、`chat-resume`、`input-progress`、`chat-web-runtime`、`chat-web-integration`、`chat-admission` |
| 执行与人机交互 | `check:chat-browser`（含工具/过程/队列/人工问题/ACK/handoff/epoch）、`check:capability-save`、`check:run-observations`；验证折叠后的失败/待审批可达及相同节点 identity |
| 输入/附件/目录 | `check:composer-settings`、`composer-catalog`、`file-references`、`images`；保留 readiness 六类身份/换会话/卸载/超时路径；补 IME/拖贴/长名称/设置嵌套 Escape |
| 文件/团队/权限 | `check:workspace-rule`、`workspace-delete`、`workspace-lifecycle`、`api-resource`、`auth-session`、`auth-isolation`；dirty ancestor 实际命中面积及点击保护不可退化 |
| 管理与全局页 | `check:admin-mobile`、`admin-editor`、`automation-runtime`、`channels`、`toast`，覆盖窄内容容器与设置回跳，不只按视口判断 |
| 性能与绘制 | `check:shell-performance` 开发/production、`check:chat-stream-layout`、`check:chat-window`；新增 resize 期间无整树 token 重绘/额外订阅请求。保留每页 mounted entries ≤80、输入下一帧 P95 中位数 ≤100ms 等现行预算，不降低阈值换绿灯 |
| 通用质量 | `git diff --check`、`npm run i18n:check`、`npm run lint`（0 error/0 warning）、`npm run build`；按实际影响补其余架构行为检查 |

最终扩充既有 `check:conversation-workbench` 串行 fail-fast 聚合，补入本轮所触及的展示/输入/队列/滚动门禁；重复脚本可去重，但不能因为耗时删除风险覆盖。先确定 production build，再验其产物；浏览器门禁不并发争帧预算。最终按构建产物串行复跑，避免帧预算争抢。

## 7. 许可证、依赖与实施前待核实项

- [DSH 根 LICENSE](</Users/bojingli/self/project/dev/deepseek-harness/LICENSE#L1-L21>) 为 MIT，允许改编代码但要求保留版权和许可。每个实际复制/实质改编文件记录 upstream 路径、版本/SHA、修改说明，并在本产品发行物中保留 notice；已采用 [发行 notice](</Users/bojingli/self/project/dev/Ineffable-web/public/third-party-notices.txt>)，由 Vite public 原样发布，不是只在计划口头注明。
- [DSH 基础字体栈](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-theme/src/styles/base.css#L6-L23>) 是系统正文/代码字体，Montserrat 是品牌字体；[brand-font.css](</Users/bojingli/self/project/dev/deepseek-harness/packages/client/ui-theme/src/styles/brand-font.css#L1-L24>) 单列 OFL。默认保留 Ineffable 标志，不拷 DSH 鱼标/品牌字体资产；如引入任何字体/图标/上游生成 token，逐项核对其版权与再分发条件，MIT 根许可不自动覆盖第三方资产。
- 优先现有依赖；不为取一个按钮引入整套 DSH primitives/Cordis。拷纯函数/样式还是按原 primitives 重写，以依赖闭包/维护成本决定；复制量大时保留完整许可并逐项清单，不拿“参考”规避义务。
- 真实后端能力差距：DSH 的宿主终端、插件/设置服务、工作目录 Session 分组和特定工具 diff 不是已证明的一对一能力。默认不新增；若用户要求这些能力也等价，需要另立后端合同，不阻塞已有会话/文件主体验但必须明示差异。
- 设置层与 route host 的最终 DOM/focus 组织在 P0/P1 做最小验证，尤其路由保护、嵌套 Sheet/Popover、从资源返回、直接深链；验证后才扩展所有设置项。不得靠复制页面绕过。
- 当前 DSH GUI 的已启用插件/用户字体/持久偏好可能不同于源码默认。本轮依据版本源码，不声称已观察 live DOM；P0 取得真实可对照状态后锁图。不能获得时保留人工结构验收门槛。
- 所有浏览器自动化是本机 Chrome + mock HTTP 证据；未覆盖真实 Gateway/PostgreSQL/provider、付费模型、生产部署、真实触屏软键盘、Safari/Firefox。最终分开报告本地通过与人工待验，不拿 mock 等同上线验收。
- DSH `http://127.0.0.1:3080` 仅是参考 GUI，不是 Ineffable 部署；本轮不改其源代码/profile/plugins，不启动替代服务，不承诺本项目修改会在该 URL 自动生效。

## 8. 当前实施进度与剩余证据

- P0 已完成：用户授权已激活；原目录/分支与已有改动已核对，长期合同已同步。新增真实浏览器结构门禁 `scripts/check-workbench-structure-browser.mjs`，旧实现得到预期 7 项红灯：280px、56px、1024/1023/768/1440 rail 与全局页返回会话路由；草稿/exact DOM、抽屉 Escape/focus、窄屏无横向溢出通过。先纠正 fixture 的 model-card 必填数据与动画稳定等待，最终红灯来自目标差距而非测试异常。证据位于系统临时目录 `ineffable-workbench-structure-development/metrics.json` 与 desktop-rail.png。基线 breadcrumb 非零命中区、dirty 导航取消与 portal owner 测试保留；既有 dialog-hidden 一行等待不纳入本阶段提交。i18n 检查（1839 keys）、lint（零错误/警告）、production build、diff --check 通过；Vite 既有 images 静态/动态导入提示不计作新增 ESLint 警告。完整 MIT 和拟复用清单已加入 `public/third-party-notices.txt`，随静态发行物分发。
- P1 已完成：唯一布局 controller/纯函数求解，280px 导航与 56px rail、264–420px pointer/键盘 resize、768/1024 断点和按账号隔离的导航展开偏好；宽度仅当前登录内存保存，临时收窄不回写偏好。768px 手动展开将 420px 偏好临时压为 368px，确保中心 400px，回宽恢复。资源优先退让、全局页居中、单一 ChatWorkbench/Outlet 与 drawer 精确 DOM/focus 保持通过。修正性能脚本的旧几何/全局页假设，SPA 就绪等待改为目录数据实际呈现，没有屏蔽合法权限/目录请求。i18n（1841 keys）、零警告 lint、production build、responsive solver 全宽穷举、结构开发/production、旧布局 production、性能开发/production 和 diff --check 通过；开发性能包含六种图片引用 reconcile/成功/选择/会话/卸载/超时用例。证据为系统临时目录下 `ineffable-workbench-structure-development` 与 `ineffable-workbench-structure-production`。本阶段不纳入用户原有 Dockerfile、design 与 dirty-dialog 等待改动。
- P2–P5 待执行；尚无最终验收或最终 CI 结论，不合并、不推送。
- 参考图缺口：当前只有 DSH 源码可读，没有已连接 GUI 的浏览器控制工具。遵循参考安装的验证限制，不从 shell 新开浏览器访问 DSH/profile。后续本项目 Chrome fixture 截图是 Ineffable 测试证据，不冒充 DSH 实机对照。
- 键盘核查：DSH `shortcuts/src/index.ts` 的双 Esc 默认为 500ms（Host volatile，1–2147483646）；`stop-shortcut.ts` 在菜单/modal/审批/terminal/IME/repeat/defaultPrevented 或身份/region 变化时重置。Ineffable 文件菜单先消费 Esc、Radix 分层关闭；现有输入无双 Esc。P2 仅在同 session/conversation/run/epoch/generation/region 和冲突门禁齐全时启用 500ms，否则保留显式停止按钮并记录差异；不引入 Host 配置。

### P0 拟复用清单（真正改编时同步发行 notice）

| 上游文件 | 目标与处理 | 依赖闭包/许可 |
| --- | --- | --- |
| `ui-layout/src/client/columns.ts` | P1 `src/app/shell/workbench-layout.ts` 几何常量与求解，适配响应式 focus/rail | 纯 TypeScript；MIT，保留 DeepSeek 版权及原始 SHA |
| `ui-conversation/src/client/skeleton/{ConversationRoot,HeroShell,InputBar}.module.css`、`ui-chat/src/client/chat/ChatView.module.css` | P2 以本项目语义 token 适配阅读轴、sticky composer、空态 | 不引入 Cordis/controller/Lexical；MIT，具体改编位置随阶段记录 |
| `ui-settings-general/src/client/SettingsRoot.module.css` | P4 适配 800/188/28 设置几何 | React/Radix 继续用既有依赖；MIT；不复制 Host settings schema |
| 品牌/字体/图标 | 保留 Ineffable 标识、既有 Inter 与 Lucide；不复制 DSH 品牌资产/Montserrat | 无新增依赖；既有第三方许可不由 DSH MIT 替代 |

最终发行 notice 随 Vite public 静态产物发布，覆盖每个实际实质改编源文件、上游路径、版本/SHA 和完整 MIT 文本；不只留计划中的一句许可说明。
