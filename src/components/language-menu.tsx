import * as React from "react"
import { ChevronDown, LanguagesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { normalizeLanguage } from "@/lib/i18n/i18n"

export function LanguageMenu({ mobile = false }: { mobile?: boolean }) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = React.useState(false)
  const language = normalizeLanguage(i18n.resolvedLanguage || i18n.language)
  const languageLabel =
    language === "zh-CN"
      ? t("language.shortChinese")
      : t("language.shortEnglish")

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
          <LanguagesIcon />
          <span>{t("language.label")}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {languageLabel}
          </span>
          <ChevronDown
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </DropdownMenuItem>
        {expanded ? (
          <DropdownMenuRadioGroup
            value={language}
            onValueChange={(value) => void i18n.changeLanguage(value)}
            className="ml-4 border-l border-border pl-1"
          >
            <DropdownMenuRadioItem value="zh-CN" className="h-11">
              {t("language.chinese")}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="en-US" className="h-11">
              {t("language.english")}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        ) : null}
      </>
    )
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="h-8">
        <LanguagesIcon />
        <span>{t("language.label")}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {languageLabel}
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
