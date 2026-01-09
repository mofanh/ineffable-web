import { useCallback, useEffect, useRef, useState } from 'react'

export function useChatScrollFollow({
  resetDeps,
  followDeps,
  thresholdPx = 80,
}: {
  /** 当这些依赖变化时，重新计算一次“是否在底部”（例如 session 切换、loading 变化） */
  resetDeps: unknown[]
  /** 当这些依赖变化时，若用户在底部则自动跟随滚动（例如 messages 更新） */
  followDeps: unknown[]
  thresholdPx?: number
}) {
  const scrollContainerRef = useRef<HTMLElement | null>(null)

  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)

  const scrollRafRef = useRef<number | null>(null)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const updateIsAtBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const nextAtBottom = distance <= thresholdPx

    if (nextAtBottom !== isAtBottomRef.current) {
      isAtBottomRef.current = nextAtBottom
      setIsAtBottom(nextAtBottom)
    }
  }, [thresholdPx])

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current)
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      updateIsAtBottom()
    })
  }, [updateIsAtBottom])

  // 主动初始化一次（例如加载历史后 / 首次渲染）
  useEffect(() => {
    updateIsAtBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps)

  // 只有当用户当前就在底部时，才自动跟随滚动
  useEffect(() => {
    if (!isAtBottomRef.current) return
    scrollToBottom('auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, followDeps)

  // 卸载时清理 RAF
  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [])

  const markAtBottomAndScroll = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      isAtBottomRef.current = true
      setIsAtBottom(true)
      scrollToBottom(behavior)
    },
    [scrollToBottom]
  )

  return {
    scrollContainerRef,
    isAtBottom,
    handleScroll,
    scrollToBottom,
    markAtBottomAndScroll,
  }
}
