import { useTranslation } from "react-i18next"
import { StatusBadge } from "@/components/app"
import type { ConnectionDetails } from "./api"

const reasons = ["invalid_message", "reply_expired", "reply_limit_exceeded", "upstream_rejected", "not_started", "outcome_unknown", "lease_lost", "credentials_changed", "unspecified_failure"]
const actions = ["view_conversation", "check_connection", "verify_delivery"]

export function ChannelDeliverySummary({ deliveries }: Pick<ConnectionDetails, "deliveries">) {
  const { t } = useTranslation()
  return <div className="space-y-3">{deliveries.map(delivery => {
    const reason = delivery.error_category && reasons.includes(delivery.error_category) ? delivery.error_category : "unspecified_failure"
    const action = delivery.recovery_action && actions.includes(delivery.recovery_action) ? delivery.recovery_action : "view_conversation"
    return <div key={`${delivery.status}:${delivery.error_category ?? ""}:${delivery.recovery_action ?? ""}:${delivery.retryable}`} className="space-y-1" data-delivery-category={delivery.error_category ?? ""}>
      <StatusBadge status={delivery.status} label={`${t(`channels.delivery.${delivery.status}`)} · ${delivery.count}`} />
      {delivery.error_category ? <>
        <p className="text-sm">{t(`channels.deliveryReason.${reason}`)}</p>
        <p className="text-xs text-muted-foreground">{t(`channels.deliveryRecovery.${action}`)}</p>
      </> : null}
    </div>
  })}</div>
}
