// Adapted from DeepSeek Harness 0.2.2-rc.5, ui-layout/src/client/columns.ts.
// Upstream SHA 2e39e70496aa02986ca6a820c5d497e816b69d7e, Copyright 2026 DeepSeek.
// MIT: public/third-party-notices.txt. Adds explicit drawer/focus presentation.
export const CENTER_MIN = 400
export const SIDEBAR_MIN = 264
export const SIDEBAR_MAX = 420
export const SIDEBAR_DEFAULT = 280
export const SIDEBAR_RAIL = 56
export const DRAWER_BREAKPOINT = 768
export const AUTO_RAIL_BREAKPOINT = 1024
export const RIGHT_MIN = 300
export const RIGHT_MAX_RATIO = 0.7
export const RIGHT_DEFAULT_RATIO = 0.45

export function clampWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function computeWorkbenchColumns(viewport: number, expanded: boolean, sidebarPreference: number, rightPreference: number | null, resourceOpen: boolean) {
  const drawer = viewport < DRAWER_BREAKPOINT
  // A requested contextual panel wins over an expanded medium-width navigation.
  const autoRail = viewport < AUTO_RAIL_BREAKPOINT && resourceOpen
  const sidebar = drawer ? 0 : expanded && !autoRail ? Math.min(viewport - CENTER_MIN, clampWidth(sidebarPreference, SIDEBAR_MIN, SIDEBAR_MAX)) : SIDEBAR_RAIL
  const available = viewport - sidebar - CENTER_MIN
  const right = !resourceOpen || drawer || available < RIGHT_MIN ? 0
    : Math.min(available, clampWidth(rightPreference ?? viewport * RIGHT_DEFAULT_RATIO, RIGHT_MIN, viewport * RIGHT_MAX_RATIO))
  return { drawer, sidebar, right, center: Math.max(0, viewport - sidebar - right) }
}
