import {
  AppMetricPage,
  AppSearchBar,
  AppSectionCard,
  EmptyState,
  ErrorState,
  StatusBadge,
} from "@/components/app"

export {
  AppMetricPage,
  AppSearchBar,
  AppSectionCard,
  EmptyState,
  StatusBadge,
}

export function ErrorNotice({ message }: { message: string | null }) {
  return <ErrorState error={message} title="操作失败" />
}
