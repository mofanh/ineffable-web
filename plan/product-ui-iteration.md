# Ineffable Web 产品界面迭代计划

## 目标

在不改变现有 Gateway、session、workspace 和 chat 行为的前提下，统一登录后页面的产品语言、信息层级与交互质量。页面只展示真实能力或明确的静态说明，不把示例指标包装成实时数据。

后端事实来源：`/Users/bojingli/self/project/dev/Ineffable`。

## 页面与能力盘点

### 已完成认证入口

| 路由 | 页面 | 数据来源 | 状态 |
| --- | --- | --- | --- |
| `/login` | 登录 | Auth API | 已完成产品化改版 |
| `/register` | 注册 | Auth API、邮箱验证码 API | 已完成产品化改版 |

### 核心工作流：真实 API

| 路由 / 区域 | 页面 | 数据来源 | 后续重点 |
| --- | --- | --- | --- |
| `/automation` | Automation | `/gateway/v1/automations*`、Conversation API | 默认入口，优先优化列表扫描、运行状态和编辑流程 |
| `/workspace/:workspaceId/objects/:objectId` | 工作区对象编辑器 | Workspace Object、Version API | 优化编辑/预览/版本状态，不破坏保存与恢复行为 |
| 全局右侧栏 | Gateway Chat | Conversation、SSE、Poll、Sandbox、Approval API | 优化事件层级、空态和 composer，不改变流式聚合状态机 |
| 全局左侧栏 | Workspace 导航 | Workspace、Object Tree、Invitation API | 优化空间、文件树和对象操作的扫描效率 |

### 团队与账号：真实 API 为主

| 路由 | 页面 | 数据来源 | 当前问题 |
| --- | --- | --- | --- |
| `/account` | 账号设置 | `/auth/me`、`/auth/sessions` | 混有资料修改、双重验证、通知偏好等未接 API 占位 |
| `/team-spaces/new` | 创建团队空间 | Workspace API | 需要统一表单层级和完成反馈 |
| `/team-spaces/:workspaceId/members` | 成员管理 | Member、Usage、Invitation API | 信息密度高，需要加强列表扫描和权限动作层级 |
| `/notifications` | 邀请通知 | Incoming Invitation API | 需要优化邀请状态和操作反馈 |
| `/workspace-invitations/:token` | 接受邀请 | Invitation API | 需要优化独立流程状态与结果页 |

### 模型页面：后端有真实 Model Profile，前端目前为静态示例

| 路由 | 当前实现 | 目标 |
| --- | --- | --- |
| `/models` | 三个虚构指标和说明 | 接入 `/gateway/v1/models/profiles`，展示真实可用模型目录 |
| `/models/genesis` | 静态示例指标 | 移除伪实时数据，改为诚实的能力说明或真实 profile 详情 |
| `/models/explorer` | 静态示例指标 | 移除伪实时数据，改为诚实的能力说明或真实 profile 详情 |
| `/models/quantum` | 静态示例指标 | 移除伪实时数据，改为诚实的能力说明或真实 profile 详情 |

### 系统管理：真实 Admin API

| 路由 | 页面 | 数据来源 | 约束 |
| --- | --- | --- | --- |
| `/system/models`、`/admin/llm` | 模型管理 | Admin Model、Monthly Usage API | 保持单列管理页，列表为主，弹窗编辑 |
| `/system/plans` | 套餐管理 | Admin Plan、Model Access API | 保持单列管理页，避免常驻详情侧栏 |
| `/system/secrets` | 密钥管理 | Admin LLM Secret API | 明确 masked/raw secret 状态和危险操作 |
| `/system/users` | 用户管理 | Admin User、Plan、Usage、Workspace Usage API | 主表只展示汇总，详情展示明细 |

### 静态模块：当前没有对应产品 API

以下页面统一使用 `ModuleDashboardPage` 展示硬编码指标。后续必须移除伪实时数字，改为基于现有真实产品范围的导航、说明或明确的未开放状态。

- 文档：`/docs`、`/docs/introduction`、`/docs/get-started`、`/docs/tutorials`、`/docs/changelog`
- 设置：`/settings`、`/settings/general`、`/settings/team`、`/settings/billing`、`/settings/limits`
- 项目：`/projects`、`/projects/design-engineering`、`/projects/sales-marketing`、`/projects/travel`
- 支持：`/support`、`/feedback`

## 实施阶段

### Phase 0：页面盘点与真实能力边界

- [x] 盘点所有路由与页面实现。
- [x] 对照后端 Gateway HTTP 路由和前端 API adapter。
- [x] 区分真实 API、混合占位和纯静态示例页面。

验收：后续任何页面优化都能说明数据来源，不新增伪实时指标。

### Phase 1：Automation 默认入口

- [x] 收敛页面标题、指标、工具条、列表和运行记录的视觉层级。
- [x] 保持创建、编辑、运行、删除和 Conversation 联动行为。
- [x] 将英文错误与操作反馈统一为面向用户的中文产品文案。
- [x] 检查桌面与 390px 窄内容区的容器响应。

自动验证：`npm run lint`、`npm run build` 已通过。

视觉验证：使用与 Gateway 类型一致的本地 mock 检查有数据列表、运行成功/失败状态、桌面与移动布局。

待真实后端手动验证：空列表、搜索、创建、编辑、手动运行、查看会话、失败 run、右侧 Chat 展开后的实际操作。

### Phase 2：账号与团队协作

- [x] 账号页只突出真实资料与登录会话，移除未接 API 的交互占位。
- [ ] 优化团队空间创建、成员、用量、邀请和通知页面。
- [ ] 统一成员角色、邀请状态、危险操作和移动端布局。

自动验证：`npm run lint`、`npm run build`。

账号页视觉验证：使用与 Gateway 类型一致的用户、Workspace 和 session mock 数据检查桌面与 390px 移动布局。

手动验证：创建空间、邀请、改角色、移除成员、撤销/接受邀请、吊销登录会话。

### Phase 3：工作区对象与应用 Shell

- [ ] 优化左侧 Workspace 树、对象菜单与空态。
- [ ] 优化文件编辑、预览、保存状态和版本历史。
- [ ] 检查 header、左右侧栏和 320px 最小中栏约束。

自动验证：`npm run lint`、`npm run build`。

手动验证：创建/重命名/移动/删除对象，编辑保存，预览版本，恢复版本，移动端侧栏。

### Phase 4：Gateway Chat

- [ ] 优化会话选择、空态、消息层级、Thinking、tool call、subagent 和 approval。
- [ ] 保持 streaming、recovering、queued、completed、error 与去重逻辑。
- [ ] 优化窄栏、全屏移动模式和键盘操作。

自动验证：`npm run lint`、`npm run build`。

手动验证：新会话、历史恢复、流断开恢复、预输入队列、停止、审批和 workspace 写入刷新。

### Phase 5：模型中心与系统管理

- [ ] `/models` 接入真实 Model Profile 列表，移除虚构指标。
- [ ] 明确 Genesis、Explorer、Quantum 固定路由与真实 profile 的关系。
- [ ] 对模型、套餐、密钥、用户管理页做一致性精修。

自动验证：`npm run lint`、`npm run build`。

手动验证：普通用户模型目录；管理员增删改模型、套餐、密钥、用户角色和套餐分配。

### Phase 6：静态模块收口

- [ ] 移除文档、设置、项目、支持页面的硬编码伪指标。
- [ ] 只保留有真实产品语义的导航和说明。
- [ ] 没有后端能力的操作明确标注未开放，不制作可点击假入口。
- [ ] 复核导航是否仍需要保留全部固定子路由。

自动验证：`npm run lint`、`npm run build`。

手动验证：全部静态路由可访问、文案真实、明暗主题与移动端正常。

## 全局完成标准

- lint 0 errors、0 warnings；build 通过。
- 所有真实异步页面具备 loading、empty、error、retry 和 action feedback。
- 不新增页面互相依赖、page barrel、`pages/shared` 或通用组件的局部复制。
- 不展示无后端来源的实时数字、成功状态或可操作控件。
- 明暗主题、键盘操作、移动端和右侧 Chat 展开状态均可用。
- 每个 Phase 使用中文分点 commit 独立提交。
