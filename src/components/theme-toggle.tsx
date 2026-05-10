"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className="h-8 w-full justify-start">
        <Sun className="mr-2 h-4 w-4" />
        浅色
      </Button>
    )
  }

  const currentTheme = theme || "system"

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start"
        onClick={() => setTheme(currentTheme === "light" ? "dark" : "light")}
      >
        {currentTheme === "light" ? (
          <>
            <Moon className="mr-2 h-4 w-4" />
            深色
          </>
        ) : (
          <>
            <Sun className="mr-2 h-4 w-4" />
            浅色
          </>
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start"
        onClick={() => setTheme("system")}
      >
        <span className="mr-2 text-xs">💻</span>
        跟随系统
      </Button>
    </div>
  )
}
