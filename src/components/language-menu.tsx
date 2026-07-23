import { LanguagesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { normalizeLanguage } from "@/lib/i18n/i18n"

export function LanguageMenu() {
  const { t, i18n } = useTranslation()
  const language = normalizeLanguage(i18n.resolvedLanguage || i18n.language)

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="h-8">
        <LanguagesIcon />
        <span>{t("language.label")}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {language === "zh-CN"
            ? t("language.shortChinese")
            : t("language.shortEnglish")}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-32">
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => void i18n.changeLanguage(value)}
        >
          <DropdownMenuRadioItem value="zh-CN" className="h-8">
            {t("language.chinese")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US" className="h-8">
            {t("language.english")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
