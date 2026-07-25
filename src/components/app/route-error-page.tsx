import { TriangleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useRouteError } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  isChunkLoadError,
  reloadAfterRouteError,
} from "@/lib/app/chunk-load-recovery"

export function RouteErrorPage() {
  const { t } = useTranslation()
  const error = useRouteError()
  const chunkLoadFailed = isChunkLoadError(error)

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlertIcon className="size-5" />
        </div>
        <h1 className="text-xl font-semibold">
          {t(
            chunkLoadFailed
              ? "routeError.chunkTitle"
              : "routeError.genericTitle"
          )}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t(
            chunkLoadFailed
              ? "routeError.chunkDescription"
              : "routeError.genericDescription"
          )}
        </p>
        <Button
          type="button"
          className="mt-6"
          onClick={reloadAfterRouteError}
        >
          {t("routeError.reload")}
        </Button>
      </div>
    </main>
  )
}
