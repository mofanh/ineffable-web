import * as React from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {title || description ? (
        <div className="space-y-1">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function FormField({
  label,
  description,
  error,
  children,
  className,
}: {
  label: string
  description?: string
  error?: string | null
  children: React.ReactNode
  className?: string
}) {
  return (
    <Field className={className} data-invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}

export function ToggleField({
  label,
  checked,
  disabled,
  onCheckedChange,
  className,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <label
      className={cn(
        "flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
        className
      )}
    >
      <span className={disabled ? "text-muted-foreground" : undefined}>
        {label}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </label>
  )
}
