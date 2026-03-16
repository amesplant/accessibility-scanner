import * as React from "react"

import { cn } from "@/lib/utils"

// Small accessible listbox implementation. Not feature‑complete but covers the
// project's current needs (trigger, value display, content container and
// clickable items). Other helpers are exported as no‑ops so existing imports
// stay valid.

interface SelectContextValue {
  value: string
  onChange: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  listboxId: string
}

const SelectContext = React.createContext<SelectContextValue | undefined>(
  undefined
)

// -----------------------------------------------------------------------------
// root
// -----------------------------------------------------------------------------
export interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  children?: React.ReactNode
  className?: string
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ value, onValueChange, children, className, ...props }, ref) => {
    const [open, setOpen] = React.useState(false)
    const listboxId = React.useId()

    // close on outside click
    React.useEffect(() => {
      const handleDown = (e: MouseEvent) => {
        const target = e.target as Node
        if (open && ref && "current" in ref && ref.current && !ref.current.contains(target)) {
          setOpen(false)
        }
      }
      document.addEventListener("mousedown", handleDown)
      return () => document.removeEventListener("mousedown", handleDown)
    }, [open, ref])

    return (
      <SelectContext.Provider value={{ value, onChange: onValueChange, open, setOpen, listboxId }}>
        <div ref={ref} className={cn("relative", className)} {...props}>
          {children}
        </div>
      </SelectContext.Provider>
    )
  }
)
Select.displayName = "Select"

// -----------------------------------------------------------------------------
// trigger
// -----------------------------------------------------------------------------
export interface SelectTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode
}

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  SelectTriggerProps
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext)
  if (!ctx) {
    throw new Error("SelectTrigger must be used within a Select")
  }

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    ctx.setOpen(!ctx.open)
    props.onClick?.(e)
  }

  return (
    <button
      ref={ref}
      type="button"
      role="combobox"
      aria-expanded={ctx.open}
      aria-controls={ctx.listboxId}
      aria-haspopup="listbox"
      className={cn(
        "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
      onClick={handleClick}
    >
      {children}
      <span aria-hidden="true" className="ml-2">▾</span>
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

// -----------------------------------------------------------------------------
// value
// -----------------------------------------------------------------------------
export function SelectValue({ placeholder, children }: { placeholder?: string; children?: React.ReactNode }) {
  const ctx = React.useContext(SelectContext)
  if (!ctx) {
    throw new Error("SelectValue must be used within a Select")
  }
  return <span>{children ?? ctx.value ?? placeholder}</span>
}

// -----------------------------------------------------------------------------
// content
// -----------------------------------------------------------------------------
export interface SelectContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

export const SelectContent = React.forwardRef<
  HTMLDivElement,
  SelectContentProps
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext)
  if (!ctx || !ctx.open) return null

  return (
    <div
      id={ctx.listboxId}
      role="listbox"
      ref={ref}
      className={cn(
        "absolute z-50 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md min-w-full",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
SelectContent.displayName = "SelectContent"

// -----------------------------------------------------------------------------
// item
// -----------------------------------------------------------------------------
export interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  children?: React.ReactNode
}

export const SelectItem = React.forwardRef<
  HTMLDivElement,
  SelectItemProps
>(({ value, className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectContext)
  if (!ctx) {
    throw new Error("SelectItem must be used within a Select")
  }

  const selected = ctx.value === value

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      className={cn(
        "px-2 py-1 cursor-pointer",
        selected
          ? "bg-primary text-primary-foreground [&_*]:!text-primary-foreground"
          : "hover:bg-accent hover:text-accent-foreground [&:hover_*]:!text-accent-foreground",
        className
      )}
      onClick={() => {
        ctx.onChange(value)
        ctx.setOpen(false)
      }}
      {...props}
    >
      {children}
    </div>
  )
})
SelectItem.displayName = "SelectItem"

// remaining helpers are no‑ops/aliases for compatibility
export const SelectGroup: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div>{children}</div>
)

export const SelectLabel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={className} {...props}>
    {children}
  </div>
)

export const SelectSeparator: React.FC = () => <hr className="my-1" />
export const SelectScrollUpButton = () => null
export const SelectScrollDownButton = () => null
