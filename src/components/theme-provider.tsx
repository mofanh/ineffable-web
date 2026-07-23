"use client"

import * as React from "react"
import {
  ThemeProvider as NextThemesProvider,
  type Attribute,
  useTheme,
} from "next-themes"

const THEME_COLORS = {
  light: "#ffffff",
  dark: "#171717",
} as const

interface ThemeProviderProps {
  children: React.ReactNode
  attribute?: Attribute | Attribute[]
  defaultTheme?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}

function ThemeRuntimeEffects() {
  const { resolvedTheme } = useTheme()

  React.useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") {
      return
    }

    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLORS[resolvedTheme])
  }, [resolvedTheme])

  return null
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <ThemeRuntimeEffects />
      {children}
    </NextThemesProvider>
  )
}
