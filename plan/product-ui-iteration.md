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
- [x] 优化团队空间创建、成员、用量、邀请和通知页面。
  - [x] 创建团队空间。
  - [x] 成员、用量和已发送邀请。
  - [x] 收到的邀请通知与 token 接受流程。
- [x] 统一成员角色、邀请状态、危险操作和移动端布局。

自动验证：`npm run lint`、`npm run build` 已通过。

账号页视觉验证：使用与 Gateway 类型一致的用户、Workspace 和 session mock 数据检查桌面与 390px 移动布局。

成员页视觉验证：使用真实响应结构的成员、Usage 和 Invitation mock 数据检查 390px 指标、邀请表单和表格列优先级。

待真实后端手动验证：创建空间、邀请、改角色、移除成员、撤销/接受邀请、吊销登录会话。

### Phase 3：工作区对象与应用 Shell

- [x] 优化左侧 Workspace 树、对象菜单与空态。
- [x] 优化文件编辑、预览、保存状态和版本历史。
- [x] 检查 header、左右侧栏和 320px 最小中栏约束。

自动验证：`npm run lint`、`npm run build`。

Shell 第一轮自动验证：`npm run lint`、`npm run build` 已通过；统一导航、面包屑、对象菜单、空态和账号菜单的产品文案，并移除未接 API 的账号菜单假入口。

编辑器自动验证：`npm run lint`、`npm run build` 已通过；版本历史迁入标准 `AppDialog`，补齐中文保存/冲突/恢复反馈，并让右侧 AI 面板的最大宽度为中栏保留 320px。

手动验证：创建/重命名/移动/删除对象，编辑保存，预览版本，恢复版本，移动端侧栏。

### Phase 4：Gateway Chat

- [x] 优化会话选择、空态、消息层级、Thinking、tool call、subagent 和 approval。
- [x] 保持 streaming、recovering、queued、completed、error 与去重逻辑。
- [x] 优化窄栏、全屏移动模式和键盘操作。

自动验证：`npm run lint`、`npm run build`。

入口层自动验证：`npm run lint`、`npm run build` 已通过；已优化会话搜索/分组、空态、用户消息与窄栏输入区，事件详情与运行状态继续在下一闭环处理。

事件层自动验证：`npm run lint`、`npm run build` 已通过；统一 Thinking、tool call、终端结果和 subagent 的状态层级，未改动流式事件聚合与去重逻辑。

手动验证：新会话、历史恢复、流断开恢复、预输入队列、停止、审批和 workspace 写入刷新。

### Phase 5：模型中心与系统管理

- [x] `/models` 接入真实 Model Profile 列表，移除虚构指标。
- [x] 明确 Genesis、Explorer、Quantum 固定路由与真实 profile 的关系。
- [x] 对模型、套餐、密钥、用户管理页做一致性精修。

自动验证：`npm run lint`、`npm run build`。

模型目录自动验证：`npm run lint`、`npm run build` 已通过；普通用户页面仅展示当前套餐可见的真实 Model Profile，旧 Genesis、Explorer、Quantum 示例路由兼容重定向到真实目录。

系统管理自动验证：`npm run lint`、`npm run build` 已通过；统一四个管理页的指标、图表和状态文案，加载阶段不再显示误导性的 0，并补齐页面级错误反馈。

手动验证：普通用户模型目录；管理员增删改模型、套餐、密钥、用户角色和套餐分配。

### Phase 6：静态模块收口

- [x] 移除文档、设置、项目、支持页面的硬编码伪指标。
- [x] 只保留有真实产品语义的导航和说明。
- [x] 没有后端能力的操作明确标注未开放，不制作可点击假入口。
- [x] 复核导航是否仍需要保留全部固定子路由。

自动验证：`npm run lint`、`npm run build`。

静态模块自动验证：`npm run lint`、`npm run build` 已通过；设置路由回到真实账号页，文档与项目子路由合并为诚实的能力说明页，支持/反馈从侧栏移除并仅保留旧链接兼容。

手动验证：全部静态路由可访问、文案真实、明暗主题与移动端正常。

### Phase 7：页面加载性能收尾

- [x] 将认证、工作区、团队、模型与系统管理页面改为路由级动态加载。
- [x] 为认证布局和应用 Shell 提供统一、可感知的页面加载占位。
- [x] 将全局 AI 会话侧栏拆为独立加载边界，并保留现有开关行为。
- [x] 对比构建产物，确认首包不再包含所有页面实现。

自动验证：`npm run lint`、`npm run build` 已通过。原单文件约 1.9 MB 的入口产物已拆为约 103 KB 主入口、约 765 KB 共享运行依赖，以及认证、Automation、团队、系统管理、AI 侧栏和工作区编辑器等独立 chunk；编辑器 chunk 仍因 CodeMirror 超过 500 KB，但不再阻塞其他路由首屏。

手动验证：登录与注册路由切换、登录后页面首次进入及管理员页面权限保护。

### Phase 8：认证与工作台加载边界

- [x] 将登录后应用 Shell 从公共入口移入认证成功后的动态加载边界。
- [x] 保持 session 恢复和 `RequireAuth` 权限判断先于工作台资源加载。
- [x] 统一 session 恢复、受保护路由和管理员权限检查期间的产品化加载状态。
- [x] 对比构建清单，确认未登录入口不再同步依赖工作区导航与 AI 会话实现。

自动验证：`npm run lint`、`npm run build` 已通过。Vite manifest 中工作台 `App` 已成为动态导入，公共入口由约 765 KB 降至约 692 KB；认证页面可在 session 判断后独立渲染，工作区 Shell 和 AI 会话继续位于后续动态加载边界。

运行时验证：未登录访问登录/注册页正常，未登录访问 `/automation` 会在 session 判断后回到完整登录页。

待真实账号手动验证：恢复 session 后进入默认页，并检查工作台首次加载占位。

### Phase 9：真实账号运行时验收

- [x] 使用普通账号和管理员账号验证真实登录、角色、session、模型、Automation、会话与工作区数据接口。
- [x] 验证普通账号无法访问系统管理路由，管理员可访问四个系统管理页面。
- [x] 验证 Automation、模型、账号、通知和系统管理页面在桌面端无加载失败、横向溢出或控制台异常。
- [x] 验证普通账号核心页面在 390×844 真实设备指标下无横向溢出。
- [x] 验证系统管理新增/编辑弹窗与行内详情，并修正新增密钥弹窗标题。

自动验证：`npm run lint`、`npm run build` 已通过。

运行时验证：新增密钥弹窗标题与说明已复测通过；可操作套餐的行内权限详情可以展开和收起。普通账号访问管理员路由会正确回到 `/automation`，桌面及 390×844 页面检查无横向溢出和控制台异常。

待有副作用的手动验证：Automation 实际运行、Chat 发送/停止/审批、文件保存/恢复，以及管理员增删改提交；执行前需要明确测试数据与清理范围。

### Phase 10：Sandbox 选择项实时同步

- [x] 将 Sandbox 环境加载收口为可重复调用的 Chat feature 刷新函数。
- [x] Sandbox 选择框展开时主动请求最新环境列表。
- [x] 浏览器重新聚焦、恢复可见和网络恢复时同步环境列表。
- [x] 后台刷新失败时保留上一次成功选项，并清理已失效的会话选择。

自动验证：`npm run lint`、`npm run build` 已通过。

运行时验证：使用真实普通账号和浏览器网络监听确认，Sandbox 选择框通过真实指针展开后会重新请求 `/gateway/v1/sandbox/environments`；窗口重新聚焦也会触发同步。该账号当前没有已绑定环境，因此刷新后的下拉框仅展示“自动选择沙箱”。

### Phase 11：公共入口依赖瘦身

- [x] 使用生产 sourcemap 盘点公共入口和大体积动态 chunk 的依赖来源。
- [x] 认证入口直接引用所需 app 组件，避免通过聚合导出提前触达图表模块。
- [x] 将认证页不使用的 Tooltip 和确认弹窗 Provider 移入动态工作台边界。
- [x] 文件预览与 CodeMirror 编辑器分离，仅在进入编辑模式时加载编辑器和语言包。
- [x] 根据文件类型动态加载 Markdown、HTML、JSON 或 JavaScript 语言支持。
- [x] 确认 Recharts、Redux Toolkit 与 D3 不再进入未登录公共入口。
- [x] 对比优化前后的入口体积与 gzip 体积。

自动验证：`npm run lint`、`npm run build` 已通过。正式生产构建显示公共入口由约 692 KiB / 222 KiB gzip 降至约 385 KiB / 122 KiB gzip，减少约 45%；Recharts 及其 Redux/D3 依赖已移入约 241 KiB 的图表动态 chunk。CodeMirror 基础编辑器由约 604 KiB 降至约 408 KiB，各语言支持拆为约 22–85 KiB 的按需 chunk，构建不再出现 500 KiB 大 chunk 警告。

运行时验证：使用真实管理员账号打开现有文本文件，预览阶段未请求编辑器模块；点击“编辑文件”后才加载 Workspace 编辑器且 `.cm-editor` 正常挂载，无控制台异常。

### Phase 12：Compact / Desktop 响应式边界

- [x] 以共享 `1024px` 边界划分 compact 与 desktop 两种交互模式，不再定义独立平板模式。
- [x] `<1024px` 的左右 Sidebar 使用 Drawer / 全屏 Sheet，`>=1024px` 才常驻并支持右栏拖拽。
- [x] Sidebar Hook、右栏默认状态与 CSS 可见性消费同一边界，不保留分散的 `768px` 判断。
- [x] 跨模式后重新绑定左栏 gap 测量，右栏禁用重复的全局 Sidebar 快捷键。
- [x] 全屏 compact Sidebar 显式覆盖 Sheet 的响应式抽屉宽度上限，确保 980px 等窄视口真正占满屏幕。
- [x] 页面内部 `sm/md/lg/xl` 继续只承担内容排版，不改变业务交互模式。
- [x] 响应式契约检查、i18n、lint 与生产构建通过。

## 全局完成标准

- lint 0 errors、0 warnings；build 通过。
- 所有真实异步页面具备 loading、empty、error、retry 和 action feedback。
- 不新增页面互相依赖、page barrel、`pages/shared` 或通用组件的局部复制。
- 不展示无后端来源的实时数字、成功状态或可操作控件。
- 明暗主题、键盘操作、移动端和右侧 Chat 展开状态均可用。
- 每个 Phase 使用中文分点 commit 独立提交。

## 运行时收尾验证

- [x] Gateway `http://127.0.0.1:8787/health` 返回 200，前端 Vite 服务可访问。
- [x] 登录页完成 1440px 桌面截图检查与 390×844 设备指标检查，无横向溢出。
- [x] 浏览器标题、中文语言声明、产品描述与 favicon 已替换 Vite 默认元信息。
- [ ] 使用真实账号验证模型目录、工作区对象、Chat 与管理员增删改流程；需要可用登录凭据，不重置现有账号或数据库。
