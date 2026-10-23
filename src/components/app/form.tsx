import * as React from "react"
import { Slot } from "radix-ui"

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

type FieldIdentity = { id: string; labelId: string; describedBy?: string; invalid: boolean }
const FieldIdentityContext = React.createContext<FieldIdentity | null>(null)

/** Attach a field to its actual input or composite trigger, never to a root wrapper. */
export function FormControl({ children, ...props }: React.ComponentProps<typeof Slot.Root>) {
  const field = React.useContext(FieldIdentityContext)
  if (!field || !React.isValidElement<React.HTMLAttributes<HTMLElement>>(children)) return <Slot.Root {...props}>{children}</Slot.Root>
  const describedBy = [children.props["aria-describedby"], props["aria-describedby"], field.describedBy].filter(Boolean).join(" ") || undefined
  const labelledBy = children.props["aria-labelledby"] ?? props["aria-labelledby"] ?? (children.props["aria-label"] || props["aria-label"] ? undefined : field.labelId)
  return <Slot.Root {...props} id={field.id} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={field.invalid || undefined}>
    {React.cloneElement(children, { "aria-describedby": describedBy, "aria-invalid": field.invalid || children.props["aria-invalid"] })}
  </Slot.Root>
}

export function FormField({ label, htmlFor, description, error, children, className, group = false }: {
  label: string
  htmlFor?: string
  description?: string
  error?: string | null
  children: React.ReactNode
  className?: string
  group?: boolean
}) {
  const generatedId = React.useId()
  const id = htmlFor || `${generatedId}-control`
  const labelId = `${generatedId}-label`
  const descriptionId = `${generatedId}-description`
  const errorId = `${generatedId}-error`
  const describedBy = [description && descriptionId, error && errorId].filter(Boolean).join(" ") || undefined
  const identity = { id, labelId, describedBy, invalid: Boolean(error) }
  return (
    <FieldIdentityContext.Provider value={group ? null : identity}>
      <Field className={className} data-invalid={Boolean(error)} role={group ? "group" : undefined} aria-labelledby={group ? labelId : undefined} aria-describedby={group ? describedBy : undefined}>
        {group ? <FieldLabel asChild><span id={labelId}>{label}</span></FieldLabel> : <FieldLabel id={labelId} htmlFor={id}>{label}</FieldLabel>}
        {children}
        {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </Field>
    </FieldIdentityContext.Provider>
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
