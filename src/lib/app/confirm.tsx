import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
}

type ConfirmRequest = ConfirmOptions & {
  resolve: (confirmed: boolean) => void
}

let activeConfirm: ((request: ConfirmRequest) => void) | null = null

export function confirm(options: ConfirmOptions) {
  if (!activeConfirm) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    activeConfirm?.({ ...options, resolve })
  })
}

export function AppConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null)

  React.useEffect(() => {
    activeConfirm = setRequest
    return () => {
      if (activeConfirm === setRequest) {
        activeConfirm = null
      }
    }
  }, [])

  const close = React.useCallback(
    (confirmed: boolean) => {
      request?.resolve(confirmed)
      setRequest(null)
    },
    [request]
  )

  return (
    <>
      {children}
      <AlertDialog
        open={Boolean(request)}
        onOpenChange={(open) => {
          if (!open) close(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{request?.title}</AlertDialogTitle>
            {request?.description ? (
              <AlertDialogDescription>
                {request.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>
              {request?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={request?.variant ?? "default"}
              onClick={() => close(true)}
            >
              {request?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
