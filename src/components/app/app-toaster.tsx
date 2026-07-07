import * as React from "react"
import { CheckCircle2Icon, InfoIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react"

import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import {
  APP_NOTIFICATION_EVENT,
  type AppNotification,
  type NotificationTone,
} from "@/lib/app/notifications"

const toneStyles: Record<NotificationTone, string> = {
  success: "border-emerald-500/25",
  error: "border-destructive/30",
  warning: "border-amber-500/30",
  info: "border-sky-500/25",
}

const toneIconStyles: Record<NotificationTone, string> = {
  success: "text-emerald-500",
  error: "text-destructive",
  warning: "text-amber-500",
  info: "text-sky-500",
}

const toneIcons = {
  success: CheckCircle2Icon,
  error: XCircleIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
} satisfies Record<NotificationTone, React.ComponentType<{ className?: string }>>

export function AppToaster() {
  const [notifications, setNotifications] = React.useState<AppNotification[]>([])

  React.useEffect(() => {
    const handleNotification = (event: Event) => {
      const notification = (event as CustomEvent<AppNotification>).detail
      setNotifications((current) => [...current.slice(-3), notification])
    }

    window.addEventListener(APP_NOTIFICATION_EVENT, handleNotification)
    return () => {
      window.removeEventListener(APP_NOTIFICATION_EVENT, handleNotification)
    }
  }, [])

  const removeNotification = React.useCallback((id: string) => {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== id)
    )
  }, [])

  return (
    <ToastProvider swipeDirection="right">
      {notifications.map((notification) => (
        <AppToast
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
        />
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}

function AppToast({
  notification,
  onRemove,
}: {
  notification: AppNotification
  onRemove: (id: string) => void
}) {
  const Icon = toneIcons[notification.tone]
  const [open, setOpen] = React.useState(true)

  return (
    <Toast
      open={open}
      duration={notification.duration ?? 3000}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          onRemove(notification.id)
        }
      }}
      className={cn("border", toneStyles[notification.tone])}
    >
      <div className="flex min-w-0 gap-3">
        <Icon className={cn("mt-0.5 size-4 shrink-0", toneIconStyles[notification.tone])} />
        <div className="min-w-0">
          <ToastTitle>{notification.title}</ToastTitle>
          {notification.description ? (
            <ToastDescription>{notification.description}</ToastDescription>
          ) : null}
        </div>
      </div>
      {notification.action ? (
        <ToastAction
          altText={notification.action.label}
          onClick={() => {
            notification.action?.onClick()
            setOpen(false)
            onRemove(notification.id)
          }}
        >
          {notification.action.label}
        </ToastAction>
      ) : (
        <ToastClose />
      )}
    </Toast>
  )
}
