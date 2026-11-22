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
assert.match(sidebar, /hidden lg:block/)
assert.match(sidebar, /hidden[^"\n]*lg:flex/)
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

console.log("responsive layout checks passed")
