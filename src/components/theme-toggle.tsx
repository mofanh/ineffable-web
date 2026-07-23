"use client"

import * as React from "react"
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle({ mobile = false }: { mobile?: boolean }) {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [expanded, setExpanded] = React.useState(false)
  const selectedTheme = theme ?? "system"
  const SelectedThemeIcon = resolvedTheme === "dark" ? Moon : Sun

  if (mobile) {
    return (
      <>
        <DropdownMenuItem
          className="h-11"
          aria-expanded={expanded}
          onSelect={(event) => {
            event.preventDefault()
            setExpanded((current) => !current)
          }}
        >
          <SelectedThemeIcon />
          <span>{t("theme.appearance")}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {t(`theme.${selectedTheme}`)}
          </span>
          <ChevronDown
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </DropdownMenuItem>
        {expanded ? (
          <DropdownMenuRadioGroup
            value={selectedTheme}
            onValueChange={setTheme}
            className="ml-4 border-l border-border pl-1"
          >
            <DropdownMenuRadioItem value="light" className="h-11">
              <Sun />
              {t("theme.light")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" className="h-11">
              <Moon />
              {t("theme.dark")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system" className="h-11">
              <Monitor />
              {t("theme.system")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        ) : null}
      </>
    )
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="h-8">
        <SelectedThemeIcon />
        <span>{t("theme.appearance")}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {t(`theme.${selectedTheme}`)}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-36">
        <DropdownMenuRadioGroup value={selectedTheme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light" className="h-8">
            <Sun />
            {t("theme.light")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="h-8">
            <Moon />
            {t("theme.dark")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="h-8">
            <Monitor />
            {t("theme.system")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
