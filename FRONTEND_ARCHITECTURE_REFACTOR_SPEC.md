# Ineffable Web Frontend Architecture Refactor Spec

## 1. Purpose

This document defines the execution standard for rebuilding the frontend foundation toward high cohesion and low coupling.

It does not replace `design.md` or `FRONTEND_DEVELOPMENT_GUIDE.md`.

- `design.md` remains the product and UI design baseline.
- `FRONTEND_DEVELOPMENT_GUIDE.md` remains the Gateway HTTP/SSE/Poll integration guide.
- This document defines code layering, shared component ownership, migration rules, and refactor acceptance criteria.

The immediate goal is to stop feature pages from reimplementing common behavior such as request errors, loading states, empty states, confirmations, forms, dialogs, tables, and notifications.

## 2. Current Problems

The codebase already contains reusable pieces, but they are not consistently treated as the default path.

Observed issues:

1. Toast exists, but notification usage is coupled to `base-client` and not exposed as an app-level service.
2. API errors are parsed centrally, but presentation and fallback messages are still scattered through pages.
3. Page shells, fields, dialogs, table markup, empty states, and error notices are repeatedly implemented in feature pages.
4. `window.alert` and `window.confirm` are still used even though UI dialog primitives exist.
5. Loading, empty, error, retry, and saving states are implemented manually per page.
6. Large feature files mix data fetching, UI state, business actions, layout, and presentational details.

The target is not more abstraction for its own sake. The target is a stable default path that makes the correct implementation cheaper than ad hoc implementation.

## 3. Layering Standard

Frontend code must follow these ownership boundaries.

### 3.1 UI Primitive Layer

Location:

- `src/components/ui`

Responsibility:

- Low-level, domain-neutral UI primitives.
- Thin wrappers around Radix/Base UI/shadcn-style primitives.
- Styling through shared tokens and variants.

Examples:

- `Button`
- `Input`
- `Textarea`
- `Select`
- `Toast`
- `AlertDialog`
- `Sheet`
- `Field`
- `Card`
- `Skeleton`
- `Tooltip`

Rules:

- No Gateway API calls.
- No business copy specific to workspace/chat/admin pages.
- No app session access.
- No feature-specific state.

### 3.2 Application Component Layer

Location:

- `src/components/app`
- Existing `src/components/workbench` may either be migrated into this layer or kept as a feature-specific facade if the component is truly workbench-only.

Responsibility:

- Reusable components that encode Ineffable application patterns.
- Components may know product-level interaction semantics, but must not own feature-specific data fetching.

Initial target components:

- `AppPage`
- `PageHeader`
- `AppToaster`
- `Notice`
- `DataState`
- `EmptyState`
- `ErrorState`
- `ConfirmDialog`
- `AsyncButton`
- `FormSection`
- `FormField`
- `DataTableShell`
- `StatusBadge`
- `ActionToolbar`

Rules:

- May consume app-level services such as notification and confirmation providers.
- May define consistent copy slots, but feature pages pass feature-specific text.
- Must expose simple props and avoid leaking Radix/Base internals unless necessary.
- Must be usable by multiple features before being added here.

### 3.3 Application Service Layer

Location:

- `src/lib/app`
- `src/lib/api`

Responsibility:

- Cross-feature behavior and policy.
- Request/error normalization, notifications, confirmation orchestration, async action helpers, resource state helpers.

Initial target modules:

- `src/lib/app/notifications.ts`
- `src/lib/app/api-errors.ts`
- `src/lib/app/confirm.tsx`
- `src/lib/app/use-async-action.ts`
- `src/lib/app/use-api-resource.ts`
- `src/lib/api/base-client.ts`

Rules:

- Services expose stable APIs to features.
- Services can depend on UI only through provider/event boundaries.
- `base-client` should normalize transport/API failures, not directly own every notification UI decision.
- Feature pages should not parse raw `Response` objects or duplicate generic HTTP error wording.

### 3.4 Feature Layer

Location:

- `src/features/auth`
- `src/features/chat`
- `src/features/workspace`
- Future feature directories under `src/features`

Responsibility:

- Domain behavior, domain state, and domain-specific components.
- API adapters that re-export or wrap shared API calls for the feature.

Rules:

- Feature components may compose application components.
- Feature components should not define reusable page shells, generic dialogs, generic fields, generic notices, or generic data tables.
- Feature model files should hold pure transformation/state logic where possible.
- Long feature files should be split when they contain unrelated responsibilities.

### 3.5 Page Layer

Location:

- `src/pages`

Responsibility:

- Route-level composition.
- Select session/context, call feature APIs/hooks, compose feature and app components.

Rules:

- Pages should not implement generic UI primitives.
- Pages should not use `window.alert` or `window.confirm`.
- Pages should not duplicate loading/empty/error/retry patterns.
- Pages may contain route-specific layout only when it cannot be shared.

## 4. Foundation APIs

### 4.1 Notifications

Target usage:

```ts
notify.success({ title: "Saved" })
notify.error({ title: "Save failed", description: message })
notify.warning({ title: "Permission required" })
notify.info({ title: "Reconnected" })
```

Required behavior:

- A single `AppToaster` is mounted once near the app root.
- Notifications support success, error, warning, and info tones.
- Actions are supported through a typed action callback.
- API/session notifications use the same channel as feature notifications.
- Toast UI is never manually mounted inside feature pages.

Migration rule:

- Replace `BaseClientToaster` with or wrap it inside `AppToaster`.
- Keep login-expired refresh behavior, but move the notification surface to the app notification service.

### 4.2 API Errors

Target shape:

```ts
type AppErrorKind =
  | "timeout"
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "server"
  | "unknown"

type AppError = {
  kind: AppErrorKind
  message: string
  status?: number
  cause?: unknown
  recoverable?: boolean
}
```

Required behavior:

- HTTP status, network failures, timeout/abort, and parsed API errors are normalized.
- Default messages live in one module.
- Feature pages can override fallback copy, but not reimplement generic classification.
- Access-token expiry remains a special auth/session policy.

Target usage:

```ts
const error = normalizeAppError(err, {
  fallbackMessage: "Failed to load notifications.",
})
setError(error.message)
notify.error({ title: "Request failed", description: error.message })
```

### 4.3 Async Resource State

Target usage:

```tsx
const invitations = useApiResource({
  enabled: Boolean(accessToken),
  load: () => listIncomingWorkspaceInvitations(accessToken),
  errorMessage: "Failed to load notifications.",
})

return (
  <DataState
    state={invitations.state}
    error={invitations.error}
    empty={invitations.data?.invitations.length === 0}
    emptyTitle="No pending workspace invitations."
    onRetry={invitations.reload}
  >
    <InvitationList items={invitations.data.invitations} />
  </DataState>
)
```

Required behavior:

- Common loading, empty, error, retry, and refreshing behavior is reusable.
- Feature-specific local state remains allowed when the flow is genuinely custom.
- Streaming chat state is not forced into this hook unless it naturally fits.

### 4.4 Confirmation

Target usage:

```ts
const confirmed = await confirm({
  title: `Delete "${name}"?`,
  description: "This action cannot be undone.",
  confirmLabel: "Delete",
  variant: "destructive",
})
```

Required behavior:

- `window.confirm` is not used in application code.
- Destructive actions use consistent copy, focus management, and button styling.
- Confirmation can be used from deeply nested feature actions without mounting a new dialog per row.

### 4.5 Forms

Required behavior:

- Use `src/components/ui/field.tsx` as the primitive field system.
- Application-level form helpers may provide common layout, validation display, and action rows.
- Feature pages must not define local generic `Field`, `TextInput`, or `ToggleField` unless they are feature-specific.

### 4.6 Tables And Lists

Required behavior:

- Repeated table/list shells use shared components for headers, empty state, loading state, and row actions.
- Avoid introducing a heavy table framework until sorting, pagination, selection, and virtualization need it.
- Current first target is a lightweight `DataTableShell`.

## 5. Directory Target

Target structure:

```text
src
├─ components
│  ├─ ui
│  ├─ app
│  └─ workbench
├─ features
│  ├─ auth
│  ├─ chat
│  └─ workspace
├─ lib
│  ├─ api
│  └─ app
├─ pages
└─ routes
```

Guidance:

- `components/ui` remains primitive.
- `components/app` becomes the default shared application component layer.
- `components/workbench` should shrink toward workbench-specific wrappers or be merged into `components/app` when broadly useful.
- `lib/app` owns cross-cutting interaction policy.
- Feature-specific model logic remains under `features/*/model`.

## 6. Execution Plan

### Phase 0: Baseline And Guardrails

Deliverables:

1. Add this spec.
2. Inventory duplicated primitives and cross-cutting behavior.
3. Agree on the first vertical slice.

Exit criteria:

- The team can classify a proposed component or hook into the correct layer.
- The first slice has clear before/after expectations.

### Phase 1: Foundation Setup

Deliverables:

1. Add `components/app/AppToaster`.
2. Add `lib/app/notifications`.
3. Add `lib/app/api-errors`.
4. Add `components/app/Notice`, `EmptyState`, `DataState`.
5. Add `components/app/ConfirmDialog` and `lib/app/confirm`.
6. Add initial `useAsyncAction` or `useApiResource` only if the first slice proves the need.

Exit criteria:

- The app has one notification provider.
- New code can show toast, inline error, empty state, loading state, and confirmation through shared APIs.
- Existing auth token expiry behavior still works.

### Phase 2: First Vertical Slice

Recommended slice:

- Team workspace and notifications pages in `src/pages/team-workspace-pages.tsx`.

Why:

- Clear API loading flows.
- Clear empty states.
- Clear error handling.
- Clear form flows.
- Limited blast radius.
- Contains duplicate `PageShell`, `FieldLabel`, `TextInput`, table markup, and repeated `setError` patterns.

Scope:

1. Replace local page shell with shared app page component.
2. Replace local field/input wrappers with shared field primitives.
3. Replace repeated loading/empty/error handling with shared state components.
4. Route API errors through normalized app errors.
5. Use app notifications for successful or failed user actions where appropriate.
6. Keep feature-specific copy and workflow inside the page/feature.

Exit criteria:

- The slice demonstrates the intended default development style.
- No local generic shell/field/error/empty primitives remain in the slice.
- No behavior regression in create team, member management, invitation list, or invitation acceptance.

### Phase 3: Expand Across High-Value Areas

Recommended order:

1. `src/pages/workspace-object-editor-page.tsx`
2. `src/features/workspace/app-sidebar.tsx`
3. `src/pages/system-management/*`
4. `src/pages/agent-products/automation-page.tsx`
5. Chat sidebar only after the shared foundation stabilizes, because streaming/recovery state is more specialized.

Exit criteria:

- `window.alert` and `window.confirm` are removed from application code.
- Generic `PageShell`, `Field`, `Dialog`, `EmptyState`, `ErrorNotice`, and table shells are not redefined in pages.
- API error classification and notification entry points are centralized.

### Phase 4: Enforcement

Deliverables:

1. Add lint/documentation checks where practical.
2. Add review checklist to PR process.
3. Keep architecture examples current.

Exit criteria:

- New feature work naturally uses the shared foundation.
- Review feedback can point to this spec instead of relying on preference.

## 7. Refactor Rules

1. Preserve behavior first, improve structure second.
2. Do not redesign visual language during architecture refactors unless required by the shared component.
3. Avoid broad file churn without a vertical slice.
4. Prefer small reusable APIs with one proven use and one expected near-term use.
5. Do not move feature-specific copy into global components.
6. Do not make generic hooks handle streaming chat unless the model fits.
7. Keep auth/session refresh behavior compatible with current localStorage keys and reload flow.
8. Keep destructive actions explicit and confirmable.
9. Use existing design tokens from `src/index.css`.
10. Add tests or build verification proportional to the changed surface.

## 8. Review Checklist

For each frontend change, reviewers should ask:

1. Is this UI primitive, app component, app service, feature logic, or page composition?
2. Is any generic behavior reimplemented locally?
3. Are API errors normalized through the shared path?
4. Are notifications shown through the app notification service?
5. Are loading, empty, error, retry, and saving states consistent?
6. Are destructive actions using shared confirmation?
7. Is feature-specific copy kept close to the feature?
8. Does the change preserve `design.md` layout and visual baseline?
9. Does the implementation avoid coupling a feature to another feature's internals?
10. Is the first usage simple enough that future developers will copy it correctly?

## 9. Success Metrics

Short term:

- First vertical slice uses the new foundation.
- New feature code no longer needs local toast/error/loading/empty boilerplate.
- `window.alert` and `window.confirm` count decreases.

Medium term:

- Page files get smaller because generic UI and async state are extracted.
- Error copy and notification behavior become consistent.
- System management, workspace editor, sidebar, and automation pages share the same foundation.

Long term:

- Feature work is mostly composition of app components, feature APIs, and feature-specific model logic.
- The application foundation is stable enough that adding new pages does not create new local component dialects.
