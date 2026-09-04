import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ChevronDownIcon, LoaderCircleIcon, SearchIcon } from "lucide-react"

export type ComposerSingleSelectOption = {
  value: string
  label: string
  searchText?: string
  supportingContent?: React.ReactNode
}

type ComposerSingleSelectProps = {
  value: string
  options: ComposerSingleSelectOption[]
  icon: React.ReactNode
  label: string
  placeholder: string
  emptyLabel: string
  searchPlaceholder?: string
  loading?: boolean
  loadingLabel?: string
  className?: string
  onOpenChange?: (open: boolean) => void
  onValueChange: (value: string) => void
}

export function ComposerSingleSelect({
  value,
  options,
  icon,
  label,
  placeholder,
  emptyLabel,
  searchPlaceholder,
  loading = false,
  loadingLabel,
  className,
  onOpenChange,
  onValueChange,
}: ComposerSingleSelectProps) {
  const [query, setQuery] = React.useState("")
  const selectedOption = options.find((option) => option.value === value)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        `${option.label} ${option.searchText ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : options

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setQuery("")
        onOpenChange?.(open)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 w-full min-w-0 justify-start gap-1 rounded-full px-2 text-xs font-normal text-muted-foreground",
            className
          )}
          title={selectedOption?.label ?? placeholder}
          aria-label={label}
          aria-busy={loading}
        >
          {icon}
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedOption?.label ?? placeholder}
          </span>
          {loading ? (
            <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
          ) : (
            <ChevronDownIcon className="size-3 shrink-0 opacity-65" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-foreground">
          {label}
        </DropdownMenuLabel>
        {searchPlaceholder && options.length >= 6 ? (
          <>
            <div className="px-2 pb-1.5 pt-1">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        ) : (
          <DropdownMenuSeparator />
        )}
        {loading && loadingLabel ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"
          >
            <LoaderCircleIcon className="size-3.5 animate-spin" />
            <span>{loadingLabel}</span>
          </div>
        ) : null}
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {filteredOptions.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="items-start px-2 py-2 pr-8"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {option.label}
                </span>
                {option.supportingContent ? (
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    {option.supportingContent}
                  </span>
                ) : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {filteredOptions.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="px-2 py-3 text-xs text-muted-foreground"
          >
            {emptyLabel}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
