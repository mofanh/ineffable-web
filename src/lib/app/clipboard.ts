import { i18n } from "@/lib/i18n/i18n"
import { notify } from "@/lib/app/notifications"

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
    await navigator.clipboard.writeText(text)
    notify.success({ title: i18n.t("presentation.copied"), duration: 1600 })
    return true
  } catch {
    notify.error({ title: i18n.t("presentation.copyFailed") })
    return false
  }
}
