import { createServer } from "vite";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { cpus, totalmem, tmpdir } from "node:os";
import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const resultPath = process.env.INEFFABLE_CHAT_BENCHMARK_OUTPUT ?? `${tmpdir()}/ineffable-chat-window-metrics.json`;
const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((path) => path && existsSync(path));
assert.ok(executablePath, "Chrome/Chromium is required");
// Optional negative control: load the old implementation without mutating the worktree.
const baselineRef = process.env.INEFFABLE_CHAT_BASELINE_REF;
const baselinePaths = ["src/features/chat/gateway-chat-sidebar.tsx", "src/features/chat/components/chat-message-list.tsx", "src/features/chat/components/agent-pane.tsx"];
const baselineSources = new Map(baselineRef ? baselinePaths.map(path => [root + "/" + path, execFileSync("git", ["show", `${baselineRef}:${path}`], {cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024})]) : []);
const wanted = process.argv.slice(2);
const scenarios = wanted.length ? wanted : ["simple:1000", "simple:10000", "mixed:1000", "mixed:10000"];
const results = { environment: { date: (/* @__PURE__ */ new Date()).toISOString(), node: process.version, mode: "Vite development / React development, headless Chrome, unthrottled", viewport: { width: 1280, height: 900 }, backend: "in-memory HTTP fixture; network/SQL excluded", cpu: cpus()[0]?.model, memoryBytes: totalmem(), head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() }, scenarios: [] };
results.environment.fixtureLayout = "100dvh wrapper / SidebarProvider height 100% minHeight 0";
const sessionSource = `import { useSyncExternalStore } from 'react';
let session={accessToken:'fixture',currentWorkspace:null,workspaces:[],conversations:[{id:'a',title:'Baseline A',current_run:null},{id:'b',title:'Baseline B',current_run:null}],currentConversationId:'a',refreshConversations:async()=>{},getConversationSelectionIdentity:()=>({sessionId:undefined,version:0}),createConversation:async()=>({id:'a'}),selectConversation:()=>{},renameConversation:async()=>{}};
const listeners=new Set(); window.addEventListener('fixture:select',event=>{session={...session,currentConversationId:event.detail};listeners.forEach(l=>l())});
export function useAppSession(){return useSyncExternalStore(l=>{listeners.add(l);return()=>listeners.delete(l)},()=>session)};`;
const server = await createServer({ root, logLevel: "error", plugins: [{ name: "h08-session", enforce: "pre", resolveId(id) {
  if (id === "@/features/auth/app-session" || id.endsWith("/src/features/auth/app-session")) return "\0h08-session";
}, load(id) {
  if (id === "\0h08-session") return sessionSource;
  return baselineSources.get(id.split("?")[0]);
}, transform(code, id) {
  if (id.endsWith("/scripts/live-refresh-fixture.tsx")) return { code: code.replace("import { createRoot }", 'import * as React from "react"\nimport { createRoot }').replace('<SidebarProvider style={{ height: "100dvh", minHeight: 0 }}>', '<React.Profiler id="sidebar" onRender={(_id,phase,actualDuration,baseDuration)=>{(window.__h08Commits??=[]).push({phase,actualDuration,baseDuration})}}><div style={{height:"100dvh",minHeight:0,overflow:"hidden"}}><SidebarProvider style={{height:"100%",minHeight:0}}>').replace("</SidebarProvider>", "</SidebarProvider></div></React.Profiler>"), map: null };
} }], server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } });
let browser;
const percentile = (a, p) => {
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(b.length * p))] ?? null;
};
const summary = (a) => ({ n: a.length, p50: percentile(a, 0.5), p95: percentile(a, 0.95), max: a.length ? Math.max(...a) : null });
const md = "### Long Markdown specimen\n\n" + Array.from({ length: 12 }, (_, i) => `Paragraph ${i}: **stable text** with a [reference](https://example.test) and inline \`value\`. This paragraph exercises wrapping and Markdown rendering across the viewport.`).join("\n\n") + "\n\n| Column | Value |\n| --- | --- |\n| A | one |\n| B | two |\n";
function makeEntries(size, kind, conversation) {
  let seq = 0;
  return Array.from({ length: size }, (_, i) => {
    const run = `${conversation}-r${i}`;
    const base = { conversation_id: conversation, created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z", metadata_json: { scope: "main" } };
    const row = (type, content, meta = {}, unit) => {
      const n = ++seq;
      return { ...base, id: `${conversation}-m${n}`, run_id: type === "input" ? null : run, role: type === "input" ? "user" : type === "tool_result" ? "tool" : "assistant", message_type: type, content, message_seq: n, canonical_seq: n, timeline_seq: unit?.seq ?? n, timeline_unit_id: unit?.id ?? `message:${conversation}-m${n}`, metadata_json: { scope: "main", ...meta } };
    };
    if (kind === "mixed" && i % 10 === 9) {
      const unit = { id: `run:${run}:anchor:${seq + 1}`, seq: seq + 1 };
      return [row("tool_call", "", { tool_calls: [{ id: `${run}-c1`, name: "read_file", input: { path: "example.txt" } }, { id: `${run}-c2`, name: "list_dir", input: { path: "." } }] }, unit), row("tool_result", "File excerpt ".repeat(100), { tool_call_id: `${run}-c1`, tool_name: "read_file" }, unit), row("tool_result", '["one.txt","two.txt"]', { tool_call_id: `${run}-c2`, tool_name: "list_dir" }, unit), row("output", `MARKER_${conversation}_${i}

${md}`, {}, unit)];
    }
    return [row("input", `MARKER_${conversation}_${i} \u2014 ordinary conversation input. The same short content shape is used at both dataset sizes.`)];
  });
}
async function assertLayout(page) {
  const layout = await page.evaluate(() => {
    const scroller = document.querySelector("[data-chat-scroll-content]")?.parentElement;
    const composer = document.querySelector("textarea");
    const rect = composer?.getBoundingClientRect();
    return { viewportHeight: innerHeight, scrollerClientHeight: scroller?.clientHeight, scrollerScrollHeight: scroller?.scrollHeight, bodyScrollHeight: document.body.scrollHeight, composerRect: rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null };
  });
  if (!(layout.scrollerClientHeight > 0 && layout.scrollerClientHeight <= layout.viewportHeight && layout.composerRect?.top >= 0 && layout.composerRect?.bottom <= layout.viewportHeight && layout.composerRect?.height > 0 && layout.composerRect?.width > 0)) throw Error("Invalid bounded fixture layout " + JSON.stringify(layout));
  return layout;
}
async function snapshot(page, cdp, label) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const layout = await assertLayout(page);
  const heap = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  const ui = await page.evaluate(() => ({ entryRows: document.querySelectorAll("[data-chat-entry-role]").length, nodeRows: document.querySelectorAll("[data-web-node-row]").length, elements: document.querySelectorAll("*").length, commits: window.__h08Commits ?? [], longTasks: window.__h08LongTasks ?? [] }));
  return { label, layout, heapUsedBytes: heap.usedSize, heapTotalBytes: heap.totalSize, dom, ...ui, commits: summary(ui.commits.map((x) => x.actualDuration)), longTasks: summary(ui.longTasks) };
}
async function inputLatency(page) {
  await assertLayout(page);
  await page.evaluate(() => {
    window.__h08Input = [];
    const el = document.querySelector("textarea");
    if (!el) throw Error("no composer");
    if (!el.__h08) {
      el.__h08 = true;
      el.addEventListener("beforeinput", () => {
        const start = performance.now();
        requestAnimationFrame(() => window.__h08Input.push(performance.now() - start));
      }, { capture: true });
    }
  });
  await page.locator("textarea").first().pressSequentially("abcdefghijklmnopqrst", { delay: 20 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const raw = await page.evaluate(() => window.__h08Input);
  return { raw, ...summary(raw) };
}
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  results.environment.chrome = browser.version();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const scenario of scenarios) {
    const [kind, n] = scenario.split(":");
    const size = Number(n);
    const entries = { a: makeEntries(size, kind, "a"), b: makeEntries(size, kind, "b") };
    const stats = { kind, size, requests: 0, responseBytes: 0, pages: [], snapshots: [], pageErrors: [] };
    results.scenarios.push(stats);
    const page = await browser.newPage({ locale: "zh-CN", viewport: results.environment.viewport });
    page.setDefaultTimeout(6e4);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.addInitScript(() => {
      window.__h08Commits = [];
      window.__h08LongTasks = [];
      new PerformanceObserver((list) => {
        window.__h08LongTasks.push(...list.getEntries().map((x) => x.duration));
      }).observe({ type: "longtask" });
    });
    page.on("pageerror", (e) => stats.pageErrors.push(e.message));
    await page.route("**/gateway/**", async (route) => {
      const url = new URL(route.request().url());
      let body = { items: [], profiles: [], environments: [], pending_inputs: [], events: [], next_seq: 0 };
      if (url.pathname.endsWith("/messages")) {
        const id = url.searchParams.get("conversation_id") ?? "a";
        const end = url.searchParams.has("before") ? Number(url.searchParams.get("before")) : size;
        const limit = Number(url.searchParams.get("limit") ?? 40);
        const start = Math.max(0, end - limit);
        body = { messages: entries[id].slice(start, end).flat(), next_seq: 0, page: { has_older: start > 0, before: start > 0 ? String(start) : null } };
        stats.requests++;
        const bytes = Buffer.byteLength(JSON.stringify(body));
        stats.responseBytes += bytes;
        stats.pages.push({ id, start, end, bytes });
      }
      if (url.pathname.endsWith("/get")) body = { id: url.searchParams.get("conversation_id"), title: "Baseline", current_run: null };
      if (url.pathname.endsWith("/observations/access")) body = { allowed: false };
      if (url.pathname.endsWith("/subscribe")) return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": fixture\n\n" });
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    const nav = performance.now();
    await page.goto(`${origin}/scripts/live-refresh-fixture.html`);
    await page.getByText(`MARKER_a_${size - 1}`, { exact: false }).first().waitFor();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    stats.coldFirstScreenMs = performance.now() - nav;
    const reloadStart = performance.now();
    await page.reload();
    await page.getByText(`MARKER_a_${size - 1}`, { exact: false }).first().waitFor();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    stats.firstScreenMs = performance.now() - reloadStart;
    stats.snapshots.push(await snapshot(page, cdp, "initial_40"));
    stats.initialInputNextFrameMs = await inputLatency(page);
    const switchTimes = [];
    for (const id of ["b", "a", "b", "a"]) {
      const t = performance.now();
      await page.evaluate((id2) => window.dispatchEvent(new CustomEvent("fixture:select", { detail: id2 })), id);
      await page.getByText(`MARKER_${id}_${size - 1}`, { exact: false }).first().waitFor();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      switchTimes.push(performance.now() - t);
    }
    stats.initialSwitchMs = { raw: switchTimes, ...summary(switchTimes) };
    await page.evaluate(() => {
      window.__h08Commits = [];
      window.__h08LongTasks = [];
    });
    const expandStart = performance.now();
    const checkpoints = [1e3, 1e4].filter((x) => x <= size);
    let loaded = 40;
    let iterations = 0;
    while (loaded < size) {
      const expected = Math.min(size, loaded + 40);
      await page.evaluate(() => {
        const el = document.querySelector("[data-chat-scroll-content]")?.parentElement;
        if (!el) throw Error("no scroll viewport");
        el.scrollTop = 0;
        el.dispatchEvent(new Event("scroll"));
      });
      await page.waitForFunction((expected2) => Number(document.querySelector("[data-chat-entry-count]")?.dataset.chatEntryCount ?? document.querySelectorAll("[data-chat-entry-role]").length) >= expected2, expected, { timeout: 9e4 });
      loaded = expected;
      iterations++;
      assert.ok(await page.locator("[data-chat-entry-role]").count() <= 80, `mounted entry budget at ${scenario}/${loaded}`);
      if (iterations % 25 === 0) console.log(JSON.stringify({ progress: scenario, loaded, elapsedMs: performance.now() - expandStart }));
      if (checkpoints.includes(loaded)) {
        stats.snapshots.push(await snapshot(page, cdp, `expanded_${loaded}`));
        stats.expandedInputRounds = [];
        for (let round = 0; round < 3; round++) stats.expandedInputRounds.push(await inputLatency(page));
        stats.expandedInputNextFrameMs = stats.expandedInputRounds[1];
        assert.ok(percentile(stats.expandedInputRounds.map((x) => x.p95), 0.5) <= 100, "median of three input next-frame p95 samples must stay below 100ms");
        writeFileSync(resultPath, JSON.stringify(results, null, 2));
      }
    }
    stats.expandAllMs = performance.now() - expandStart;
    stats.expansionPages = iterations;
    const loadedSwitch = [];
    for (const id of ["b", "a"]) {
      const t = performance.now();
      await page.evaluate((id2) => window.dispatchEvent(new CustomEvent("fixture:select", { detail: id2 })), id);
      await page.getByText(`MARKER_${id}_${size - 1}`, { exact: false }).first().waitFor();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      loadedSwitch.push(performance.now() - t);
    }
    stats.afterExpansionSwitchMs = { raw: loadedSwitch, ...summary(loadedSwitch) };
    stats.snapshots.push(await snapshot(page, cdp, "after_switch_back"));
    writeFileSync(resultPath, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ finished: scenario, firstScreenMs: stats.firstScreenMs, initialLayout: stats.snapshots[0].layout, expandAllMs: stats.expandAllMs, snapshots: stats.snapshots.map((x) => ({ label: x.label, entries: x.entryRows, elements: x.elements, heap: x.heapUsedBytes })), input: stats.expandedInputNextFrameMs, errors: stats.pageErrors }));
    assert.deepEqual(stats.pageErrors, []);
    await page.close();
  }
} catch (error) {
  results.error = String(error?.stack ?? error);
  console.error(results.error);
  writeFileSync(resultPath, JSON.stringify(results, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
