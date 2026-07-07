export const APP_NOTIFICATION_EVENT = "ineffable:app-notification"

export type NotificationTone = "success" | "error" | "warning" | "info"

export type NotificationAction = {
  label: string
  onClick: () => void
}

export type AppNotification = {
  id: string
  tone: NotificationTone
  title: string
  description?: string
  duration?: number
  action?: NotificationAction
}

export type AppNotificationInput = {
  title: string
  description?: string
  duration?: number
  action?: NotificationAction
}

function createNotification(
  tone: NotificationTone,
  input: AppNotificationInput
): AppNotification {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return {
    id,
    tone,
    title: input.title,
    description: input.description,
    duration: input.duration,
    action: input.action,
  }
}

function dispatchNotification(notification: AppNotification) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent<AppNotification>(APP_NOTIFICATION_EVENT, {
      detail: notification,
    })
  )
}

function show(tone: NotificationTone, input: AppNotificationInput) {
  const notification = createNotification(tone, input)
  dispatchNotification(notification)
  return notification.id
}

export const notify = {
  success(input: AppNotificationInput) {
    return show("success", input)
  },
  error(input: AppNotificationInput) {
    return show("error", input)
  },
  warning(input: AppNotificationInput) {
    return show("warning", input)
  },
  info(input: AppNotificationInput) {
    return show("info", input)
  },
}
