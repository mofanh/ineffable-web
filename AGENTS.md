# Agent Development Notes

本文档是本仓库前端开发的执行须知，面向后续进入项目的 agent 和开发者。

完整架构规范见 `FRONTEND_ARCHITECTURE_REFACTOR_SPEC.md`。Gateway/API 对接规范见 `FRONTEND_DEVELOPMENT_GUIDE.md`。产品和视觉基线见 `design.md`。

## 核心原则

1. 保持高内聚、低耦合。
2. 依赖链必须单向清晰：底层组件不依赖业务，上层页面只组合下层能力。
3. 不保留无职责中转层。只做 `export ... from ...` 的 page barrel 文件不要新增。
4. 不把一次性页面实现伪装成共享组件。共享组件必须有明确复用场景。
5. 架构重构优先保持行为，再改善结构。

## 前端分层

### `src/components/ui`

基础 UI primitive。

允许：

- `Button`
- `Input`
- `Textarea`
- `Select`
- `Badge`
- `Card`
- `AlertDialog`
- `Skeleton`
- `Tooltip`

禁止：

- Gateway/API 请求
- app session
- feature 业务 copy
- 页面状态和业务流程

### `src/components/app`

全项目应用底座组件。

当前标准组件包括：

- `AppPage`
- `PageHeader`
- `AppToaster`
- `AppDialog`
- `Notice`
- `EmptyState`
- `ErrorState`
- `DataState`
- `AsyncButton`
- `FormSection`
- `FormField`
- `ToggleField`
- `DataTableShell`
- `StatusBadge`
- `AppMetricPage`
- `AppSectionCard`
- `AppSearchBar`
- `AppLineChart`
- `AppBarChart`

新页面默认优先复用这里的组件，不要在 page 内重新定义通用 shell、field、dialog、empty、error、status badge、table shell。

### `src/lib/app`

跨功能交互和策略服务。

当前标准服务包括：

- `notify`
- `normalizeAppError`
- `confirm`
- `useApiResource`
- `useAsyncAction`

请求错误、通知、确认弹窗、通用资源加载状态必须优先走这里。

### `src/features`

业务功能层。

允许：

- domain state
- domain model
- feature API adapter
- feature-specific components

禁止：

- 定义全项目通用 UI 模式
- 依赖其他 feature 的内部实现
- 复制 app 层已有的通知、确认、错误、表单、空态、加载模式

### `src/pages`

路由组合层。

职责：

- 选择 session/context
- 调用 feature/API/hook
- 组合 app components 和 feature components

禁止：

- 页面之间互相依赖
- 新增 `src/pages/shared` 这类跨页面共享组件目录
- 新增只做 re-export 的 page 文件
- 本地重复定义通用组件
- 直接使用 `window.alert` / `window.confirm`
- 手写通用 HTTP 错误分类

## 依赖方向

推荐方向：

```text
routes
  -> pages
    -> features
    -> components/app
      -> components/ui
    -> lib/app
    -> lib/api
```

禁止方向：

```text
components/ui -> components/app
components/app -> pages
components/app -> features
features/a -> features/b internals
pages/a -> pages/b
pages/* -> pages/shared
routes -> page barrel -> real page
```

`router` 应直接 import 真实页面模块，不通过无职责中转文件。

## `shared.tsx` 使用规则

允许保留的 `shared.tsx`：

- 只服务同一目录下的强相关页面。
- 包含真实业务共享逻辑，例如 payload 默认值、数据转换、目录内页面壳、权限占位。
- 不被目录外模块依赖。

不允许的 `shared.tsx`：

- 只从 `components/app` 转发组件。
- 只做 barrel export。
- 让业务页面感知无意义的技术中间层。

如果 `shared.tsx` 只是转发，应删除并让调用方直接依赖真实模块。

跨页面复用的展示组件、页面壳、指标面板、搜索栏、空态和错误态必须进入 `src/components/app`，不要放在 `src/pages/shared`。

## 请求、错误和通知

- 列表概览、指标和图表禁止通过 `items.map(async item => loadDetail(item.id))` 批量制造 N+1 请求；优先使用后端 summary/batch API。用户主动展开单行详情时才按需请求 item detail，并缓存已加载结果。
- 同一页面生命周期内相同参数的并发加载应复用 in-flight Promise，避免 React StrictMode、重复点击或多个入口同时触发相同请求；请求结束后清理，显式刷新仍可重新加载。
- React state updater 必须保持纯函数，禁止在 `setState(current => ...)` 内发请求、通知或写外部状态；先计算交互意图，再在 updater 外执行副作用。

不要直接写：

```ts
error instanceof Error ? error.message : "请求失败"
```

应使用：

```ts
const appError = normalizeAppError(error, {
  fallbackMessage: "加载失败。",
})
notify.error({
  title: "加载失败",
  description: appError.message,
})
```

通用资源加载优先使用：

```tsx
const resource = useApiResource({
  enabled: Boolean(accessToken),
  load: () => loadSomething(accessToken),
  errorMessage: "加载失败。",
})

return (
  <DataState
    state={resource.state}
    error={resource.error}
    empty={resource.data?.items.length === 0}
    emptyTitle="暂无数据"
    onRetry={resource.reload}
  >
    ...
  </DataState>
)
```

流式 chat 等特殊状态机可以保留 feature-specific 状态，但错误归一化和用户反馈仍应走 app service。

## 国际化

- 用户可见文案必须通过 `i18next` 资源输出，不在 page、feature、app service 或 UI primitive 中新增硬编码业务文案。
- 中英文资源必须同步维护；新增或修改资源后运行 `npm run i18n:check`，确保资源键、插值参数和静态翻译键引用一致。
- 日期、数字、紧凑数字和相对时间必须使用当前应用 locale；通用格式化通过 `getCurrentLocale()` 获取语言，不硬编码 `zh-CN` / `en-US`，也不依赖运行环境默认 locale。
- 语言资源保持独立构建 chunk，避免双语文案进入主入口包。

## 确认弹窗

不要使用：

```ts
window.confirm("Delete?")
```

应使用：

```ts
const confirmed = await confirm({
  title: "确认删除？",
  description: "此操作不可撤销。",
  confirmLabel: "删除",
  variant: "destructive",
})
```

## 表单和状态组件

通用字段：

- 使用 `FormField`
- 使用 `FormSection`
- 布尔开关字段使用 `ToggleField`

通用状态展示：

- 空态使用 `EmptyState`
- 错误态使用 `ErrorState`
- 资源态使用 `DataState`
- 状态标签使用 `StatusBadge`
- 表格外壳使用 `DataTableShell`
- 数据表格按表格容器宽度设置列优先级：核心列始终展示，次要列使用命名容器查询渐进展示，极窄宽度由横向滚动兜底
- 列表页搜索、筛选和主操作使用 `AppListToolbar`
- 趋势和概览图表使用 `AppLineChart` / `AppBarChart`，底层基于 shadcn `ChartContainer` 和 `recharts`
- 普通表单动作直接使用页面或弹窗现有布局，不新增无语义的按钮组壳

不要在页面内新增本地 `Field`、`TextInput`、`ToggleField`、`StatusBadge`、`ErrorNotice`、`EmptyState`，除非它们有明确且不可复用的业务语义。

## 系统管理页面设计约束

系统管理页面包括：

- `/system/models`
- `/system/plans`
- `/system/secrets`
- `/system/users`

这组页面采用统一的单列管理页模板：

```text
页面标题区
指标区
工具条
主列表 / 表格
行内展开详情 / 折叠区 / 弹窗编辑
```

规则：

1. 不做左右分栏，不常驻右侧详情面板。
2. 主视图始终是列表或表格。
3. 轻量详情使用行内展开或折叠区。
4. 新增和编辑使用 `AppDialog`。
5. 危险操作使用 `confirm`。
6. 状态、空态、错误态、加载态继续使用 app 底座组件。
7. 页面级工具条、展开详情、折叠分组和字段网格如需抽象，应进入 `components/app`。

### 用户管理展示口径

用户管理页面向管理员排查账号、套餐、usage 和 quota 问题，主表应优先支持快速扫描，不把所有明细摊平到表格。

主表推荐列：

- 用户：展示昵称/邮箱，必要时只在详情里展示 user_id。
- 角色/状态：使用 `StatusBadge`。
- 套餐：展示当前套餐或已缓存套餐记录数量。
- 本月用量：展示月度 usage 汇总或记录数量。
- Workspace：展示该用户拥有 workspace 的总存储占用和数量。
- 操作：编辑角色、套餐等管理动作。

详情区使用行内展开或 `AppDialog`，按折叠分组展示：

- 账号信息：user_id、email、role、status、created_at、last_seen_at。
- 套餐信息：plan、assignment source、effective period、workspace/model/credit policy。
- Usage：本月 tokens、credits、requests、按模型拆分和趋势。
- Workspace：workspace 列表、storage、objects、files、versions、quota ratio、recalculated_at。
- 风险事件：后续可接入结构化 quota exceeded 日志和审计记录。

不要在用户管理主表中直接展开所有 workspace usage 明细；主表展示汇总，详情展示明细。

推荐后续底座组件：

- `AppListToolbar`
- `AppExpandablePanel`
- `AppDisclosureSection`
- `AppFieldGrid`

这些组件应先在系统管理页面验证，再推广到其他功能。

## 提交和验证

每个 phase 或清晰闭环的架构改动都应提交一个中文分点 commit。

提交格式示例：

```text
feat(frontend): 收敛页面依赖链路

- 删除只做 re-export 的 page barrel 文件，避免路由依赖无职责中转层
- 路由改为直接引用真实页面模块，保持 page 层依赖单向清晰
- 自动化页直接复用 components/app 底座组件
- 保留同目录业务 shared 作为真实共享工具
```

提交前必须运行：

```bash
npm run i18n:check
npm run lint
npm run build
```

目标状态：

- lint 0 errors
- lint 0 warnings
- build 通过

## 当前架构结论

前端底座已经完成 Phase 1-4 和后续精修：

- `components/workbench` 已删除。
- `src/pages/shared` 已删除，跨页面共享展示组件已迁入 `components/app`。
- `router` 不再依赖只做 re-export 的 page barrel。
- 页面和 feature 中不再直接解析 `instanceof Error`。
- `window.alert` / `window.confirm` 已由 ESLint 禁止。
- 通知、确认、错误归一化、资源态、表单、空态、错误态、状态标签、指标页组件都已进入 app 层。

后续新增前端功能应默认复用这些底座，而不是重新发明局部实现。
