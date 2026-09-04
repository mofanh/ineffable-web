import * as React from "react";
import { CheckIcon, LoaderCircleIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminCapabilityFamilyCatalogEntry } from "@/lib/api/api-client";
import type { ApiResourceState } from "@/lib/app/use-api-resource";

import {
  filterCapabilityFamilies,
  selectEveryCurrentCapabilityFamily,
  toggleAllowedCapabilityFamily,
  unavailableSelectedCapabilityFamilies,
} from "./capability-family-selection";

export function CapabilityFamilySelector({
  entries,
  selected,
  state,
  error,
  onChange,
  onRetry,
}: {
  entries: AdminCapabilityFamilyCatalogEntry[];
  selected: string[];
  state: ApiResourceState;
  error: string;
  onChange: (families: string[]) => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = React.useState("");
  const visibleEntries = React.useMemo(
    () => filterCapabilityFamilies(entries, query),
    [entries, query],
  );
  const unavailableSelected = React.useMemo(
    () =>
      state === "success" || state === "refreshing"
        ? unavailableSelectedCapabilityFamilies(selected, entries)
        : [],
    [entries, selected, state],
  );
  const unrestricted = selected.length === 0;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {unrestricted
            ? t("system.plans.form.capabilityFamiliesAllDescription")
            : t("system.plans.form.capabilityFamiliesSelected", {
                count: selected.length,
              })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={entries.length === 0}
          onClick={() =>
            onChange(
              selectEveryCurrentCapabilityFamily(entries, unavailableSelected),
            )
          }
        >
          {t("system.plans.form.capabilityFamiliesSelectCurrent")}
        </Button>
      </div>

      <button
        type="button"
        role="checkbox"
        aria-checked={unrestricted}
        className="flex w-full items-start gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors hover:border-foreground/30"
        onClick={() => onChange([])}
      >
        <SelectionIndicator checked={unrestricted} />
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {t("system.plans.form.capabilityFamiliesAll")}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("system.plans.form.capabilityFamiliesAllDescription")}
          </span>
        </span>
      </button>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          className="pl-9"
          aria-label={t("system.plans.form.capabilityFamiliesSearch")}
          placeholder={t("system.plans.form.capabilityFamiliesSearch")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {state === "loading" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
        >
          <LoaderCircleIcon className="size-4 animate-spin" />
          {t("system.plans.form.capabilityFamiliesLoading")}
        </div>
      ) : null}
      {state === "error" ? (
        <div role="alert" className="rounded-md border border-destructive/30 p-3">
          <p className="text-sm text-destructive">
            {error || t("system.plans.form.capabilityFamiliesLoadFailed")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={onRetry}
          >
            {t("system.plans.form.capabilityFamiliesRetry")}
          </Button>
        </div>
      ) : null}
      {state === "refreshing" ? (
        <div role="status" aria-live="polite" className="sr-only">
          {t("system.plans.form.capabilityFamiliesLoading")}
        </div>
      ) : null}

      {state !== "loading" && state !== "error" ? (
        visibleEntries.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleEntries.map((entry) => {
              const checked = selected.includes(entry.family);
              return (
                <button
                  key={entry.family}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-3 text-left transition-colors hover:border-foreground/30"
                  onClick={() =>
                    onChange(
                      toggleAllowedCapabilityFamily(
                        unrestricted ? [] : selected,
                        entry.family,
                        !checked,
                      ),
                    )
                  }
                >
                  <SelectionIndicator checked={checked} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {entry.display_name}
                    </span>
                    <span className="block break-all text-[11px] text-muted-foreground">
                      {entry.family}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {entry.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div role="status" className="py-5 text-sm text-muted-foreground">
            {t("system.plans.form.capabilityFamiliesEmpty")}
          </div>
        )
      ) : null}

      {unavailableSelected.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-3">
          <div>
            <div className="text-sm font-medium">
              {t("system.plans.form.capabilityFamiliesUnavailable")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "system.plans.form.capabilityFamiliesUnavailableDescription",
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {unavailableSelected.map((family) => (
              <button
                key={family}
                type="button"
                role="checkbox"
                aria-checked="true"
                className="inline-flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-2.5 py-2 text-left text-xs"
                onClick={() =>
                  onChange(
                    toggleAllowedCapabilityFamily(selected, family, false),
                  )
                }
              >
                <SelectionIndicator checked />
                <span>{family}</span>
                <span className="text-muted-foreground">
                  {t("system.plans.form.capabilityFamilyUnavailable")}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SelectionIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background"
      }`}
    >
      {checked ? <CheckIcon className="size-3" /> : null}
    </span>
  );
}
