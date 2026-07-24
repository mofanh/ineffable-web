export const loadSystemModelsModule = () =>
  import("@/pages/system-management/models-page")
export const loadSystemPlansModule = () =>
  import("@/pages/system-management/plans-page")
export const loadSystemSecretsModule = () =>
  import("@/pages/system-management/secrets-page")
export const loadSystemUsersModule = () =>
  import("@/pages/system-management/users-page")

const systemManagementModuleLoaders = {
  "/system/models": loadSystemModelsModule,
  "/system/plans": loadSystemPlansModule,
  "/system/secrets": loadSystemSecretsModule,
  "/system/users": loadSystemUsersModule,
} as const

export type SystemManagementPath = keyof typeof systemManagementModuleLoaders

export function preloadRouteModule(path: string) {
  const loader =
    systemManagementModuleLoaders[path as SystemManagementPath]
  return loader ? loader().then(() => undefined) : Promise.resolve()
}

export function preloadSystemManagementModules() {
  return Promise.all(
    Object.values(systemManagementModuleLoaders).map((load) => load())
  ).then(() => undefined)
}
