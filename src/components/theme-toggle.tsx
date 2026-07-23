"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { t } = useTranslation()
  const { setTheme, theme } = useTheme()

  return (
    <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
      <DropdownMenuRadioItem value="light">
        <Sun />
        {t("theme.light")}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon />
        {t("theme.dark")}
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system">
        <Monitor />
        {t("theme.system")}
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  )
}
