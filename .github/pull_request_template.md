## Summary

- 

## Frontend Architecture Checklist

- [ ] I classified new code as UI primitive, app component, app service, feature logic, or page composition.
- [ ] I reused `src/components/app` or `src/components/ui` instead of adding local generic shells, notices, dialogs, fields, or tables.
- [ ] API/request errors go through `normalizeAppError` or an existing app-level error path.
- [ ] User feedback goes through `notify` and destructive actions go through `confirm`.
- [ ] Loading, empty, error, retry, and saving states use shared components/hooks where practical.
- [ ] I did not add `window.alert` or `window.confirm`.
- [ ] Visual and interaction changes follow `design.md` and `FRONTEND_ARCHITECTURE_REFACTOR_SPEC.md`.

## Verification

- [ ] `npm run build`
- [ ] `npm run lint`
