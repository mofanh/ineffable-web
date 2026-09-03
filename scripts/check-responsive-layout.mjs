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
const rightSidebarResize = source("src/app/shell/use-right-sidebar-resize.ts")

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
assert.doesNotMatch(
  sidebar,
  /useIsMobile|isMobile|openMobile|setOpenMobile|mobileMode|data-mobile/
)
assert.doesNotMatch(
  sidebar,
  /\b(?:sm|md):(block|flex|peer-data|after|opacity)/,
  "Sidebar interaction styles must not activate below the desktop boundary"
)
assert.match(appShell, /cursor-col-resize[^"\n]*lg:block/)
assert.doesNotMatch(appShell, /cursor-col-resize[^"\n]*md:block/)
assert.match(appShell, /useIsCompactLayout/)
assert.match(appShell, /\[isCompactLayout\]/)
assert.match(appShell, /keyboardShortcut=\{false\}/)
assert.match(sidebar, /if \(!keyboardShortcut\)/)
assert.match(rightSidebarResize, /isCompactLayoutWidth\(window\.innerWidth\)/)
assert.doesNotMatch(rightSidebarResize, /window\.innerWidth\s*<\s*(768|1024)/)

console.log("responsive layout checks passed")
