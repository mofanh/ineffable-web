import * as React from "react"

import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import {
  BASE_CLIENT_TOAST_EVENT,
  refreshExpiredSessionNow,
  type BaseClientToastDetail,
} from "@/lib/api/base-client"

export function BaseClientToaster() {
  const [toast, setToast] = React.useState<BaseClientToastDetail | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<BaseClientToastDetail>).detail
      setToast(detail)
      setIsOpen(true)
    }

    window.addEventListener(BASE_CLIENT_TOAST_EVENT, handleToast)
    return () => {
      window.removeEventListener(BASE_CLIENT_TOAST_EVENT, handleToast)
    }
  }, [])

  return (
    <ToastProvider swipeDirection="right">
      <Toast duration={2000} open={isOpen} onOpenChange={setIsOpen}>
        <div className="min-w-0">
          <ToastTitle>{toast?.title}</ToastTitle>
          <ToastDescription>{toast?.description}</ToastDescription>
        </div>
        {toast?.actionLabel ? (
          <ToastAction
            altText={toast.actionLabel}
            onClick={refreshExpiredSessionNow}
          >
            {toast.actionLabel}
          </ToastAction>
        ) : null}
      </Toast>
      <ToastViewport />
    </ToastProvider>
  )
}
