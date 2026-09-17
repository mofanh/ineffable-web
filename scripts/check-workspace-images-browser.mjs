import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { chromium } from "playwright-core"
import { createServer } from "vite"
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(p => p && existsSync(p))
const server = await createServer({ root: process.cwd(), logLevel: "error", server: { host: "127.0.0.1", port: 0 } })
const workspace = "00000000-0000-0000-0000-000000000001"
const objectId = "00000000-0000-0000-0000-000000000002"
const versionId = "00000000-0000-0000-0000-000000000003"
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64")
const image = { workspace_id: workspace, object_id: objectId, version_id: versionId, mime_type: "image/png", width: 1, height: 1, size_bytes: png.length }
let browser
try {
  await server.listen(); browser = await chromium.launch({ executablePath, headless: true })
  for (const lang of ["en", "zh"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } })
    const errors = [], textReads = [], uploads = []
    let hold = false, release
    page.on("pageerror", e => errors.push(e.message))
    await page.addInitScript(() => {
      localStorage.setItem("ineffable.auth.access_token", "fixture-token")
      localStorage.setItem("ineffable.auth.session_id", "fixture-session")
      localStorage.setItem("ineffable.auth.access_expires_at", String(Date.now() / 1000 + 3600))
      localStorage.setItem("ineffable.chat.new_conversation_draft", "true")
    })
    const object = (id) => ({ id: id === "image" ? objectId : "text", workspace_id: workspace, kind: "file", name: id === "image" ? "sample.png" : "note.txt", path: id === "image" ? "会话附件/2026-09/sample.png" : "note.txt", mime_type: id === "image" ? "image/png" : "text/plain", current_version_id: id === "image" ? versionId : "text-version", updated_at: "2026-09-17T00:00:00Z" })
    await page.route("**/gateway/v1/**", async route => {
      const path = new URL(route.request().url()).pathname
      let body = { items: [], profiles: [], environments: [], conversations: [], events: [], next_seq: 0 }
      if (path.endsWith("auth/me")) body = { user: { id: "actor", role: "user", status: "active" }, workspaces: [{ id: workspace, workspace_type: "personal", name: "Workspace" }], current_workspace_id: workspace }
      else if (path.includes("workspace-objects/") && path.endsWith("/versions")) {
        const id = path.split("workspace-objects/")[1].split("/")[0]
        body = { object: object(id), versions: [{ id: object(id).current_version_id, version_no: 1 }] }
      } else if (path.endsWith("/content")) {
        textReads.push(path)
        assert.ok(path.includes("/text/"), "image must never request text content")
        body = { object: object("text"), version: { id: "text-version", version_no: 1 }, content: "TEXT_CONTENT" }
      } else if (path.endsWith("/image")) {
        if (hold) await new Promise(resolve => { release = resolve })
        body = { image }
      } else if (path.endsWith("/image-preview") || path.endsWith("/raw")) return route.fulfill({ contentType: "image/png", body: png })
      else if (path.endsWith("/images")) uploads.push(path)
      await route.fulfill({ json: body })
    })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/workspace-image-fixture.html?lang=${lang}`)
    const preview = lang === "en" ? "Image preview" : "图片预览"
    const reference = lang === "en" ? "Use as reference" : "作为参考图"
    await page.locator("main").getByRole("img", { name: preview }).waitFor()
    assert.deepEqual(textReads, [])
    assert.equal(await page.locator("main").getByRole("button", { name: lang === "en" ? "Edit file" : "编辑文件", exact: true }).count(), 0)
    await page.locator("main").getByRole("img", { name: preview }).click()
    const download = page.getByRole("link", { name: lang === "en" ? "Download image" : "下载图片" })
    await download.waitFor()
    assert.ok((await download.getAttribute("href")).startsWith("blob:"))
    await page.keyboard.press("Escape")
    await page.locator("main").getByRole("button", { name: reference, exact: true }).click()
    await page.getByRole("button", { name: lang === "en" ? "Remove attachment" : "移除附件", exact: true }).waitFor()
    assert.deepEqual(uploads, [], "using a reference must not copy/upload bytes")
    await page.getByRole("button", { name: "Open text", exact: true }).click()
    await page.getByText("TEXT_CONTENT", { exact: true }).waitFor()
    assert.equal(await page.locator("main").getByRole("img").count(), 0)
    hold = true
    await page.getByRole("button", { name: "Open image", exact: true }).click()
    while (!release) await page.waitForTimeout(10)
    await page.getByRole("button", { name: "Open text", exact: true }).click()
    await page.getByText("TEXT_CONTENT", { exact: true }).waitFor()
    const response = page.waitForResponse(r => r.url().endsWith("/image"))
    release(); await response
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.locator("main").getByRole("img").count(), 0, "late image cannot overwrite new selection")
    assert.deepEqual(errors, [])
    await page.close(); console.log(`workspace image preview, reference and navigation passed (${lang})`)
  }
} finally { await browser?.close(); await server.close() }
