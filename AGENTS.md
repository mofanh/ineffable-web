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
- `ActionToolbar`
- `AppMetricPage`
- `AppSectionCard`
- `AppSearchBar`

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

## 请求、错误和通知

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
- 页面动作栏使用 `ActionToolbar`

不要在页面内新增本地 `Field`、`TextInput`、`ToggleField`、`StatusBadge`、`ErrorNotice`、`EmptyState`，除非它们有明确且不可复用的业务语义。

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
- `router` 不再依赖只做 re-export 的 page barrel。
- 页面和 feature 中不再直接解析 `instanceof Error`。
- `window.alert` / `window.confirm` 已由 ESLint 禁止。
- 通知、确认、错误归一化、资源态、表单、空态、错误态、状态标签、指标页组件都已进入 app 层。

后续新增前端功能应默认复用这些底座，而不是重新发明局部实现。
