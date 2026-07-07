import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function AsyncButton({
  isLoading,
  loadingLabel,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & {
  isLoading?: boolean
  loadingLabel?: React.ReactNode
}) {
  return (
    <Button disabled={disabled || isLoading} {...props}>
      {isLoading ? <Loader2Icon className="animate-spin" /> : null}
      {isLoading ? (loadingLabel ?? children) : children}
    </Button>
  )
}
