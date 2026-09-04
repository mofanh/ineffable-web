import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AppDialogMaxWidth = "lg" | "xl" | "2xl" | "3xl" | "6xl"

export function AppDialog({
  open,
  title,
  description,
  children,
  maxWidth = "xl",
  onOpenChange,
}: {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  maxWidth?: AppDialogMaxWidth
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 bg-background fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-border p-0 shadow-lg duration-100 outline-none",
            maxWidth === "lg" && "max-w-lg",
            maxWidth === "xl" && "max-w-xl",
            maxWidth === "2xl" && "max-w-2xl",
            maxWidth === "3xl" && "max-w-3xl",
            maxWidth === "6xl" && "max-w-6xl"
          )}
        >
          <div className="border-border border-b px-5 py-4 pr-12">
            <DialogPrimitive.Title className="text-base font-medium">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <div className="min-h-0 overscroll-contain overflow-y-auto p-5">
            {children}
          </div>
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4"
            >
              <XIcon className="size-4" />
              <span className="sr-only">{t("common.close")}</span>
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function AppDialogFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "bg-background/95 border-border sticky bottom-0 z-10 -mx-5 -mb-5 flex justify-end gap-2 border-t px-5 py-4 backdrop-blur-sm",
        className
      )}
    >
      {children}
    </div>
  )
}
