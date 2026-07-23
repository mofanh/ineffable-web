"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const selectedTheme = theme ?? "system"
  const SelectedThemeIcon = resolvedTheme === "dark" ? Moon : Sun

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
