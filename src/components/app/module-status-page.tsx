import { ArrowRightIcon, CircleDashedIcon } from "lucide-react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { AppPage } from "@/components/app/app-page"
import { Notice } from "@/components/app/notice"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type ModuleStatusLink = {
  label: string
  description: string
  path: string
}

export function ModuleStatusPage({
  title,
  description,
  statusTitle,
  statusDescription,
  links = [],
  notes = [],
}: {
  title: string
  description: string
  statusTitle?: string
  statusDescription: string
  links?: ModuleStatusLink[]
  notes?: string[]
}) {
  const { t } = useTranslation()

  return (
    <AppPage title={title} description={description} className="px-4 py-6 sm:px-6 sm:py-8">
      <Notice title={statusTitle ?? t("common.moduleUnavailable")}>
        {statusDescription}
      </Notice>

      {links.length ? (
        <Card className="border-border/80 bg-muted/25 shadow-none">
          <CardHeader>
            <CardTitle>{t("common.availableCapabilities")}</CardTitle>
            <CardDescription>
              {t("common.availableCapabilitiesDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {links.map((link) => (
              <Button
                key={link.path}
                asChild
                variant="outline"
                className="h-auto justify-between gap-4 px-4 py-3 text-left"
              >
                <Link to={link.path}>
                  <span className="min-w-0">
                    <span className="block font-medium">{link.label}</span>
                    <span className="mt-1 block whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
                      {link.description}
                    </span>
                  </span>
                  <ArrowRightIcon className="shrink-0" />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {notes.length ? (
        <Card className="border-border/80 bg-muted/25 shadow-none">
          <CardHeader>
            <CardTitle>{t("common.capabilityBoundary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
              {notes.map((note) => (
                <li key={note} className="flex gap-2">
                  <CircleDashedIcon className="mt-1.5 size-3 shrink-0" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </AppPage>
  )
}
