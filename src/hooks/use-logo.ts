"use client"

import { useEffect, useState } from "react"
import { logoVariants, type LogoVariant } from "@/components/ineffable-logo"

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

  localStorage.setItem(storageKey, String((safeIndex + 1) % logoVariants.length))

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

export function useLogoVariant(options: UseLogoVariantOptions = {}): LogoVariant {
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
        : getRotatedVariant(storageKey)
    )
  }, [fixedVariant, mode, storageKey])

  return variant
}

export function getLogoName(variant: LogoVariant): string {
  const names: Record<LogoVariant, string> = {
    a: "道·路径",
    b: "道·交汇",
    c: "道·周行",
  }
  return names[variant]
}

export function getLogoDescription(variant: LogoVariant): string {
  const descriptions: Record<LogoVariant, string> = {
    a: "一画开天，从无到有。起点即终点，路径即意义。",
    b: "万物生于有，有生于无。交汇即智慧，连接即意义。",
    c: "独立而不改，周行而不殆。圆环无缺，智慧自洽。",
  }
  return descriptions[variant]
}
