import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { resources, type AppLanguage } from "@/lib/i18n/resources"

const LANGUAGE_STORAGE_KEY = "ineffable.ui.language"
const DEFAULT_LANGUAGE: AppLanguage = "zh-CN"

function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value?.toLowerCase().startsWith("en") ? "en-US" : DEFAULT_LANGUAGE
}

function getCurrentLocale(): AppLanguage {
  return normalizeLanguage(i18n.resolvedLanguage || i18n.language)
}

function getInitialLanguage() {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE
  }

  return normalizeLanguage(
    window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ||
      window.navigator.language,
  )
}

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: Object.keys(resources),
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

function applyLanguage(language: string) {
  const normalized = normalizeLanguage(language)
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalized
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized)
  }
}

applyLanguage(i18n.resolvedLanguage || i18n.language)
i18n.on("languageChanged", applyLanguage)

export { getCurrentLocale, i18n, normalizeLanguage }
export type { AppLanguage }
