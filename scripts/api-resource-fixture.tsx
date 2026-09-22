import * as React from "react"
import { createRoot } from "react-dom/client"
import { clearApiResourceCache, invalidateApiResourceCache, useApiResource } from "../src/lib/app/use-api-resource"

type Resource = ReturnType<typeof useApiResource<string>>
const requests: { key: string; resolve: (value: string) => void; reject: (error: Error) => void }[] = []
const resources: Record<string, Resource> = {}
const uncached = new URLSearchParams(window.location.search).has("uncached")
const harness = {
  requests, resources, updaterCalls: 0,
  configure: (value: { cacheKey: string; second: boolean }) => { void value },
  clear: clearApiResourceCache,
  invalidate: (key: string) => invalidateApiResourceCache(["resource-fixture", key]),
}
Object.assign(window, { resourceHarness: harness })

function Probe({ id, cacheKey }: { id: string; cacheKey: string }) {
  const load = React.useCallback(() => new Promise<string>((resolve, reject) => requests.push({ key: cacheKey, resolve, reject })), [cacheKey])
  const resource = useApiResource({ cacheKey: uncached ? undefined : ["resource-fixture", cacheKey], load })
  React.useLayoutEffect(() => {
    resources[id] = resource
    return () => { delete resources[id] }
  }, [id, resource])
  return <pre data-probe={id}>{JSON.stringify({ data: resource.data, state: resource.state, error: resource.error?.message ?? null })}</pre>
}

function Fixture() {
  const [config, configure] = React.useState({ cacheKey: "a", second: !uncached })
  React.useLayoutEffect(() => { harness.configure = configure }, [])
  return <><Probe id="first" cacheKey={config.cacheKey} />{config.second && <Probe id="second" cacheKey={config.cacheKey} />}</>
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>)
