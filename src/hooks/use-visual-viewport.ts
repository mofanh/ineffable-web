import * as React from "react"

type VisualViewportMetrics = {
  height: number
  offsetTop: number
}

function readVisualViewport(): VisualViewportMetrics {
  const viewport = window.visualViewport
  return {
    height: Math.round(viewport?.height ?? window.innerHeight),
    offsetTop: Math.round(viewport?.offsetTop ?? 0),
  }
}

export function useVisualViewport(enabled = true) {
  const [metrics, setMetrics] = React.useState<VisualViewportMetrics | null>(null)

  React.useEffect(() => {
    if (!enabled) {
      return
    }

    const viewport = window.visualViewport
    let frameId: number | null = null

    function updateMetrics() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      frameId = window.requestAnimationFrame(() => {
        const next = readVisualViewport()
        setMetrics((current) =>
          current &&
          current.height === next.height &&
          current.offsetTop === next.offsetTop
            ? current
            : next
        )
        frameId = null
      })
    }

    updateMetrics()
    window.addEventListener("resize", updateMetrics)
    viewport?.addEventListener("resize", updateMetrics)
    viewport?.addEventListener("scroll", updateMetrics)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener("resize", updateMetrics)
      viewport?.removeEventListener("resize", updateMetrics)
      viewport?.removeEventListener("scroll", updateMetrics)
    }
  }, [enabled])

  return metrics
}
