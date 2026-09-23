export const workspace = "10000000-0000-4000-8000-000000000001"
export const team = "10000000-0000-4000-8000-000000000002"
export const imageId = "20000000-0000-4000-8000-000000000001"
const version = "30000000-0000-4000-8000-000000000001"
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64")
export const image = { workspace_id: workspace, object_id: imageId, version_id: version, mime_type: "image/png", width: 1, height: 1, size_bytes: png.length }
const workspaces = [{ id: workspace, name: "Personal", workspace_type: "personal" }, { id: team, name: "Team", workspace_type: "team" }]
const object = { id: imageId, workspace_id: workspace, kind: "file", parent_id: null, name: "sample.png", path: "sample.png", mime_type: "image/png", current_version_id: version, updated_at: "2026-09-23T00:00:00Z" }

export async function installShellFixture(page, open) {
  const requests = [], errors = [], unexpected = []
  page.on("request", request => requests.push({ path: new URL(request.url()).pathname, method: request.method(), auth: request.headers().authorization }))
  page.on("pageerror", error => errors.push(error.message))
  await page.addInitScript(open => {
    window.__shellRenders = { shell: 0, navigation: 0, chat: 0 }
    window.__shellLongTasks = []
    window.__shellNotifications = []
    window.addEventListener("ineffable:app-notification", event => window.__shellNotifications.push(event.detail))
    new PerformanceObserver(list => window.__shellLongTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: "longtask" })
    localStorage.setItem("ineffable.auth.access_token", "fixture-token")
    localStorage.setItem("ineffable.auth.session_id", "fixture-session")
    localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
    localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
    localStorage.setItem("ineffable.ui.right-sidebar.open", String(open))
    localStorage.setItem("ineffable.ui.language", "en-US")
  }, open)
  await page.route("**/gateway/**", async route => {
    const request = route.request(), p = new URL(request.url()).pathname
    const second = request.headers().authorization === "Bearer fixture-token-b"
    let body
    if (request.method() !== "GET") unexpected.push(`${request.method()} ${p}`)
    if (p.endsWith("/auth/me")) body = { user: { id: second ? "user-b" : "user", email: "fixture@example.test", display_name: second ? "Second owner" : "Fixture owner", role: "user", status: "active" }, workspaces, current_workspace_id: workspace }
    else if (p.endsWith("/conversations/list")) body = { conversations: [] }
    else if (p.endsWith("/channel-connections")) body = []
    else if (p.endsWith("/directory")) {
      const id = p.split("/").at(-2)
      body = { workspace_id: id, next_cursor: null, objects: Array.from({ length: 100 }, (_, i) => ({ id: `${id}-${i}`, workspace_id: id, kind: "file", parent_id: null, name: `File ${i}.md`, path: `File ${i}.md`, created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z" })) }
    } else if (p.endsWith("/workspace-invitations/incoming")) body = { invitations: [] }
    else if (p.endsWith("/models/profiles")) body = { profiles: [{ id: "model", display_name: "Fixture model", input_modalities: ["text", "image"] }] }
    else if (p.endsWith("/sandbox/environments")) body = { providers: [], environments: [] }
    else if (p.endsWith("/conversations/capability-catalog")) body = { items: [] }
    else if (p.endsWith("/capability-exposure/policy")) body = { selection: { mode: "smart" }, capability_exposure_policy: { policy: { allowed_modes: ["smart"], exposure_budget: { max_count: 24 } } } }
    else if (p.endsWith("/conversations/preferences")) body = { timezone: "UTC", version: 1, defaults_json: {} }
    else if (p.endsWith("/versions")) body = { object, versions: [{ id: version, version_no: 1 }] }
    else if (p.endsWith("/image")) body = { image }
    else if (p.endsWith("/image-preview") || p.endsWith("/raw")) return route.fulfill({ contentType: "image/png", body: png })
    else { unexpected.push(p); return route.fulfill({ status: 404, json: { error: "Unexpected fixture API" } }) }
    // Keep concurrent initialization calls in flight long enough to measure coalescing.
    await new Promise(resolve => setTimeout(resolve, 80))
    await route.fulfill({ json: body })
  })
  return { requests, errors, unexpected }
}

export const apiRequests = requests => requests.filter(r => r.path.startsWith("/gateway/"))
export const countPath = (requests, suffix) => requests.filter(r => r.path.endsWith(suffix)).length

export async function waitForShell(page) {
  await page.locator('[data-slot="sidebar-trigger"]').waitFor()
  await page.getByRole("button", { name: "File 99.md", exact: true }).first().waitFor()
  await page.waitForLoadState("networkidle")
}

export async function measureToggle(page) {
  return page.evaluate(async () => {
    window.__shellRenders = { shell: 0, navigation: 0, chat: 0 }
    window.__shellLongTasks = []
    const samples = []
    let firstFrameMs = 0, previous = performance.now()
    const start = previous
    const done = new Promise(resolve => {
      const frame = timestamp => {
        if (!samples.length) firstFrameMs = performance.now() - start
        samples.push(timestamp - previous)
        previous = timestamp
        if (timestamp - start < 600) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    document.querySelector('[data-slot="sidebar-trigger"]').click()
    await done
    const values = samples.slice(1).sort((a, b) => a - b)
    return { renders: window.__shellRenders, firstFrameMs, frames: samples.length, p95: values[Math.ceil(values.length * .95) - 1], max: Math.max(...values), longTasks: window.__shellLongTasks,
      gap: document.querySelector('[data-side="left"] [data-slot="sidebar-gap"]').getBoundingClientRect().width }
  })
}
