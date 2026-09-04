import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  CheckIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  SearchIcon,
} from "lucide-react"

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
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const optionRefs = React.useRef(new Map<string, HTMLButtonElement>())
  const listboxId = React.useId()
  const selectedOption = options.find((option) => option.value === value)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        `${option.label} ${option.searchText ?? ""}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : options

  const showSearch = Boolean(searchPlaceholder && options.length >= 5)

  function setOptionRef(optionValue: string, element: HTMLButtonElement | null) {
    if (element) optionRefs.current.set(optionValue, element)
    else optionRefs.current.delete(optionValue)
  }

  function focusOption(index: number) {
    const option = filteredOptions[index]
    if (option) optionRefs.current.get(option.value)?.focus()
  }

  function handleOptionKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      focusOption(Math.min(index + 1, filteredOptions.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      if (index === 0 && showSearch) searchInputRef.current?.focus()
      else focusOption(Math.max(index - 1, 0))
    } else if (event.key === "Home") {
      event.preventDefault()
      focusOption(0)
    } else if (event.key === "End") {
      event.preventDefault()
      focusOption(filteredOptions.length - 1)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(open) => {
        if (!open) setQuery("")
        setOpen(open)
        onOpenChange?.(open)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 w-full min-w-0 justify-start gap-1 rounded-full px-2 text-xs font-normal text-muted-foreground",
            className
          )}
          title={selectedOption?.label ?? placeholder}
          aria-busy={loading}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
        >
          {icon}
          <span className="sr-only">{label}: </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedOption?.label ?? placeholder}
          </span>
          {loading ? (
            <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
          ) : (
            <ChevronDownIcon className="size-3 shrink-0 opacity-65" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-72 max-w-[calc(100vw-2rem)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          requestAnimationFrame(() => {
            if (showSearch) searchInputRef.current?.focus()
            else
              optionRefs.current
                .get(selectedOption?.value ?? filteredOptions[0]?.value ?? "")
                ?.focus()
          })
        }}
      >
        <div className="px-2 py-1.5 text-xs font-medium text-foreground">
          {label}
        </div>
        {showSearch ? (
          <>
            <div className="px-2 pb-1.5 pt-1">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault()
                      focusOption(0)
                    }
                  }}
                  aria-label={searchPlaceholder}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls={listboxId}
                  aria-expanded={open}
                  placeholder={searchPlaceholder}
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>
            <div className="bg-border -mx-1 my-1 h-px" />
          </>
        ) : (
          <div className="bg-border -mx-1 my-1 h-px" />
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
        <div id={listboxId} role="listbox" aria-label={label}>
          {filteredOptions.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => setOptionRef(option.value, element)}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-start gap-1.5 rounded-md px-2 py-2 pr-8 text-left outline-none select-none"
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              onClick={() => {
                onValueChange(option.value)
                setOpen(false)
              }}
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
              {option.value === value ? (
                <CheckIcon className="absolute right-2 top-2.5 size-4" />
              ) : null}
            </button>
          ))}
        </div>
        {filteredOptions.length === 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="px-2 py-3 text-xs text-muted-foreground"
          >
            {emptyLabel}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
