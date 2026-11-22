import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  DESKTOP_LAYOUT_BREAKPOINT,
  isCompactLayoutWidth,
} from "../src/hooks/use-compact-layout.ts"

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

const sidebar = source("src/components/ui/sidebar.tsx")
const appShell = source("src/app/app-shell.tsx")

assert.equal(DESKTOP_LAYOUT_BREAKPOINT, 1024)
assert.equal(isCompactLayoutWidth(0), true)
assert.equal(isCompactLayoutWidth(767), true)
assert.equal(isCompactLayoutWidth(1023), true)
assert.equal(isCompactLayoutWidth(1024), false)
assert.equal(isCompactLayoutWidth(1440), false)

assert.match(sidebar, /useIsCompactLayout/)
assert.doesNotMatch(sidebar.split("function SidebarTrigger")[0], /hidden lg:block|hidden[^"\n]*lg:flex/, "presentation owner, not a second CSS breakpoint, decides desktop visibility")
assert.match(appShell, /compact=\{drawer\} independentCompact/)
assert.match(sidebar, /independentCompact/)
assert.match(sidebar, /state === "expanded" \|\| collapsible === "icon" \? "docked"/)
assert.match(sidebar, /data-compact="true"/)
assert.match(
  sidebar,
  /compactMode === "full"[\s\S]*?width: "100vw",[\s\S]*?maxWidth: "none"/,
  "Compact full sidebars must override Sheet's responsive drawer width cap"
)
assert.doesNotMatch(
  sidebar,
  /useIsMobile|isMobile|openMobile|setOpenMobile|mobileMode|data-mobile/
)
assert.doesNotMatch(
  sidebar,
  /\b(?:sm|md):(block|flex|peer-data|after|opacity)/,
  "Sidebar interaction styles must not activate below the desktop boundary"
)
assert.match(appShell, /useIsCompactLayout/)
assert.match(appShell, /useVisualViewport\(compact\)/)
assert.match(appShell, /data-slot="chat-workbench"/)
assert.match(appShell, /data-slot="resource-workbench"/)
assert.equal((appShell.match(/<ChatWorkbench /g) ?? []).length, 1, "one persistent chat mount")
assert.match(appShell, /showResource \? "flex" : "hidden"/)
assert.doesNotMatch(appShell, /isRightSidebarOpen|useRightSidebarResize/, "chat availability is not a sidebar preference")
assert.match(sidebar, /if \(!keyboardShortcut\)/)

// The compact-content boundary stays 1024; navigation presentation is independently 768.
const { computeWorkbenchColumns, DRAWER_BREAKPOINT, AUTO_RAIL_BREAKPOINT } = await import("../src/app/shell/workbench-layout.ts")
assert.equal(DRAWER_BREAKPOINT, 768)
assert.equal(AUTO_RAIL_BREAKPOINT, 1024)
assert.deepEqual(computeWorkbenchColumns(1440, true, 280, null, true), { drawer: false, sidebar: 280, center: 512, right: 648 })
assert.deepEqual(computeWorkbenchColumns(1023, true, 420, null, true), { drawer: false, sidebar: 420, center: 603, right: 0 }, "explicit medium expansion wins; resource yields to its stable focus surface")
assert.equal(computeWorkbenchColumns(1023, false, 420, null, true).sidebar, 56, "resource entry may default to rail before explicit expansion")
assert.equal(computeWorkbenchColumns(1023, true, 420, null, false).sidebar, 420, "medium navigation can expand manually")
assert.equal(computeWorkbenchColumns(768, false, 280, null, true).right, 312)
assert.equal(computeWorkbenchColumns(768, true, 420, null, false).sidebar, 368, "manual expansion also preserves the center minimum without overwriting its 420px preference")
assert.equal(computeWorkbenchColumns(767, true, 280, 1000, true).sidebar, 0)
assert.equal(computeWorkbenchColumns(767, true, 280, 1000, true).right, 0)
for (let width = 0; width <= 2560; width += 7) {
  for (const expanded of [false, true]) {
    for (const preferred of [264, 280, 420]) {
      const columns = computeWorkbenchColumns(width, expanded, preferred, 1000, true)
      assert.ok(columns.center >= 0)
      assert.equal(columns.sidebar + columns.center + columns.right, width)
      if (columns.right > 0) {
        assert.ok(columns.center >= 400)
        assert.ok(columns.right >= 300)
        assert.ok(columns.right <= width * .7)
      }
    }
  }
}
assert.equal((appShell.match(/<Outlet\s*\/>/g) ?? []).length, 1, "one stable routed surface")
assert.doesNotMatch(appShell, /w-\[44%\]|min-w-96/)
console.log("responsive layout checks passed")
