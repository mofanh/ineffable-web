import * as React from "react"
import { useTranslation } from "react-i18next"
import { LoaderCircleIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { capabilityCatalogFamilies, capabilityKeysEqual, filterCapabilityCatalog, groupCapabilityCatalog, updateSelectedCapabilityKeys } from "@/features/chat/model/capability-catalog-selection"
import type { CapabilityExposureMode, CapabilityExposurePolicy, CapabilityExposureSelection, CapabilityCatalogEntry } from "@/lib/api/api-client"

type Props = {
  capabilityExposureSelection: CapabilityExposureSelection | null
  capabilityExposurePolicy: CapabilityExposurePolicy | null
  capabilityExposureDraftStatus: "idle" | "loading" | "ready" | "error"
  capabilityCatalog: CapabilityCatalogEntry[]
  capabilityCatalogStatus: "idle" | "loading" | "ready" | "error"
  onCapabilityCatalogRefresh: () => void
  onCapabilityExposureChange: (selection: CapabilityExposureSelection) => void
  onCapabilityExposureDraftRefresh: () => void
}

export function CapabilityExposurePicker({capabilityExposureSelection, capabilityExposurePolicy, capabilityExposureDraftStatus, capabilityCatalog, capabilityCatalogStatus, onCapabilityCatalogRefresh, onCapabilityExposureChange, onCapabilityExposureDraftRefresh}: Props) {
  const { t } = useTranslation()
  const [capabilitySearch, setCapabilitySearch] = React.useState("")
  const allowedCapabilityModes = capabilityExposurePolicy?.allowed_modes ?? []
  const selectableCapabilityFamilies = React.useMemo(
    () => capabilityCatalogFamilies(capabilityCatalog),
    [capabilityCatalog]
  )
  const filteredCapabilityCatalog = React.useMemo(
    () => filterCapabilityCatalog(capabilityCatalog, capabilitySearch),
    [capabilityCatalog, capabilitySearch]
  )
  const groupedCapabilityCatalog = React.useMemo(
    () => groupCapabilityCatalog(filteredCapabilityCatalog),
    [filteredCapabilityCatalog]
  )
  const customSelectionCount = capabilityExposureSelection?.custom
    ? capabilityExposureSelection.custom.families.length +
      capabilityExposureSelection.custom.capabilities.length
    : 0

  function selectCapabilityMode(mode: CapabilityExposureMode) {
    onCapabilityExposureChange({
      mode,
      custom:
        mode === "custom"
          ? capabilityExposureSelection?.custom ?? {
              families: [],
              capabilities: [],
              discovery_scope: { kind: "all_authorized" },
            }
          : undefined,
    })
  }

  function toggleCapabilityFamily(family: string, checked: boolean) {
    const current = capabilityExposureSelection?.custom ?? {
      families: [],
      capabilities: [],
      discovery_scope: { kind: "all_authorized" } as const,
    }
    const families = checked
      ? Array.from(new Set([...current.families, family])).sort()
      : current.families.filter((item) => item !== family)
    onCapabilityExposureChange({
      mode: "custom",
      custom: {
        ...current,
        families,
        discovery_scope: families.length
          ? { kind: "families", families }
          : { kind: "all_authorized" },
      },
    })
  }

  function toggleCapability(entry: CapabilityCatalogEntry, checked: boolean) {
    const current = capabilityExposureSelection?.custom ?? {
      families: [],
      capabilities: [],
      discovery_scope: { kind: "all_authorized" } as const,
    }
    const capabilities = updateSelectedCapabilityKeys(
      current.capabilities,
      entry,
      checked
    )
    onCapabilityExposureChange({
      mode: "custom",
      custom: { ...current, capabilities },
    })
  }

  return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 min-w-0 max-w-28 shrink gap-1 rounded-full px-2 text-xs font-normal text-muted-foreground"
                    title={
                      capabilityExposureDraftStatus === "error"
                        ? t("chat.composer.capabilityLoadFailed")
                        : t("chat.composer.capabilityModeHint")
                    }
                    disabled={
                      capabilityExposureDraftStatus !== "error" &&
                      (!capabilityExposureSelection || !capabilityExposurePolicy)
                    }
                    onClick={(event) => {
                      if (capabilityExposureDraftStatus === "error") {
                        event.preventDefault()
                        onCapabilityExposureDraftRefresh()
                      }
                    }}
                  >
                    <SparklesIcon className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {capabilityExposureDraftStatus === "error"
                        ? t("chat.composer.capabilityRetry")
                        : capabilityExposureSelection
                        ? `${t(
                            `chat.composer.capabilityMode.${capabilityExposureSelection.mode}`
                          )}${capabilityExposureSelection.mode === "custom" && customSelectionCount > 0 ? ` · ${customSelectionCount}` : ""}`
                        : "—"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-80">
                  <DropdownMenuLabel>
                    {t("chat.composer.capabilityModeLabel")}
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={capabilityExposureSelection?.mode ?? ""}
                    onValueChange={(value) =>
                      selectCapabilityMode(value as CapabilityExposureMode)
                    }
                  >
                    {allowedCapabilityModes.map((mode) => (
                      <DropdownMenuRadioItem key={mode} value={mode}>
                        <span>
                          {t(`chat.composer.capabilityMode.${mode}`)}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {capabilityExposureSelection?.mode === "custom" ? (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5">
                        <div className="relative">
                          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={capabilitySearch}
                            onChange={(event) => setCapabilitySearch(event.target.value)}
                            onKeyDown={(event) => event.stopPropagation()}
                            aria-label={t("chat.composer.capabilitySearch")}
                            placeholder={t("chat.composer.capabilitySearch")}
                            className="h-8 pl-7 text-xs"
                          />
                        </div>
                      </div>
                      <DropdownMenuLabel>
                        {t("chat.composer.capabilityFamilies")}
                      </DropdownMenuLabel>
                      {selectableCapabilityFamilies.map((family) => (
                        <DropdownMenuCheckboxItem
                          key={family}
                          checked={
                            capabilityExposureSelection.custom?.families.includes(
                              family
                            ) ?? false
                          }
                          onCheckedChange={(checked) =>
                            toggleCapabilityFamily(family, checked === true)
                          }
                          onSelect={(event) => event.preventDefault()}
                        >
                          <span className="truncate">{family}</span>
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>
                        {t("chat.composer.capabilities")}
                      </DropdownMenuLabel>
                      <div className="max-h-56 overflow-y-auto overscroll-contain">
                        {capabilityCatalogStatus === "loading" ? (
                          <div
                            role="status"
                            aria-live="polite"
                            className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"
                          >
                            <LoaderCircleIcon className="size-3.5 animate-spin" />
                            {t("chat.composer.capabilityLoading")}
                          </div>
                        ) : null}
                        {capabilityCatalogStatus === "error" ? (
                          <div
                            role="alert"
                            className="flex items-center justify-between gap-2 px-2 py-2 text-xs text-destructive"
                          >
                            <span>{t("chat.composer.capabilityLoadFailed")}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={(event) => {
                                event.preventDefault()
                                onCapabilityCatalogRefresh()
                              }}
                            >
                              {t("common.retry")}
                            </Button>
                          </div>
                        ) : null}
                        {capabilityCatalogStatus === "ready" &&
                        filteredCapabilityCatalog.length === 0 ? (
                          <div
                            role="status"
                            aria-live="polite"
                            className="px-2 py-3 text-xs text-muted-foreground"
                          >
                            {t("chat.composer.capabilityEmpty")}
                          </div>
                        ) : null}
                        {groupedCapabilityCatalog.map((group) => (
                          <div key={group.family}>
                            <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {group.family}
                            </div>
                            {group.items.map((entry) => (
                              <DropdownMenuCheckboxItem
                                key={`${entry.key.provider_id}:${entry.key.capability_id}`}
                                checked={
                                  capabilityExposureSelection.custom?.capabilities.some(
                                    (candidate) => capabilityKeysEqual(candidate, entry.key)
                                  ) ?? false
                                }
                                onCheckedChange={(checked) =>
                                  toggleCapability(entry, checked === true)
                                }
                                onSelect={(event) => event.preventDefault()}
                                className="items-start"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium">
                                    {entry.name}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {entry.provider_name}
                                  </span>
                                </span>
                              </DropdownMenuCheckboxItem>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {capabilityExposurePolicy &&
                  (capabilityExposureSelection?.mode === "smart" ||
                    capabilityExposureSelection?.mode === "clean") ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="font-normal">
                        {t("chat.composer.capabilityBudget", {
                          count:
                            capabilityExposurePolicy.exposure_budget.max_count,
                        })}
                      </DropdownMenuLabel>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
  )
}
