"use client"

import { useEffect, useState } from "react"
import { logoVariants, type LogoVariant } from "@/components/ineffable-logo"
import { i18n } from "@/lib/i18n/i18n"

export type LogoSelectionMode = "fixed" | "random" | "rotate"

type UseLogoVariantOptions = {
  mode?: LogoSelectionMode
  fixedVariant?: LogoVariant
  storageKey?: string
}

const defaultStorageKey = "ineffable.logo.selection"

function getRandomVariant() {
  return logoVariants[Math.floor(Math.random() * logoVariants.length)]
}

function getRotatedVariant(storageKey: string) {
  const rawIndex = Number.parseInt(localStorage.getItem(storageKey) ?? "0", 10)
  const safeIndex = Number.isFinite(rawIndex) ? rawIndex : 0
  const variant = logoVariants[safeIndex % logoVariants.length]

  localStorage.setItem(
    storageKey,
    String((safeIndex + 1) % logoVariants.length),
  )

  return variant
}

function getSessionRandomVariant(storageKey: string) {
  const sessionKey = `${storageKey}.session`
  const storedVariant = sessionStorage.getItem(sessionKey)

  if (storedVariant && logoVariants.includes(storedVariant as LogoVariant)) {
    return storedVariant as LogoVariant
  }

  const variant = getRandomVariant()
  sessionStorage.setItem(sessionKey, variant)
  return variant
}

export function useLogoVariant(
  options: UseLogoVariantOptions = {},
): LogoVariant {
  const {
    mode = "rotate",
    fixedVariant = "a",
    storageKey = defaultStorageKey,
  } = options

  const [variant, setVariant] = useState<LogoVariant>(fixedVariant)

  useEffect(() => {
    if (mode === "fixed") {
      setVariant(fixedVariant)
      return
    }

    if (typeof window === "undefined") {
      return
    }

    setVariant(
      mode === "random"
        ? getSessionRandomVariant(storageKey)
        : getRotatedVariant(storageKey),
    )
  }, [fixedVariant, mode, storageKey])

  return variant
}

export function getLogoName(variant: LogoVariant): string {
  return i18n.t(`common.logo.${variant}`)
}
