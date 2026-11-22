# 会话优先工作台（Active）

## 原始合同
用户接受将会话作为默认中心、工作区作为 Agent 的资源工具；要求在新分支实现，验证后由用户决定是否合并主分支。本任务不合并、不推送。

- 基线：`dc4083a`；分支 `feat/conversation-workbench`；按用户要求直接在原前端目录切换分支实现（临时 worktree 已删除），用户的 Dockerfile.source/design.md 和后端改动均不触碰。
- 范围：默认 /chat；左侧可搜索的会话导航和原工作区入口；中央唯一聊天实例；右侧复用原路由资源/编辑器，支持隐藏、恢复和专注资源；窄屏单面板切换。管理/自动化路由与文件深链继续可用。
- 权威链：AppSession bootstrap/list → 既有 run reducer/store → GatewayChatSidebar 的 headerConversations 和选择/新建回调 → 左栏与聊天头共同投影；不得另建会话运行状态或 composer。后端、鉴权、队列、恢复与工具渲染路径不变。
- 非目标：后端协议重构、第二套 Agent 模式、文件 Diff 产品、完整工具展示重做、生产部署或真实付费 provider 验证。

## 阶段
1. 新分支与合同、路由/布局/会话导航实现；局部结构检查、lint/i18n/build 后中文阶段提交。
2. 更新受布局变化影响的行为门禁，补充桌面/窄屏、深链、草稿/图片引用、资源专注回归；完整集成测试、长期文档更新并提交。
3. 干净工作树后在 detached worktree 对基线到 HEAD 做一次独立只读全量审计；集中修复 P0/P1，独立定向复核；确定性 CI 通过后移除已完成计划并提交，保留 Git 历史证据。

## 验收
- 登录/根路径默认进入可直接输入的中央会话，不读取旧右栏开关来决定可用性。
- 左侧新建/选择/搜索/状态来自同一 runtime 的既有回调与投影；切换或隐藏不隐式 Stop。
- 中央 composer 在导航开合、窗口变化、资源开合/专注和路由变化期间保持实例、输入、附件与流；身份变化仍走现有 App key 隔离。
- 工作区树、深链、编辑、版本、成员、自动化/管理权限入口保留；隐藏/专注不卸载当前 Outlet，未保存编辑不丢失。
- 320/390px 无水平溢出，桌面会话主次明确；中英文、明暗主题可操作；键盘与按钮有可访问名称。
- 不引入两套聊天运行时、全会话详情 N+1、额外未授权业务请求。

## 确定性门禁
`npm run i18n:check && npm run lint && npm run build`；`check:chat-architecture`、`check:chat-routing`、`check:chat-runtime`、`check:chat-store`、`check:auth-session`、`check:responsive-layout`；`check:workbench-layout` 开发/production；`check:admin-mobile`、`check:admin-editor`、`check:automation-runtime`、`check:toast`；对受影响旧壳测试修订断言而非保留旧三栏产品假设。根据实际影响追加 auth/图片/工作区回归。

## 环境与人工边界
本机 Chrome + Vite 的 mock HTTP 浏览器门禁是本地交互证据，不代表真实 PostgreSQL/provider/生产验收。原 DSH GUI 不作为本项目部署目标，不更换其服务。复用原前端目录已有的锁文件依赖。本任务最终交付分支和本地验证证据，用户人工体验后再决定合并。

## 进度
- 阶段一实现完成：默认 /chat、单实例中央聊天、既有 runtime 投影左栏、持久资源 Outlet、桌面分屏/专注和窄屏切换；删除闲置右栏缩放与壳组件。i18n、lint、build、响应式结构及会话架构/路由/runtime/store/auth-session 已通过。
- 阶段二完成：开发/production 布局与性能、中英文实际明暗主题、导航搜索/选择、新草稿、编辑保留、图片引用六类 readiness/身份隔离、通知/自动化、管理端、输入设置 portal、认证入口 16 场景与 hydration 6 场景、文件引用/规则已通过。管理端 fixture 禁用开发 HMR，避免工作目录编辑使浏览器测试意外刷新。新增串行 `check:conversation-workbench` 供审计后确定性复跑；真实后端/provider 与移动软键盘仍为人工边界。
- 下一步：本任务阶段提交后进行独立只读全量审计。用户已有改动不纳入提交；审计只检查本任务提交范围。
