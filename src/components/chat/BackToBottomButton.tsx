import { ChevronDown } from 'lucide-react'

export default function BackToBottomButton({
  onClick,
}: {
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 size-9 rounded-full border border-border/60 bg-background shadow-sm hover:bg-muted transition-colors flex items-center justify-center"
      title="回到底部"
    >
      <ChevronDown className="size-4 text-muted-foreground" />
    </button>
  )
}
