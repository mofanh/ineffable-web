import { spawnSync } from "node:child_process"

// Run serially: browser frame budgets must not compete with other browser gates.
// HTTP fixtures validate UI ownership, not a live backend/provider deployment.
const checks = [
  ["i18n:check"], ["lint"], ["build"],
  ["check:chat-architecture"], ["check:chat-routing"],
  ["check:chat-runtime"], ["check:chat-store"],
  ["check:auth-session"], ["check:auth-isolation"],
  ["check:responsive-layout"], ["check:workbench-layout"],
  ["check:workbench-layout", "--production"],
  ["check:shell-performance"], ["check:shell-performance", "--production"],
  ["check:composer-settings"], ["check:admin-mobile"], ["check:admin-editor"],
  ["check:automation-runtime"], ["check:toast"],
  ["check:file-references"], ["check:workspace-rule"],
  ["check:workspace-delete"], ["check:workspace-lifecycle"],
]
for (const [name, ...args] of checks) {
  console.log(`\n=== ${name} ${args.join(" ")} ===`)
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", name, ...(args.length ? ["--", ...args] : [])], { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log("Conversation workbench deterministic gates passed (local HTTP fixtures).")
