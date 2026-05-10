"use client"

import { cn } from "@/lib/utils"

export const logoVariants = ["a", "b", "c"] as const

export type LogoVariant = (typeof logoVariants)[number]
export type LogoTone = "light" | "dark"
export type LogoLockup = "horizontal" | "symbol"

export interface LogoProps {
  variant?: LogoVariant
  className?: string
  showText?: boolean
  alt?: string
}

function getLogoAssetPath(
  variant: LogoVariant,
  tone: LogoTone,
  lockup: LogoLockup
) {
  const assetName =
    lockup === "horizontal"
      ? `logo-${variant}-horizontal-${tone}.svg`
      : `logo-${variant}-symbol-${tone}.svg`

  return `/brand-assets/logo-${variant}/${assetName}`
}

export function IneffableLogo({
  variant = "a",
  className,
  showText = true,
  alt = "Ineffable logo",
}: LogoProps) {
  const lockup: LogoLockup = showText ? "horizontal" : "symbol"
  const lightSrc = getLogoAssetPath(variant, "light", lockup)
  const darkSrc = getLogoAssetPath(variant, "dark", lockup)

  return (
    <span className={cn("inline-flex h-8 shrink-0 items-center", className)}>
      <img
        src={lightSrc}
        alt={alt}
        className="block h-full w-auto dark:hidden"
        draggable={false}
      />
      <img
        src={darkSrc}
        alt={alt}
        className="hidden h-full w-auto dark:block"
        draggable={false}
      />
    </span>
  )
}
