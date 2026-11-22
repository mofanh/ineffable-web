import { spawnSync } from "node:child_process"

// Run serially: browser frame budgets must not compete with other browser gates.
// HTTP fixtures validate UI ownership, not a live backend/provider deployment.
const checks = [
  ["i18n:check"], ["lint"], ["build"],
  ["check:chat-architecture"], ["check:chat-routing"],
  ["check:chat-runtime"], ["check:chat-store"], ["check:chat-resume"],
  ["check:agent-iteration-handoff"], ["check:input-progress"],
  ["check:chat-web-runtime"], ["check:chat-web-integration"],
  ["check:model-failure"], ["check:capability-catalog"],
  ["check:admin-capability-families"], ["check:admin-usage-timeseries"],
  ["check:auth-session"], ["check:auth-isolation"], ["check:password-change"],
  ["check:api-resource"], ["check:request-efficiency"], ["check:polling"],
  ["check:responsive-layout"], ["check:workbench-layout"],
  ["check:workbench-layout", "--production"],
  ["check:workbench-structure"], ["check:workbench-structure", "--production"],
  ["check:resource-toolbar"],
  ["check:settings-overlay"], ["check:settings-overlay", "--production"],
  ["check:shell-performance"], ["check:shell-performance", "--production"],
  ["check:chat-browser"], ["check:chat-reading"], ["check:chat-window"],
  ["check:composer-settings"], ["check:capability-save"], ["check:run-observations"],
  ["check:file-references"], ["check:images"], ["check:workspace-rule"],
  ["check:workspace-directory"], ["check:workspace-delete"], ["check:workspace-lifecycle"], ["check:workspace-navigation"],
  ["check:logic-invariants"], ["check:sandbox-delivery"], ["check:sandbox-delivery-browser"],
  ["check:admin-mobile"], ["check:admin-editor"], ["check:automation-runtime"],
  ["check:channels"], ["check:toast"], ["check:telemetry"], ["check:chunk-recovery"],
  // chat-browser already includes tool-actions/composer-catalog/chat-stream-layout/
  // chat-admission. file-references includes request-efficiency-browser; no duplicate browsers.
]
for (const [name, ...args] of checks) {
  console.log(`\n=== ${name} ${args.join(" ")} ===`)
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", name, ...(args.length ? ["--", ...args] : [])], { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log("Conversation workbench deterministic gates passed (local HTTP fixtures).")
