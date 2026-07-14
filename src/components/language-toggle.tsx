import { LanguagesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { normalizeLanguage } from "@/lib/i18n/i18n"
import { cn } from "@/lib/utils"

export function LanguageToggle({ layout = "compact" }: { layout?: "compact" | "menu" }) {
  const { t, i18n } = useTranslation()
  const language = normalizeLanguage(i18n.resolvedLanguage || i18n.language)
  const nextLanguage = language === "zh-CN" ? "en-US" : "zh-CN"

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(layout === "menu" && "h-8 w-full justify-start")}
      onClick={() => void i18n.changeLanguage(nextLanguage)}
      aria-label={t("language.switchTo")}
      title={t("language.switchTo")}
    >
      <LanguagesIcon />
      {language === "zh-CN"
        ? t("language.shortEnglish")
        : t("language.shortChinese")}
    </Button>
  )
}
