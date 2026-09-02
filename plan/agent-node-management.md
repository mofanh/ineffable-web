# Agent Node 管理实施计划

状态：Active

实施基线：`6757442252eb9851e4ca26790d2ef90f0af1a55a`

## 完整合同

把对话界面中的 Runtime Lab 侧栏收敛为独立的「Agent Node 管理」页面。对话仍只负责开启
Node 迭代、展示候选回答以及保留/恢复裁决；管理页通过现有 Gateway Agent Evolution
projection/actions 展示版本链、评估、准入、默认版本、开放运行时和历史记录，不建立第二套
候选状态、权限判断或运行入口。

### 范围

- 主导航增加唯一的「Agent Node 管理」入口和路由。
- 移除对话标题栏的 Runtime Lab 按钮及 Sheet，不影响回答下方的保留/恢复操作。
- 管理页允许选择有权访问的会话作为应用目标，查看该范围内的 AgentDefinition 版本链。
- 已准入版本可通过现有 action 应用到目标会话、设为默认或回滚；候选继续复用现有评估和准入命令。
- Runtime Lab 仍是后端隔离资源的内部领域名；用户界面统一表达为 Agent Node 管理/开放运行时。
- 保留套餐、Gateway policy、credits、Sandbox quota 和确认流程的服务端权威性。

### 非目标

- 不新增 AgentDefinition/Node 持久化表或复制现有 evolution service。
- 不允许直接运行孤立 Base Node；应用动作仍选择完整、已校验的 AgentDefinition fingerprint。
- 不自动准入、自动设为默认或自动创建有成本的开放运行时。
- 不改变输入框 Node 迭代开关与回答底部裁决语义。

## 实施阶段

- [x] Phase A：建立 `/agent-nodes` 路由、主导航、页面数据装配与会话目标选择；复用唯一
  Agent Evolution projection。已完成带过期请求 fencing 的会话目标加载、空态/错误态/概览，
  受影响 ESLint、i18n 门禁与生产构建通过。
- [x] Phase B：把原 Sheet 内容重构为页面内的 Agent Node 版本链和高级管理区；移除对话侧栏
  入口，并统一用户可见命名。版本链现在投影父版本、评估次数、准入状态及应用/默认/回滚动作；
  对话保留回答下方裁决，开放运行时继续复用原 Gateway commands。受影响 ESLint、i18n 与生产
  构建通过。
- [x] Phase C：补齐架构/i18n/浏览器回归，验证刷新、目标切换、空状态和既有对话内裁决不回归；
  更新计划并完成确定性前端门禁。新增个人空间=user scope、团队空间=workspace scope 的唯一解析，
  修复个人空间历史资产被过滤的问题；真实账号浏览器 smoke 已看到 13 个既有版本和 13 个可用的
  “应用到当前会话”动作。架构、integration、i18n、受影响 ESLint 与生产构建均通过。
- [ ] Final audit：全部阶段提交后进行一次基线到 HEAD 的独立只读审计；若有 P0/P1，集中修复后
  最多再做一次最终复审。

## 验收标准

- 对话界面不再出现 Runtime Lab/Agent Evolution 侧栏入口。
- 「Agent Node 管理」页面可从主导航直接访问，刷新后从 Gateway 恢复当前目标和版本链。
- 页面明确区分候选、已准入、当前默认和正在试用，并能复用已有版本到所选会话。
- 所有 mutation 仍由 projection action 的 `enabled/requires_confirmation` 决定，前端不推导权限。
- `npm run check:chat-architecture`、`npm run check:chat-web-integration`、`npm run i18n:check`、
  受影响 ESLint 与 `npm run build` 通过。
